import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAID_MEDIUMS = ['cpc', 'ppc', 'paid', 'paid-social', 'display', 'paid_search', 'paidsearch'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { siteId, startDate, endDate } = await req.json();

    if (!siteId) {
      return new Response(
        JSON.stringify({ error: 'siteId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate ?? new Date().toISOString().split('T')[0];

    console.log('Click fraud analysis for site:', siteId, 'range:', start, '-', end);

    // 0. Optionally fetch Google Ads invalid clicks if API is configured
    const googleAdsData = await fetchGoogleAdsInvalidClicks(supabase, siteId, start, end);
    if (googleAdsData) {
      console.log('Google Ads API data fetched:', googleAdsData.length, 'campaigns');
    }

    // 1. Fetch paid sessions
    const { data: paidSessions, error: sessionsError } = await supabase
      .from('tracking_sessions')
      .select('session_id, utm_campaign, utm_source, utm_medium, duration_seconds, page_views, device_type, started_at')
      .eq('site_id', siteId)
      .in('utm_medium', PAID_MEDIUMS)
      .gte('started_at', `${start}T00:00:00.000Z`)
      .lte('started_at', `${end}T23:59:59.999Z`);

    if (sessionsError) throw sessionsError;
    if (!paidSessions || paidSessions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { total_paid_sessions: 0, estimated_fraud_sessions: 0, estimated_fraud_rate: 0, total_campaigns_analyzed: 0 },
          campaigns: [],
          time_distribution: [],
          suspicious_sessions: [],
          message: 'No paid sessions found in selected period'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paidSessionIds = paidSessions.map(s => s.session_id).filter(Boolean);

    // 2. Cross-reference: which paid sessions appear in bot traffic with fraud signals?
    const { data: botTraffic } = await supabase
      .from('ai_bot_traffic')
      .select('id, session_id, bot_type, bot_category, js_executed')
      .eq('site_id', siteId)
      .in('session_id', paidSessionIds.slice(0, 500)); // Supabase IN limit safeguard

    const botTrafficIds = botTraffic?.map(bt => bt.id).filter(Boolean) ?? [];

    const { data: probeSignals } = botTrafficIds.length > 0
      ? await supabase
          .from('ai_bot_probe_signals')
          .select('traffic_id, webdriver_detected, headless_detected')
          .in('traffic_id', botTrafficIds)
      : { data: [] };

    // Build lookup: session_id → bot signals
    const botSignalMap = new Map<string, { isBot: boolean; botType: string; webdriver: boolean; headless: boolean }>();

    if (botTraffic) {
      for (const bt of botTraffic) {
        if (!bt.session_id) continue;
        const probe = probeSignals?.find(p => p.traffic_id === bt.id) ?? null;
        botSignalMap.set(bt.session_id, {
          isBot: bt.bot_category === 'known_bot' || !!probe?.webdriver_detected || !!probe?.headless_detected,
          botType: bt.bot_type,
          webdriver: !!probe?.webdriver_detected,
          headless: !!probe?.headless_detected,
        });
      }
    }

    // 3. Score each session
    interface ScoredSession {
      session_id: string;
      campaign: string;
      source: string;
      medium: string;
      duration: number;
      page_views: number;
      device_type: string;
      hour: number;
      is_bot_confirmed: boolean;
      is_zombie: boolean; // < 5s + 1 page view
      is_suspicious_hour: boolean;
      fraud_score: number;
      bot_type?: string;
    }

    const scored: ScoredSession[] = paidSessions.map(session => {
      const bot = botSignalMap.get(session.session_id) ?? null;
      const duration = session.duration_seconds ?? 0;
      const pageViews = session.page_views ?? 1;
      const hour = session.started_at ? new Date(session.started_at).getUTCHours() : 12;

      const isBotConfirmed = !!bot?.isBot;
      const isZombie = duration < 5 && pageViews <= 1;
      const isSuspiciousHour = hour >= 1 && hour <= 5;

      // Fraud score 0–100
      let fraudScore = 0;
      if (isBotConfirmed) fraudScore += 60;
      if (bot?.webdriver) fraudScore += 20;
      if (bot?.headless) fraudScore += 10;
      if (isZombie) fraudScore += 30;
      if (isSuspiciousHour && isZombie) fraudScore += 10;
      fraudScore = Math.min(fraudScore, 100);

      return {
        session_id: session.session_id,
        campaign: session.utm_campaign ?? 'Unknown Campaign',
        source: session.utm_source ?? 'Unknown',
        medium: session.utm_medium ?? 'Unknown',
        duration,
        page_views: pageViews,
        device_type: session.device_type ?? 'unknown',
        hour,
        is_bot_confirmed: isBotConfirmed,
        is_zombie: isZombie,
        is_suspicious_hour: isSuspiciousHour,
        fraud_score: fraudScore,
        bot_type: bot?.botType,
      };
    });

    // 4. Aggregate by campaign
    const campaignMap = new Map<string, {
      campaign: string; source: string; medium: string;
      total: number; bot: number; zombie: number; suspicious_hour: number; fraud_score_sum: number;
    }>();

    for (const s of scored) {
      const key = `${s.campaign}||${s.source}||${s.medium}`;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, { campaign: s.campaign, source: s.source, medium: s.medium, total: 0, bot: 0, zombie: 0, suspicious_hour: 0, fraud_score_sum: 0 });
      }
      const c = campaignMap.get(key)!;
      c.total++;
      if (s.is_bot_confirmed) c.bot++;
      if (s.is_zombie) c.zombie++;
      if (s.is_suspicious_hour) c.suspicious_hour++;
      c.fraud_score_sum += s.fraud_score;
    }

    const campaigns = Array.from(campaignMap.values()).map(c => {
      const fraudRate = c.total > 0 ? (c.bot + c.zombie * 0.5) / c.total : 0;
      const avgScore = c.total > 0 ? c.fraud_score_sum / c.total : 0;
      // Merge Google Ads invalid click data if available
      const gaRow = googleAdsData?.find(g => g.campaign_name === c.campaign);
      let riskLevel: 'high' | 'medium' | 'low' = 'low';
      const gaInvalidRate = gaRow?.invalid_click_rate ?? 0;
      if (fraudRate > 0.15 || avgScore > 40 || gaInvalidRate > 0.10) riskLevel = 'high';
      else if (fraudRate > 0.07 || avgScore > 20 || gaInvalidRate > 0.05) riskLevel = 'medium';
      return {
        campaign: c.campaign,
        source: c.source,
        medium: c.medium,
        total_sessions: c.total,
        bot_sessions: c.bot,
        zombie_sessions: c.zombie,
        suspicious_hour_sessions: c.suspicious_hour,
        fraud_rate: Math.round(fraudRate * 1000) / 10,
        avg_fraud_score: Math.round(avgScore),
        risk_level: riskLevel,
        // Google Ads API data (present only when API is configured)
        ga_clicks: gaRow?.clicks ?? null,
        ga_invalid_clicks: gaRow?.invalid_clicks ?? null,
        ga_invalid_click_rate: gaRow ? Math.round(gaRow.invalid_click_rate * 1000) / 10 : null,
        ga_cost_micros: gaRow?.cost_micros ?? null,
      };
    }).sort((a, b) => b.avg_fraud_score - a.avg_fraud_score);

    // 5. Time distribution (UTC hours)
    const hourCounts = new Array(24).fill(0);
    for (const s of scored) hourCounts[s.hour]++;
    const avgHourCount = scored.length / 24;
    const timeDistribution = hourCounts.map((count, hour) => ({
      hour,
      count,
      suspicious: (hour >= 1 && hour <= 5) && count > avgHourCount * 1.5,
    }));

    // 6. Summary
    const estimatedFraud = scored.filter(s => s.fraud_score >= 40).length;
    const summary = {
      total_paid_sessions: scored.length,
      estimated_fraud_sessions: estimatedFraud,
      estimated_fraud_rate: scored.length > 0 ? Math.round(estimatedFraud / scored.length * 1000) / 10 : 0,
      total_campaigns_analyzed: campaignMap.size,
      bot_confirmed_sessions: scored.filter(s => s.is_bot_confirmed).length,
      zombie_sessions: scored.filter(s => s.is_zombie).length,
    };

    // 7. Top suspicious sessions
    const suspiciousSessions = scored
      .filter(s => s.fraud_score >= 40)
      .sort((a, b) => b.fraud_score - a.fraud_score)
      .slice(0, 25)
      .map(s => ({
        session_id: s.session_id.slice(0, 8) + '...',
        campaign: s.campaign,
        duration_seconds: s.duration,
        page_views: s.page_views,
        device_type: s.device_type,
        hour: s.hour,
        is_bot_confirmed: s.is_bot_confirmed,
        is_zombie: s.is_zombie,
        bot_type: s.bot_type,
        fraud_score: s.fraud_score,
      }));

    console.log('Analysis complete:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        campaigns,
        time_distribution: timeDistribution,
        suspicious_sessions: suspiciousSessions,
        google_ads_connected: !!googleAdsData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in click-fraud-analysis:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Google Ads API helpers ────────────────────────────────────────────────────

interface GaRow {
  campaign_name: string;
  clicks: number;
  invalid_clicks: number;
  invalid_click_rate: number;
  cost_micros: number;
}

async function fetchGoogleAdsInvalidClicks(
  supabase: any,
  siteId: string,
  startDate: string,
  endDate: string
): Promise<GaRow[] | null> {
  try {
    // Read stored credentials from site_integrations
    const { data: integration } = await supabase
      .from('site_integrations')
      .select('integration_config')
      .eq('site_id', siteId)
      .eq('integration_type', 'google_ads_api')
      .eq('is_active', true)
      .maybeSingle();

    if (!integration?.integration_config) return null;

    const cfg = integration.integration_config as any;
    const { developer_token, customer_id, client_id, client_secret, refresh_token, login_customer_id } = cfg;

    if (!developer_token || !customer_id || !client_id || !client_secret || !refresh_token) {
      return null;
    }

    // Exchange refresh token for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id,
        client_secret,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Google OAuth token error:', await tokenRes.text());
      return null;
    }

    const { access_token } = await tokenRes.json();

    // Build GAQL query for invalid clicks per campaign
    const query = `
      SELECT
        campaign.name,
        metrics.clicks,
        metrics.invalid_clicks,
        metrics.invalid_click_rate,
        metrics.cost_micros
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.clicks DESC
    `;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${access_token}`,
      'developer-token': developer_token,
      'Content-Type': 'application/json',
    };
    if (login_customer_id) {
      headers['login-customer-id'] = login_customer_id;
    }

    const adsRes = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customer_id}/googleAds:searchStream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      }
    );

    if (!adsRes.ok) {
      console.error('Google Ads API error:', adsRes.status, await adsRes.text());
      return null;
    }

    const adsText = await adsRes.text();
    // searchStream returns newline-delimited JSON objects
    const rows: GaRow[] = [];
    for (const line of adsText.split('\n')) {
      if (!line.trim() || line.trim() === '[' || line.trim() === ']') continue;
      try {
        const obj = JSON.parse(line.replace(/^,/, ''));
        for (const result of obj?.results ?? []) {
          rows.push({
            campaign_name: result.campaign?.name ?? '',
            clicks: Number(result.metrics?.clicks ?? 0),
            invalid_clicks: Number(result.metrics?.invalidClicks ?? 0),
            invalid_click_rate: Number(result.metrics?.invalidClickRate ?? 0),
            cost_micros: Number(result.metrics?.costMicros ?? 0),
          });
        }
      } catch {
        // skip malformed lines
      }
    }

    console.log('Google Ads API returned', rows.length, 'campaign rows');
    return rows.length > 0 ? rows : null;

  } catch (err) {
    console.error('fetchGoogleAdsInvalidClicks error:', err);
    return null;
  }
}
