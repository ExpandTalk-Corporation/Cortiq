/**
 * Content Tracking Analytics
 * Task #24: Content Tracking Advanced
 *
 * Handles element interactions, form analytics, and content heatmaps
 */

import { createClient } from '../_shared/supabase.ts';

interface ContentInteraction {
  element_id: string;
  element_type: string;
  page_url: string;
  interaction_type: string;
  mouse_x?: number;
  mouse_y?: number;
  view_duration?: number;
  hover_duration?: number;
  form_field_name?: string;
  form_field_type?: string;
  form_submission_status?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  viewport_width?: number;
  viewport_height?: number;
}

interface ContentElement {
  element_id: string;
  element_type: string;
  element_selector: string;
  element_text?: string;
  page_url: string;
  page_title?: string;
  section_name?: string;
  content_type?: string;
}

// Register content element
async function registerContentElement(
  supabase: any,
  siteId: string,
  element: ContentElement
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('content_elements')
      .upsert(
        {
          site_id: siteId,
          element_id: element.element_id,
          element_type: element.element_type,
          element_selector: element.element_selector,
          element_text: element.element_text,
          page_url: element.page_url,
          page_title: element.page_title,
          section_name: element.section_name,
          content_type: element.content_type,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'site_id,element_id,page_url',
        }
      );

    if (error) {
      console.error('Error registering content element:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in registerContentElement:', error);
    return false;
  }
}

// Track content interaction
async function trackContentInteraction(
  supabase: any,
  siteId: string,
  sessionId: string | null,
  interaction: ContentInteraction,
  visitorHash?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('content_interactions')
      .insert({
        site_id: siteId,
        session_id: sessionId,
        element_id: interaction.element_id,
        page_url: interaction.page_url,
        interaction_type: interaction.interaction_type,
        interaction_timestamp: new Date().toISOString(),
        mouse_x: interaction.mouse_x,
        mouse_y: interaction.mouse_y,
        view_duration: interaction.view_duration,
        hover_duration: interaction.hover_duration,
        form_field_name: interaction.form_field_name,
        form_field_type: interaction.form_field_type,
        form_submission_status: interaction.form_submission_status,
        device_type: interaction.device_type,
        browser: interaction.browser,
        os: interaction.os,
        viewport_width: interaction.viewport_width,
        viewport_height: interaction.viewport_height,
        visitor_hash: visitorHash,
      });

    if (error) {
      console.error('Error tracking interaction:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in trackContentInteraction:', error);
    return false;
  }
}

// Track heatmap point
async function trackHeatmapPoint(
  supabase: any,
  siteId: string,
  pageUrl: string,
  interactionType: string,
  x: number,
  y: number
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('content_heatmap_points')
      .upsert(
        {
          site_id: siteId,
          page_url: pageUrl,
          interaction_type: interactionType,
          date: today,
          x_coordinate: x,
          y_coordinate: y,
          intensity: 1,
          count: 1,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'site_id,page_url,interaction_type,date,x_coordinate,y_coordinate',
        }
      );

    if (error) {
      console.error('Error tracking heatmap:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in trackHeatmapPoint:', error);
    return false;
  }
}

// Track scroll depth
async function trackScrollDepth(
  supabase: any,
  siteId: string,
  sessionId: string | null,
  pageUrl: string,
  scrollDepth: number,
  timeOnPage: number,
  visitorHash?: string
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('scroll_depth')
      .insert({
        site_id: siteId,
        session_id: sessionId,
        page_url: pageUrl,
        visitor_hash: visitorHash,
        max_scroll_depth: scrollDepth,
        time_on_page: timeOnPage,
        session_date: today,
      });

    if (error) {
      console.error('Error tracking scroll depth:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in trackScrollDepth:', error);
    return false;
  }
}

// Get content performance
async function getContentPerformance(
  supabase: any,
  siteId: string,
  pageUrl?: string,
  dateRange?: { from: string; to: string }
): Promise<any[]> {
  try {
    let query = supabase
      .from('content_performance')
      .select('*')
      .eq('site_id', siteId);

    if (pageUrl) {
      query = query.eq('page_url', pageUrl);
    }

    if (dateRange) {
      query = query
        .gte('date', dateRange.from)
        .lte('date', dateRange.to);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('Error fetching content performance:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getContentPerformance:', error);
    return [];
  }
}

// Get form analytics
async function getFormAnalytics(
  supabase: any,
  siteId: string,
  formName?: string,
  dateRange?: { from: string; to: string }
): Promise<any[]> {
  try {
    let query = supabase
      .from('form_field_analytics')
      .select('*')
      .eq('site_id', siteId);

    if (formName) {
      query = query.eq('form_name', formName);
    }

    if (dateRange) {
      query = query
        .gte('date', dateRange.from)
        .lte('date', dateRange.to);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('Error fetching form analytics:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getFormAnalytics:', error);
    return [];
  }
}

// Get heatmap data
async function getHeatmapData(
  supabase: any,
  siteId: string,
  pageUrl: string,
  interactionType?: string,
  date?: string
): Promise<any[]> {
  try {
    let query = supabase
      .from('content_heatmap_points')
      .select('*')
      .eq('site_id', siteId)
      .eq('page_url', pageUrl);

    if (interactionType) {
      query = query.eq('interaction_type', interactionType);
    }

    if (date) {
      query = query.eq('date', date);
    }

    const { data, error } = await query.order('intensity', { ascending: false });

    if (error) {
      console.error('Error fetching heatmap:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getHeatmapData:', error);
    return [];
  }
}

// Main request handler
Deno.serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const path = url.pathname;

    // POST /content-tracking/element - Register content element
    if (path === '/content-tracking/element' && req.method === 'POST') {
      const body = await req.json();
      const { site_id, element } = body;

      if (!site_id || !element) {
        return new Response(
          JSON.stringify({ error: 'site_id and element required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const success = await registerContentElement(supabase, site_id, element);

      return new Response(
        JSON.stringify({ success }),
        {
          status: success ? 200 : 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // POST /content-tracking/interaction - Track interaction
    if (path === '/content-tracking/interaction' && req.method === 'POST') {
      const body = await req.json();
      const { site_id, session_id, interaction, visitor_hash } = body;

      if (!site_id || !interaction) {
        return new Response(
          JSON.stringify({ error: 'site_id and interaction required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const success = await trackContentInteraction(
        supabase,
        site_id,
        session_id,
        interaction,
        visitor_hash
      );

      // Also track heatmap if coordinates provided
      if (success && interaction.mouse_x !== undefined && interaction.mouse_y !== undefined) {
        await trackHeatmapPoint(
          supabase,
          site_id,
          interaction.page_url,
          interaction.interaction_type,
          interaction.mouse_x,
          interaction.mouse_y
        );
      }

      return new Response(
        JSON.stringify({ success }),
        {
          status: success ? 200 : 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // POST /content-tracking/scroll - Track scroll depth
    if (path === '/content-tracking/scroll' && req.method === 'POST') {
      const body = await req.json();
      const { site_id, session_id, page_url, scroll_depth, time_on_page, visitor_hash } = body;

      if (!site_id || !page_url || scroll_depth === undefined) {
        return new Response(
          JSON.stringify({ error: 'site_id, page_url, and scroll_depth required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const success = await trackScrollDepth(
        supabase,
        site_id,
        session_id,
        page_url,
        scroll_depth,
        time_on_page || 0,
        visitor_hash
      );

      return new Response(
        JSON.stringify({ success }),
        {
          status: success ? 200 : 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /content-tracking/performance - Get content performance
    if (path === '/content-tracking/performance' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const pageUrl = url.searchParams.get('page_url');
      const fromDate = url.searchParams.get('from');
      const toDate = url.searchParams.get('to');

      if (!siteId) {
        return new Response(
          JSON.stringify({ error: 'site_id required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const dateRange = (fromDate && toDate) ? { from: fromDate, to: toDate } : undefined;
      const performance = await getContentPerformance(
        supabase,
        siteId,
        pageUrl || undefined,
        dateRange
      );

      return new Response(
        JSON.stringify({ data: performance }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /content-tracking/forms - Get form analytics
    if (path === '/content-tracking/forms' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const formName = url.searchParams.get('form_name');
      const fromDate = url.searchParams.get('from');
      const toDate = url.searchParams.get('to');

      if (!siteId) {
        return new Response(
          JSON.stringify({ error: 'site_id required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const dateRange = (fromDate && toDate) ? { from: fromDate, to: toDate } : undefined;
      const analytics = await getFormAnalytics(supabase, siteId, formName || undefined, dateRange);

      return new Response(
        JSON.stringify({ data: analytics }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /content-tracking/heatmap - Get heatmap data
    if (path === '/content-tracking/heatmap' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const pageUrl = url.searchParams.get('page_url');
      const interactionType = url.searchParams.get('interaction_type');
      const date = url.searchParams.get('date');

      if (!siteId || !pageUrl) {
        return new Response(
          JSON.stringify({ error: 'site_id and page_url required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const heatmapData = await getHeatmapData(
        supabase,
        siteId,
        pageUrl,
        interactionType || undefined,
        date || undefined
      );

      return new Response(
        JSON.stringify({ data: heatmapData }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
