// Click-fraud analysis for paid traffic.
//
// 1. CortIQ's own signals come from get_click_fraud_signals (migration 20261117000005), called
//    with the caller's JWT so the RPC's ownership check applies. Works without Google Ads.
// 2. If the site has Google Ads connected (Settings → Integrations), billed clicks, Google's
//    invalid clicks, placements and location targets are added via GAQL. Each Ads query is
//    independent; a failure leaves that part out and is reported in `ads.errors`.
// 3. Days and campaigns are scored by _shared/click-fraud-score.ts; every signal has a reason.
//
// No click ids, session tokens or IPs are returned. Datacenter detection is not available
// (CortIQ does not store IP addresses).

import { createClient } from '../_shared/supabase.ts';
import { requireSiteAccess } from '../_shared/site-access.ts';
import { type AdsAuth, fromMicros, gaqlDate, isAdsAuth, loadSiteAdsAuth, searchStream } from '../_shared/google-ads.ts';
import {
  type AdsCounts, exclusionCandidates, geoCheck, type PlacementRow, refundGuidance, scoreSignals, type SignalCounts,
} from '../_shared/click-fraud-score.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const validDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const CAVEATS = [
  'Scores rank days and campaigns worth a closer look; they are not proof of fraud. Google decides refunds.',
  'CortIQ only sees visitors who allowed tracking, so session counts are lower than Ads clicks.',
  'Datacenter/VPN detection is not available: CortIQ does not store IP addresses.',
  'Country comes from the browser time zone and is approximate.',
  'CortIQ dates are UTC; Google Ads dates are in the account time zone.',
];

interface AdsCampaign extends AdsCounts {
  id: string;
  name: string;
  conversions: number;
  targeted_countries: string[];
}

interface AdsData {
  connected: boolean;
  code?: string;
  message?: string;
  currency?: string | null;
  customerId?: string | null;
  campaigns: AdsCampaign[];
  days: Record<string, AdsCounts>;
  placements: PlacementRow[];
  errors: string[];
}

async function loadAds(auth: AdsAuth, from: string, to: string): Promise<AdsData> {
  const out: AdsData = { connected: true, currency: auth.currencyCode ?? null, customerId: auth.customerId, campaigns: [], days: {}, placements: [], errors: [] };
  const range = `segments.date BETWEEN '${gaqlDate(from)}' AND '${gaqlDate(to)}'`;
  const byId = new Map<string, AdsCampaign>();

  const [daily, placements, criteria] = await Promise.allSettled([
    searchStream(auth, `
      SELECT campaign.id, campaign.name, segments.date,
             metrics.clicks, metrics.invalid_clicks, metrics.cost_micros, metrics.conversions
      FROM campaign
      WHERE ${range} AND campaign.status != 'REMOVED'`),
    searchStream(auth, `
      SELECT campaign.name, group_placement_view.placement, group_placement_view.display_name,
             group_placement_view.placement_type,
             metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
      FROM group_placement_view
      WHERE ${range} AND metrics.clicks >= 10
      ORDER BY metrics.cost_micros DESC
      LIMIT 500`),
    searchStream(auth, `
      SELECT campaign.id, campaign_criterion.location.geo_target_constant
      FROM campaign_criterion
      WHERE campaign_criterion.type = 'LOCATION' AND campaign_criterion.negative = FALSE
        AND campaign.status != 'REMOVED'`),
  ]);

  if (daily.status === 'fulfilled') {
    for (const r of daily.value) {
      const id = String(r.campaign?.id ?? '');
      const date = String(r.segments?.date ?? '');
      const clicks = Number(r.metrics?.clicks ?? 0);
      const invalid = Number(r.metrics?.invalidClicks ?? 0);
      const cost = fromMicros(r.metrics?.costMicros);
      const conv = Number(r.metrics?.conversions ?? 0);
      let c = byId.get(id);
      if (!c) {
        c = { id, name: String(r.campaign?.name ?? id), clicks: 0, invalid_clicks: 0, cost: 0, conversions: 0, targeted_countries: [] };
        byId.set(id, c);
      }
      c.clicks += clicks; c.invalid_clicks += invalid; c.cost += cost; c.conversions += conv;
      const d = out.days[date] ?? (out.days[date] = { clicks: 0, invalid_clicks: 0, cost: 0 });
      d.clicks += clicks; d.invalid_clicks += invalid; d.cost += cost;
    }
  } else {
    out.errors.push(`campaigns: ${daily.reason instanceof Error ? daily.reason.message : String(daily.reason)}`);
  }

  if (placements.status === 'fulfilled') {
    out.placements = placements.value.map((r) => ({
      campaign: String(r.campaign?.name ?? ''),
      placement: String(r.groupPlacementView?.placement ?? ''),
      display_name: r.groupPlacementView?.displayName ?? null,
      type: r.groupPlacementView?.placementType ?? null,
      clicks: Number(r.metrics?.clicks ?? 0),
      impressions: Number(r.metrics?.impressions ?? 0),
      cost: fromMicros(r.metrics?.costMicros),
      conversions: Number(r.metrics?.conversions ?? 0),
    }));
  } else {
    out.errors.push(`placements: ${placements.reason instanceof Error ? placements.reason.message : String(placements.reason)}`);
  }

  if (criteria.status === 'fulfilled') {
    // campaign id -> geo target constant ids, then one lookup for their country codes.
    const geoByCampaign = new Map<string, string[]>();
    const geoIds = new Set<string>();
    for (const r of criteria.value) {
      const id = String(r.campaign?.id ?? '');
      const geo = String(r.campaignCriterion?.location?.geoTargetConstant ?? '').split('/').pop() ?? '';
      if (!/^\d+$/.test(geo)) continue;
      geoIds.add(geo);
      geoByCampaign.set(id, [...(geoByCampaign.get(id) ?? []), geo]);
    }
    if (geoIds.size > 0) {
      try {
        const list = [...geoIds].slice(0, 1000).map((g) => `'geoTargetConstants/${g}'`).join(', ');
        const rows = await searchStream(auth, `
          SELECT geo_target_constant.id, geo_target_constant.country_code
          FROM geo_target_constant
          WHERE geo_target_constant.resource_name IN (${list})`);
        const country = new Map<string, string>();
        for (const r of rows) {
          const code = String(r.geoTargetConstant?.countryCode ?? '').toUpperCase();
          if (code) country.set(String(r.geoTargetConstant?.id ?? ''), code);
        }
        for (const [id, geos] of geoByCampaign) {
          const c = byId.get(id);
          if (c) c.targeted_countries = [...new Set(geos.map((g) => country.get(g)).filter((x): x is string => !!x))];
        }
      } catch (e) {
        out.errors.push(`locations: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    out.errors.push(`locations: ${criteria.reason instanceof Error ? criteria.reason.message : String(criteria.reason)}`);
  }

  out.campaigns = [...byId.values()].sort((a, b) => b.clicks - a.clicks);
  return out;
}

const countsOf = (x: any): SignalCounts => ({
  paid_sessions: Number(x?.paid_sessions ?? 0),
  google_sessions: Number(x?.google_sessions ?? 0),
  bot_sessions: Number(x?.bot_sessions ?? 0),
  reused_click_sessions: Number(x?.reused_click_sessions ?? 0),
  burst_sessions: Number(x?.burst_sessions ?? 0),
  zero_engagement_sessions: Number(x?.zero_engagement_sessions ?? 0),
  conversions: Number(x?.conversions ?? 0),
});

const norm = (s: string) => s.trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { siteId } = body ?? {};
    if (!siteId || typeof siteId !== 'string') return json({ error: 'siteId is required' }, 400);

    const authorization = req.headers.get('Authorization');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization ?? '' } } },
    );
    const access = await requireSiteAccess(userClient, authorization, siteId);
    if (!access.ok) return json({ error: access.error }, access.status);

    const to = validDay(body.endDate) ? body.endDate : isoDay(new Date());
    const from = validDay(body.startDate) ? body.startDate : isoDay(new Date(Date.parse(to) - 29 * DAY_MS));
    if (from > to || (Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > 366) {
      return json({ error: 'Date range must be 1 to 366 days' }, 400);
    }

    // CortIQ signals: user-scoped client so auth.uid() and the RPC's ownership check apply.
    const { data: sig, error: sigError } = await userClient.rpc('get_click_fraud_signals', {
      p_site_id: siteId, p_from: from, p_to: to,
    });
    if (sigError) throw new Error(sigError.message);

    // Google Ads, optional. Service role only to read the sealed token; nothing secret is returned.
    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    let ads: AdsData = { connected: false, campaigns: [], days: {}, placements: [], errors: [] };
    try {
      const auth = await loadSiteAdsAuth(svc, siteId);
      if (isAdsAuth(auth)) ads = await loadAds(auth, from, to);
      else ads = { ...ads, code: auth.code, message: auth.error };
    } catch (e) {
      ads = { ...ads, code: 'error', message: e instanceof Error ? e.message : String(e) };
    }

    const totals = countsOf(sig?.totals);
    const adsTotals: AdsCounts | null = ads.connected
      ? ads.campaigns.reduce((t, c) => ({ clicks: t.clicks + c.clicks, invalid_clicks: t.invalid_clicks + c.invalid_clicks, cost: t.cost + c.cost }),
        { clicks: 0, invalid_clicks: 0, cost: 0 })
      : null;

    // Per day.
    // Days with Ads clicks but no tracked paid session are included too (the gap is the signal).
    const sigDays: any[] = sig?.days ?? [];
    const seen = new Set(sigDays.map((d) => String(d.date)));
    const allDays = [...sigDays, ...Object.keys(ads.days).filter((d) => !seen.has(d) && d >= from && d <= to).map((date) => ({ date }))]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const days = allDays.map((d: any) => {
      const counts = countsOf(d);
      const adsDay = ads.days[d.date] ?? null;
      return { date: d.date, ...counts, ads: adsDay, ...scoreSignals(counts, adsDay) };
    });

    // Per campaign: match utm_campaign to an Ads campaign by name or id ({campaignid} ValueTrack).
    const adsByKey = new Map<string, AdsCampaign>();
    for (const c of ads.campaigns) { adsByKey.set(norm(c.name), c); adsByKey.set(c.id, c); }
    const matched = new Set<string>();
    const campaigns = (sig?.campaigns ?? []).map((c: any) => {
      const counts = countsOf(c);
      const a = adsByKey.get(norm(String(c.campaign ?? ''))) ?? null;
      if (a) matched.add(a.id);
      const geo = a ? geoCheck(c.countries, a.targeted_countries) : null;
      const scored = scoreSignals(counts, a, geo);
      return {
        campaign: c.campaign,
        sources: c.sources ?? [],
        ...counts,
        countries: c.countries ?? {},
        ads: a ? { id: a.id, name: a.name, clicks: a.clicks, invalid_clicks: a.invalid_clicks, cost: a.cost, conversions: a.conversions, targeted_countries: a.targeted_countries } : null,
        ...scored,
      };
    }).sort((x: any, y: any) => y.score - x.score || y.paid_sessions - x.paid_sessions);

    // Ads campaigns with clicks but no matching utm_campaign in CortIQ.
    const unmatched = ads.campaigns
      .filter((c) => !matched.has(c.id) && c.clicks > 0)
      .map((c) => ({ id: c.id, name: c.name, clicks: c.clicks, invalid_clicks: c.invalid_clicks, cost: c.cost, conversions: c.conversions }));

    const overall = scoreSignals(totals, adsTotals);

    // CortIQ placements (utm_content/utm_term) with their own score.
    const placements = (sig?.placements ?? []).map((p: any) => {
      const counts = countsOf(p);
      return { campaign: p.campaign, placement: p.placement, ...counts, ...scoreSignals(counts) };
    }).filter((p: any) => p.score >= 30).sort((x: any, y: any) => y.score - x.score).slice(0, 25);

    const refund = refundGuidance({
      customerId: ads.customerId ?? null,
      from, to,
      campaigns: campaigns.map((c: any) => ({ campaign: c.campaign, campaign_id: c.ads?.id ?? null, score: c.score, clicks: c.ads?.clicks, signals: c.signals })),
    });

    return json({
      success: true,
      from, to,
      summary: {
        total_paid_sessions: totals.paid_sessions,
        total_campaigns_analyzed: campaigns.length,
        bot_confirmed_sessions: totals.bot_sessions,
        zombie_sessions: totals.zero_engagement_sessions,
        reused_click_sessions: totals.reused_click_sessions,
        burst_sessions: totals.burst_sessions,
        conversions: totals.conversions,
        with_click_id: Number(sig?.totals?.with_click_id ?? 0),
        score: overall.score,
        level: overall.level,
        confidence: overall.confidence,
      },
      signals: overall.signals,
      days,
      campaigns,
      placements,
      time_distribution: (sig?.hours_utc ?? []).map((h: any) => ({ hour: h.hour, count: h.sessions })),
      devices: sig?.devices ?? {},
      google_ads_connected: ads.connected,
      ads: {
        connected: ads.connected,
        code: ads.code ?? null,
        message: ads.message ?? null,
        currency: ads.currency ?? null,
        totals: adsTotals,
        unmatched_campaigns: unmatched,
        exclusion_candidates: exclusionCandidates(ads.placements),
        errors: ads.errors,
      },
      refund_guidance: refund,
      caveats: CAVEATS,
    });
  } catch (error) {
    console.error('Error in click-fraud-analysis:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
