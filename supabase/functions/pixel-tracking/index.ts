import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';
import { sanitizeInteraction } from '../_shared/interaction.js';

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface TrackingEvent {
  type: string;
  siteId: string;
  sessionId: string;
  data: any;
  events?: any[];
  // The visitor's analytics choice, set by the caller after its consent check. Without it
  // nothing is stored: this endpoint keeps sessions, page views and per-element clicks.
  consent?: { analytics?: boolean };
  analytics_consent?: boolean;
}

function hasAnalyticsConsent(event: TrackingEvent): boolean {
  return event.consent?.analytics === true || event.analytics_consent === true;
}

function validateTrackingId(id: string): boolean {
  return /^tk_[a-f0-9]{32}$/.test(id);
}

function validateSessionId(id: string): boolean {
  // Accept UUID format or legacy sess_ format
  return /^[a-f0-9\-]{36}$/.test(id) || /^sess_\d+_[a-z0-9]+$/i.test(id);
}

serve(async (req) => {
  // Always return CORS headers
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200,
        headers: corsHeaders 
      });
    }

    if (req.method === 'GET') {
      return new Response('Pixel tracking endpoint active', { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    if (req.method === 'POST') {
      console.log('POST request received');
      
      let event: TrackingEvent;
      try {
        event = await req.json();
      } catch (error) {
        console.error('JSON parse error:', error);
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Extract siteId and sessionId
      const siteId = event.siteId || (event as any).tracking_id;
      const sessionId = event.sessionId || (event as any).session_id;
      
      console.log('Extracted IDs:', { siteId, sessionId });
      
      if (!siteId) {
        console.error('Missing siteId/tracking_id');
        return new Response(JSON.stringify({ error: 'Missing site ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!sessionId) {
        console.error('Missing sessionId/session_id');
        return new Response(JSON.stringify({ error: 'Missing session ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!validateTrackingId(siteId)) {
        console.error('Invalid tracking ID format:', siteId);
        return new Response(JSON.stringify({ error: 'Invalid tracking ID format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!hasAnalyticsConsent(event)) {
        return new Response(JSON.stringify({ success: true, stored: false, reason: 'no_analytics_consent' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get site info
      const { data: site, error: siteError } = await supabase
        .from('sites')
        .select('id')
        .eq('tracking_id', siteId)
        .maybeSingle();

      if (siteError) {
        console.error('Site lookup error:', siteError);
        return new Response(JSON.stringify({ error: 'Database error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!site) {
        console.error('Site not found for tracking ID:', siteId);
        return new Response(JSON.stringify({ error: 'Invalid tracking ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Handle batch events
      if (event.type === 'batch' && event.events) {
        console.log('Processing batch events, count:', event.events.length);
        
        // Process each event in the batch
        for (const batchEvent of event.events) {
          try {
            await processSingleEvent(batchEvent, site.id, sessionId);
          } catch (error) {
            console.error('Error processing batch event:', error);
            // Continue with other events
          }
        }
      } else {
        // Process single event
        await processSingleEvent(event, site.id, sessionId);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Global error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function processSingleEvent(event: any, siteId: string, sessionId: string) {
  const eventType = event.type || event.event_type;
  
  console.log('Processing event type:', eventType, 'for site:', siteId);
  
  try {
    switch (eventType) {
      case 'session_start':
        await handleSessionStart(event, siteId, sessionId);
        break;
      case 'pageview':
      case 'page_view':
        await handlePageView(event, siteId, sessionId);
        break;
      case 'interaction':
        await handleInteraction(event, siteId, sessionId);
        break;
      case 'session_update':
        await handleSessionUpdate(event, siteId, sessionId);
        break;
      case 'performance':
        await handlePerformance(event, siteId, sessionId);
        break;
      case 'first_interaction':
        await handleFirstInteraction(event, siteId, sessionId);
        break;
      default:
        console.warn('Unknown event type:', eventType);
    }
  } catch (error) {
    console.error('Error processing event:', eventType, error);
    throw error;
  }
}

async function handleSessionStart(event: any, siteId: string, sessionId: string) {
  const data = event.data || event;
  
  // Check if session exists
  const { data: existingSession } = await supabase
    .from('tracking_sessions')
    .select('id')
    .eq('session_id', sessionId)
    .eq('site_id', siteId)
    .limit(1)
    .maybeSingle();

  if (existingSession) {
    console.log('Session already exists for session_id:', sessionId);
    return;
  }

  // Create new session
  const sessionData = {
    site_id: siteId,
    session_id: sessionId,
    user_agent: data.userAgent?.substring(0, 255) || null,
    referrer: data.referrer || null,
    referrer_url: data.referrer || null,
    device_type: data.deviceType || 'unknown',
    browser: extractBrowser(data.userAgent) || null,
    os: extractOS(data.userAgent) || null,
    screen_width: data.screenWidth || null,
    screen_height: data.screenHeight || null,
    viewport_width: data.viewportWidth || null,
    viewport_height: data.viewportHeight || null,
    utm_source: data.utm_source || null,
    utm_medium: data.utm_medium || null,
    utm_campaign: data.utm_campaign || null,
    utm_term: data.utm_term || null,
    utm_content: data.utm_content || null,
    started_at: new Date().toISOString(),
    last_activity: new Date().toISOString()
  };

  const { error } = await supabase
    .from('tracking_sessions')
    .insert(sessionData);

  if (error) {
    console.error('Session insert error:', error);
    throw error;
  }
}

// page_views.session_id and user_interactions.session_id reference tracking_sessions(id), a
// uuid, not the client's session id text. Creates the visit when it does not exist yet.
async function sessionRowId(event: any, siteId: string, sessionId: string): Promise<string | null> {
  const find = () => supabase
    .from('tracking_sessions')
    .select('id')
    .eq('session_id', sessionId)
    .eq('site_id', siteId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let { data: row } = await find();
  if (!row) {
    await handleSessionStart(event, siteId, sessionId);
    ({ data: row } = await find());
  }
  return row?.id ?? null;
}

async function handlePageView(event: any, siteId: string, sessionId: string) {
  const data = event.data || event;
  const sessionRow = await sessionRowId(event, siteId, sessionId);
  if (!sessionRow) throw new Error('No tracking session for page view');

  const pageViewData = {
    site_id: siteId,
    session_id: sessionRow,
    url: data.url || data.href || event.url || 'unknown',
    title: data.title || null,
    referrer: data.referrer || null,
    viewed_at: new Date().toISOString()
  };

  console.log('Inserting page view:', pageViewData);

  const { error } = await supabase
    .from('page_views')
    .insert(pageViewData);

  if (error) {
    console.error('Page view insert error:', error);
    throw error;
  }
}

async function handleInteraction(event: any, siteId: string, sessionId: string) {
  const data = event.data || event;
  const sessionRow = await sessionRowId(event, siteId, sessionId);
  if (!sessionRow) return;
  const url = data.url || event.url || null;

  // The click needs a page view in its visit (user_interactions.page_view_id is required).
  const { data: pageView } = await supabase
    .from('page_views')
    .select('id')
    .eq('session_id', sessionRow)
    .eq('site_id', siteId)
    .limit(1)
    .maybeSingle();
  if (!pageView) {
    const { error: pageViewError } = await supabase.from('page_views').insert({
      site_id: siteId,
      session_id: sessionRow,
      url: url || 'unknown',
      title: data.title || event.title || null,
      viewed_at: new Date().toISOString()
    });
    if (pageViewError) {
      console.error('Failed to create page view:', pageViewError);
      return;
    }
  }

  // user_interactions has no site_id: the row is tied to the site through its session and
  // page view, which record_user_interaction resolves.
  const clean = sanitizeInteraction({
    interaction_type: `${data.type || 'unknown'}_general`,
    element_tag: data.element?.tagName,
    element_id: data.element?.id,
    element_class: data.element?.className,
    element_text: data.element?.text,
    href: data.element?.href,
  });
  if (clean) {
    const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
    const { error } = await supabase.rpc('record_user_interaction', {
      p_site_id: siteId,
      p_session: sessionId,
      p_url: url,
      p_type: clean.interaction_type,
      p_element_tag: clean.element_tag,
      p_element_id: clean.element_id,
      p_element_class: clean.element_class,
      p_element_text: clean.element_text,
      p_element_href: clean.element_href,
      p_x: int(data.x),
      p_y: int(data.y),
      p_scroll: int(data.scrollTop),
      p_at: new Date().toISOString(),
    });
    if (error) {
      console.error('Interaction insert error:', error);
    }
  }

  // Update heatmap data using GDPR-compliant grid system
  if ((data.type === 'click' || data.type === 'mousemove') && data.x && data.y) {
    try {
      const currentUrl = url || 'unknown';
      console.log('Updating heatmap grid with URL:', currentUrl, 'coordinates:', data.x, data.y);
      
      // Convert exact coordinates to 50x50 grid for GDPR compliance
      const viewportWidth = data.viewportWidth || 1920;
      const viewportHeight = data.viewportHeight || 1080;
      
      const gridX = Math.floor((data.x / viewportWidth) * 50);
      const gridY = Math.floor((data.y / viewportHeight) * 50);
      
      // Ensure grid coordinates are within bounds
      const clampedGridX = Math.max(0, Math.min(49, gridX));
      const clampedGridY = Math.max(0, Math.min(49, gridY));
      
      await supabase.rpc('increment_heatmap_grid_intensity', {
        p_site_id: siteId,
        p_url: currentUrl,
        p_device_type: data.deviceType || 'desktop',
        p_grid_x: clampedGridX,
        p_grid_y: clampedGridY,
        p_type: data.type,
        p_date: new Date().toISOString().split('T')[0],
        p_viewport_width: viewportWidth,
        p_viewport_height: viewportHeight
      });
      
      console.log('Heatmap grid data updated successfully');
    } catch (error) {
      console.error('Heatmap grid update error:', error);
    }
  }
}

async function handleSessionUpdate(event: any, siteId: string, sessionId: string) {
  const data = event.data || event;
  
  const { error } = await supabase
    .from('tracking_sessions')
    .update({
      duration_seconds: Math.round((data.duration || 0) / 1000),
      last_activity: new Date().toISOString()
    })
    .eq('session_id', sessionId)
    .eq('site_id', siteId);

  if (error) {
    console.error('Session update error:', error);
  }
}

async function handlePerformance(event: any, siteId: string, sessionId: string) {
  // Log performance metrics but don't store them in database for now
  const data = event.data || event;
  console.log('Performance metrics:', {
    siteId,
    sessionId,
    pageLoadTime: data.pageLoadTime,
    domContentLoaded: data.domContentLoaded,
    firstPaint: data.firstPaint
  });
}

async function handleFirstInteraction(event: any, siteId: string, sessionId: string) {
  // Update session with first interaction timing
  const data = event.data || event;
  
  try {
    const { error } = await supabase
      .from('tracking_sessions')
      .update({
        last_activity: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .eq('site_id', siteId);

    if (error) {
      console.error('First interaction update error:', error);
    }
  } catch (error) {
    console.error('First interaction handling error:', error);
  }
}

function extractBrowser(userAgent: string | null): string | null {
  if (!userAgent) return null;
  
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  
  return 'Other';
}

function extractOS(userAgent: string | null): string | null {
  if (!userAgent) return null;
  
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  
  return 'Other';
}