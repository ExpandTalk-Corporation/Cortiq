import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface AlertRule {
  id: string;
  site_id: string;
  alert_type: string;
  alert_name: string;
  threshold_config: any;
  is_active: boolean;
  severity: string;
}

interface AnalysisResult {
  alertsTriggered: number;
  incidentsCreated: number;
  analysisDate: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteId, analysisType = 'all' } = await req.json();
    
    if (!siteId) {
      return new Response(
        JSON.stringify({ error: 'Site ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting behavioral analysis for site: ${siteId}, type: ${analysisType}`);

    // Get active alert rules for this site
    const { data: alertRules, error: rulesError } = await supabase
      .from('behavioral_alerts')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_active', true);

    if (rulesError) {
      console.error('Error fetching alert rules:', rulesError);
      throw rulesError;
    }

    if (!alertRules || alertRules.length === 0) {
      console.log('No active alert rules found for site');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active alert rules found',
          alertsTriggered: 0,
          incidentsCreated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysisResults: AnalysisResult = {
      alertsTriggered: 0,
      incidentsCreated: 0,
      analysisDate: new Date().toISOString()
    };

    // Analyze each alert rule
    for (const rule of alertRules) {
      console.log(`Analyzing rule: ${rule.alert_type} - ${rule.alert_name}`);
      
      try {
        const incident = await analyzeRule(rule, siteId);
        if (incident) {
          analysisResults.alertsTriggered++;
          analysisResults.incidentsCreated++;
          console.log(`Created incident for rule: ${rule.alert_name}`);
        }
      } catch (error) {
        console.error(`Error analyzing rule ${rule.alert_name}:`, error);
      }
    }

    console.log(`Analysis complete. Results:`, analysisResults);

    return new Response(
      JSON.stringify({
        success: true,
        results: analysisResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in behavioral analysis:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeRule(rule: AlertRule, siteId: string): Promise<boolean> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  switch (rule.alert_type) {
    case 'rage_clicks':
      return await analyzeRageClicks(rule, siteId, oneHourAgo);
    case 'high_bounce_rate':
      return await analyzeHighBounceRate(rule, siteId, oneDayAgo);
    case 'form_abandonment':
      return await analyzeFormAbandonment(rule, siteId, oneDayAgo);
    case 'session_timeout':
      return await analyzeSessionTimeout(rule, siteId, oneHourAgo);
    case 'mobile_conversion_drop':
      return await analyzeMobileConversionDrop(rule, siteId, oneDayAgo);
    default:
      console.warn(`Unknown alert type: ${rule.alert_type}`);
      return false;
  }
}

async function analyzeRageClicks(rule: AlertRule, siteId: string, since: Date): Promise<boolean> {
  const config = rule.threshold_config;
  const clicksThreshold = config.clicks_threshold || 5;
  const timeWindowSeconds = config.time_window_seconds || 3;

  // Query heatmap data for rapid clicks on same coordinates
  const { data: clickData, error } = await supabase
    .from('heatmap_data')
    .select('x_coordinate, y_coordinate, url, created_at, element_selector')
    .eq('site_id', siteId)
    .eq('interaction_type', 'click')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error || !clickData) {
    console.error('Error fetching click data:', error);
    return false;
  }

  // Group clicks by location and check for rage clicking patterns
  const clickGroups = new Map();
  
  for (const click of clickData) {
    const key = `${click.x_coordinate}-${click.y_coordinate}-${click.url}`;
    if (!clickGroups.has(key)) {
      clickGroups.set(key, []);
    }
    clickGroups.get(key).push(click);
  }

  let rageClicksDetected = false;

  for (const [location, clicks] of clickGroups) {
    if (clicks.length >= clicksThreshold) {
      // Check if clicks occurred within time window
      clicks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      for (let i = 0; i <= clicks.length - clicksThreshold; i++) {
        const firstClick = new Date(clicks[i].created_at);
        const lastClick = new Date(clicks[i + clicksThreshold - 1].created_at);
        const timeDiff = (lastClick.getTime() - firstClick.getTime()) / 1000;
        
        if (timeDiff <= timeWindowSeconds) {
          await createIncident(rule, siteId, {
            type: 'rage_clicks',
            location: location,
            clicks_count: clicksThreshold,
            time_window: timeDiff,
            url: clicks[0].url,
            element_selector: clicks[0].element_selector
          });
          rageClicksDetected = true;
          break;
        }
      }
    }
  }

  return rageClicksDetected;
}

async function analyzeHighBounceRate(rule: AlertRule, siteId: string, since: Date): Promise<boolean> {
  const config = rule.threshold_config;
  const bounceRateThreshold = config.bounce_rate_threshold || 80;
  const minPageViews = config.page_views_minimum || 10;

  // Calculate bounce rate from tracking sessions
  const { data: sessionData, error } = await supabase
    .from('tracking_sessions')
    .select('page_views, duration_seconds')
    .eq('site_id', siteId)
    .gte('started_at', since.toISOString());

  if (error || !sessionData || sessionData.length < minPageViews) {
    return false;
  }

  const bouncedSessions = sessionData.filter(session => 
    session.page_views <= 1 || session.duration_seconds < 10
  ).length;

  const bounceRate = (bouncedSessions / sessionData.length) * 100;

  if (bounceRate > bounceRateThreshold) {
    await createIncident(rule, siteId, {
      type: 'high_bounce_rate',
      bounce_rate: bounceRate,
      total_sessions: sessionData.length,
      bounced_sessions: bouncedSessions,
      threshold: bounceRateThreshold
    });
    return true;
  }

  return false;
}

async function analyzeFormAbandonment(rule: AlertRule, siteId: string, since: Date): Promise<boolean> {
  const config = rule.threshold_config;
  const abandonmentThreshold = config.abandonment_rate_threshold || 70;
  const minFormStarts = config.minimum_form_starts || 5;

  // Get form analytics data
  const { data: formData, error } = await supabase
    .from('form_sessions')
    .select('form_id, form_type, completed_at, abandoned_at')
    .eq('site_id', siteId)
    .gte('started_at', since.toISOString());

  if (error || !formData || formData.length < minFormStarts) {
    return false;
  }

  // Group by form and calculate abandonment rates
  const formGroups = new Map();
  
  for (const session of formData) {
    const key = session.form_id;
    if (!formGroups.has(key)) {
      formGroups.set(key, { total: 0, abandoned: 0, form_type: session.form_type });
    }
    
    const group = formGroups.get(key);
    group.total++;
    
    if (session.abandoned_at && !session.completed_at) {
      group.abandoned++;
    }
  }

  let highAbandonmentDetected = false;

  for (const [formId, stats] of formGroups) {
    if (stats.total >= minFormStarts) {
      const abandonmentRate = (stats.abandoned / stats.total) * 100;
      
      if (abandonmentRate > abandonmentThreshold) {
        await createIncident(rule, siteId, {
          type: 'form_abandonment',
          form_id: formId,
          form_type: stats.form_type,
          abandonment_rate: abandonmentRate,
          total_sessions: stats.total,
          abandoned_sessions: stats.abandoned,
          threshold: abandonmentThreshold
        });
        highAbandonmentDetected = true;
      }
    }
  }

  return highAbandonmentDetected;
}

async function analyzeSessionTimeout(rule: AlertRule, siteId: string, since: Date): Promise<boolean> {
  const config = rule.threshold_config;
  const minDuration = config.min_duration_seconds || 5;
  const maxDuration = config.max_duration_seconds || 3600;

  const { data: sessionData, error } = await supabase
    .from('tracking_sessions')
    .select('session_id, duration_seconds, started_at')
    .eq('site_id', siteId)
    .gte('started_at', since.toISOString())
    .or(`duration_seconds.lt.${minDuration},duration_seconds.gt.${maxDuration}`);

  if (error || !sessionData || sessionData.length === 0) {
    return false;
  }

  const abnormalSessions = sessionData.length;
  const veryShort = sessionData.filter(s => s.duration_seconds < minDuration).length;
  const veryLong = sessionData.filter(s => s.duration_seconds > maxDuration).length;

  if (abnormalSessions > 0) {
    await createIncident(rule, siteId, {
      type: 'session_timeout',
      abnormal_sessions: abnormalSessions,
      very_short_sessions: veryShort,
      very_long_sessions: veryLong,
      min_threshold: minDuration,
      max_threshold: maxDuration
    });
    return true;
  }

  return false;
}

async function analyzeMobileConversionDrop(rule: AlertRule, siteId: string, since: Date): Promise<boolean> {
  const config = rule.threshold_config;
  const dropThreshold = config.conversion_drop_percentage || 30;
  const ratioThreshold = config.desktop_mobile_ratio_threshold || 2.0;

  // Get conversion data by device type
  const { data: conversionData, error } = await supabase
    .from('form_sessions')
    .select('device_type, completed_at, abandoned_at')
    .eq('site_id', siteId)
    .gte('started_at', since.toISOString())
    .in('device_type', ['mobile', 'desktop']);

  if (error || !conversionData || conversionData.length < 10) {
    return false;
  }

  const stats = { mobile: { total: 0, conversions: 0 }, desktop: { total: 0, conversions: 0 } };

  for (const session of conversionData) {
    const deviceType = session.device_type || 'desktop';
    if (stats[deviceType]) {
      stats[deviceType].total++;
      if (session.completed_at) {
        stats[deviceType].conversions++;
      }
    }
  }

  const mobileRate = stats.mobile.total > 0 ? (stats.mobile.conversions / stats.mobile.total) * 100 : 0;
  const desktopRate = stats.desktop.total > 0 ? (stats.desktop.conversions / stats.desktop.total) * 100 : 0;

  const conversionRatio = mobileRate > 0 ? desktopRate / mobileRate : 0;
  const dropPercentage = desktopRate > 0 ? ((desktopRate - mobileRate) / desktopRate) * 100 : 0;

  if (dropPercentage > dropThreshold || conversionRatio > ratioThreshold) {
    await createIncident(rule, siteId, {
      type: 'mobile_conversion_drop',
      mobile_conversion_rate: mobileRate,
      desktop_conversion_rate: desktopRate,
      conversion_ratio: conversionRatio,
      drop_percentage: dropPercentage,
      mobile_sessions: stats.mobile.total,
      desktop_sessions: stats.desktop.total
    });
    return true;
  }

  return false;
}

async function createIncident(rule: AlertRule, siteId: string, incidentData: any): Promise<void> {
  const { error } = await supabase
    .from('behavioral_incidents')
    .insert({
      site_id: siteId,
      alert_id: rule.id,
      incident_type: rule.alert_type,
      incident_data: incidentData,
      severity: rule.severity,
      status: 'open'
    });

  if (error) {
    console.error('Error creating incident:', error);
    throw error;
  }
}