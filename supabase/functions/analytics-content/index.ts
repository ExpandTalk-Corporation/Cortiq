import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract API key from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = authHeader.replace('Bearer ', '');

    // Extract path parameters
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    const companyId = pathParts[pathParts.length - 2];
    const contentId = pathParts[pathParts.length - 1];

    // Extract query parameters
    const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
    const granularity = url.searchParams.get('granularity') || 'day';

    console.log('Analytics request:', { companyId, contentId, from, to, granularity });

    // Validate company API key
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('api_key', apiKey)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (companyId !== company.id) {
      return new Response(
        JSON.stringify({ error: 'Company ID does not match API key' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch analytics summary
    const { data: summaryData, error: summaryError } = await supabase
      .from('analytics_summary')
      .select('*')
      .eq('company_id', companyId)
      .eq('content_id', contentId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (summaryError) {
      console.error('Error fetching analytics summary:', summaryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch analytics data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total metrics
    const totalViews = summaryData.reduce((sum, row) => sum + (row.views || 0), 0);
    const totalClicks = summaryData.reduce((sum, row) => sum + (row.clicks || 0), 0);
    const totalConversions = summaryData.reduce((sum, row) => sum + (row.conversions || 0), 0);
    const totalSubmissions = summaryData.reduce((sum, row) => sum + (row.submissions || 0), 0);

    const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Aggregate by platform
    const platformStats = summaryData.reduce((acc, row) => {
      const platform = row.platform || 'unknown';
      if (!acc[platform]) {
        acc[platform] = { platform, views: 0, clicks: 0, conversions: 0, submissions: 0 };
      }
      acc[platform].views += row.views || 0;
      acc[platform].clicks += row.clicks || 0;
      acc[platform].conversions += row.conversions || 0;
      acc[platform].submissions += row.submissions || 0;
      return acc;
    }, {} as Record<string, any>);

    const topPlatforms = Object.values(platformStats)
      .sort((a: any, b: any) => b.views - a.views);

    // Generate timeline
    const timeline = summaryData.map(row => ({
      date: row.date,
      views: row.views || 0,
      clicks: row.clicks || 0,
      conversions: row.conversions || 0,
      submissions: row.submissions || 0
    }));

    // Generate simple recommendations
    const recommendations = [];
    if (topPlatforms.length > 0) {
      const bestPlatform = topPlatforms[0] as any;
      const bestCR = bestPlatform.clicks > 0 
        ? ((bestPlatform.conversions / bestPlatform.clicks) * 100).toFixed(2)
        : 0;
      recommendations.push(`${bestPlatform.platform} har flest visningar (${bestPlatform.views}) och ${bestCR}% conversion rate`);
    }

    if (ctr < 2) {
      recommendations.push('CTR är låg (<2%). Överväg att optimera innehållet eller rubriken.');
    } else if (ctr > 5) {
      recommendations.push(`Stark CTR (${ctr.toFixed(2)}%)! Detta innehåll presterar bra.`);
    }

    // Get content type from first record
    const contentType = summaryData[0]?.content_type || 'unknown';

    return new Response(
      JSON.stringify({
        content_id: contentId,
        content_type: contentType,
        metrics: {
          total_views: totalViews,
          total_clicks: totalClicks,
          total_conversions: totalConversions,
          total_submissions: totalSubmissions,
          ctr: parseFloat(ctr.toFixed(2)),
          conversion_rate: parseFloat(conversionRate.toFixed(2))
        },
        timeline,
        top_platforms: topPlatforms,
        recommendations
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analytics-content function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
