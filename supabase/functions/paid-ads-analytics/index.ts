import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteId, startDate, endDate } = await req.json();

    if (!siteId) {
      return new Response(
        JSON.stringify({ error: 'siteId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        started_at: { 
          gte: `${startDate}T00:00:00.000Z`,
          lte: `${endDate}T23:59:59.999Z`
        }
      };
    }

    console.log('Fetching paid ads data for site:', siteId, 'dates:', startDate, endDate);

    // Fetch all sessions with UTM parameters (paid traffic)
    const { data: sessions, error: sessionsError } = await supabaseClient
      .from('tracking_sessions')
      .select(`
        session_id,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        referrer_url,
        started_at,
        duration_seconds,
        page_views,
        device_type
      `)
      .eq('site_id', siteId)
      .not('utm_medium', 'is', null)
      .in('utm_medium', ['cpc', 'ppc', 'paid-social', 'display', 'paid'])
      .gte('started_at', startDate ? `${startDate}T00:00:00.000Z` : '1970-01-01')
      .lte('started_at', endDate ? `${endDate}T23:59:59.999Z` : '2099-12-31');

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      throw sessionsError;
    }

    console.log(`Found ${sessions?.length || 0} paid sessions`);

    // Fetch conversion events for these sessions
    const sessionIds = sessions?.map(s => s.session_id) || [];
    
    let conversions: any[] = [];
    if (sessionIds.length > 0) {
      const { data: conversionData, error: conversionError } = await supabaseClient
        .from('conversion_events')
        .select('session_id, event_value, event_name')
        .in('session_id', sessionIds);

      if (conversionError) {
        console.error('Error fetching conversions:', conversionError);
      } else {
        conversions = conversionData || [];
      }
    }

    // Aggregate data by campaign
    const campaignMetrics: Record<string, any> = {};
    const sourceMetrics: Record<string, any> = {};
    const monthlyMetrics: Record<string, any> = {};

    sessions?.forEach((session: any) => {
      const campaign = session.utm_campaign || 'Unknown Campaign';
      const source = session.utm_source || 'Unknown';
      const medium = session.utm_medium || 'Unknown';
      const month = session.started_at ? session.started_at.substring(0, 7) : '';
      
      // Count conversions for this session
      const sessionConversions = conversions.filter(c => c.session_id === session.session_id);
      const sessionRevenue = sessionConversions.reduce((sum, c) => sum + (parseFloat(c.event_value) || 0), 0);
      const conversionCount = sessionConversions.length;

      // Campaign-level
      if (!campaignMetrics[campaign]) {
        campaignMetrics[campaign] = {
          campaign,
          source,
          medium,
          sessions: 0,
          pageViews: 0,
          conversions: 0,
          revenue: 0,
          totalDuration: 0,
          devices: { desktop: 0, mobile: 0, tablet: 0 }
        };
      }

      campaignMetrics[campaign].sessions += 1;
      campaignMetrics[campaign].pageViews += session.page_views || 0;
      campaignMetrics[campaign].conversions += conversionCount;
      campaignMetrics[campaign].revenue += sessionRevenue;
      campaignMetrics[campaign].totalDuration += session.duration_seconds || 0;
      
      const deviceType = session.device_type || 'desktop';
      if (campaignMetrics[campaign].devices[deviceType] !== undefined) {
        campaignMetrics[campaign].devices[deviceType] += 1;
      }

      // Source-level
      const sourceKey = `${source}/${medium}`;
      if (!sourceMetrics[sourceKey]) {
        sourceMetrics[sourceKey] = {
          source: sourceKey,
          sessions: 0,
          conversions: 0,
          revenue: 0
        };
      }

      sourceMetrics[sourceKey].sessions += 1;
      sourceMetrics[sourceKey].conversions += conversionCount;
      sourceMetrics[sourceKey].revenue += sessionRevenue;

      // Monthly
      if (month && !monthlyMetrics[month]) {
        monthlyMetrics[month] = {
          month,
          sessions: 0,
          conversions: 0,
          revenue: 0
        };
      }

      if (month) {
        monthlyMetrics[month].sessions += 1;
        monthlyMetrics[month].conversions += conversionCount;
        monthlyMetrics[month].revenue += sessionRevenue;
      }
    });

    // Calculate derived metrics for campaigns
    const campaigns = Object.values(campaignMetrics).map((campaign: any) => ({
      ...campaign,
      avgDuration: campaign.sessions > 0 ? campaign.totalDuration / campaign.sessions : 0,
      conversionRate: campaign.sessions > 0 ? (campaign.conversions / campaign.sessions * 100) : 0,
      revenuePerSession: campaign.sessions > 0 ? campaign.revenue / campaign.sessions : 0
    }));

    // Calculate overall totals
    const totalSessions = sessions?.length || 0;
    const totalPageViews = sessions?.reduce((sum, s) => sum + (s.page_views || 0), 0) || 0;
    const totalConversions = conversions.length;
    const totalRevenue = conversions.reduce((sum, c) => sum + (parseFloat(c.event_value) || 0), 0);
    const avgDuration = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / Math.max(totalSessions, 1);

    console.log('Analytics summary:', {
      totalSessions,
      totalConversions,
      totalRevenue,
      campaigns: campaigns.length
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalSessions,
          totalPageViews,
          totalConversions,
          totalRevenue,
          avgDuration,
          conversionRate: totalSessions > 0 ? (totalConversions / totalSessions * 100) : 0
        },
        campaigns,
        sources: Object.values(sourceMetrics),
        monthly: Object.values(monthlyMetrics).sort((a: any, b: any) => a.month.localeCompare(b.month)),
        rawSessions: sessions?.length || 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in paid-ads-analytics:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
