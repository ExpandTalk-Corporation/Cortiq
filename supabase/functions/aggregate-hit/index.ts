/**
 * aggregate-hit — consent-free aggregate measurement
 * (docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md).
 *
 * Called by src/lib/aggregate-beacon.js on sites whose owner enabled sites.aggregate_measurement.
 * The beacon stores nothing on the device and sends no identifier. Here, IP + User-Agent are
 * folded into a daily-salted hash (the salt is deleted when the UTC day ends) and dropped; only
 * the hash and sanitized dimensions reach ingest_aggregate_hit. Never logs IP, UA or hash.
 *
 * Auth: Bearer = the site's tracking key (sites.tracking_id) with body.siteId = site id or owner
 * id, or the account key (companies.api_key, WordPress plugin) with body.siteId = account id, in
 * which case the site is resolved from the page URL's domain and must belong to that account.
 *
 * Conditions the page cannot fix (disabled, GPC, bots, rate limit, DB trouble) answer
 * 200 { skipped } so customers' consoles stay clean.
 */
import { createClient } from '../_shared/supabase.ts';
import { classifyBot, GENERIC_BOT_PATTERN } from '../_shared/ai-bot-registry.ts';
import { normalizeGoals, matchPageVisitGoals } from '../_shared/conversion-goals.js';
import { normHost, ownsHost } from '../_shared/site-host.ts';
import { cleanPath, referrerSource, utmFrom, deviceFromUA, clientIp, visitorHash } from '../_shared/aggregate.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 8 * 1024;
const REQUESTS_PER_MINUTE = 600;
const SITE_COLUMNS = 'id, user_id, is_active, domain, aggregate_measurement, conversion_goals';
// Headless browsers and audit tools that do not match the AI bot registry.
const AUTOMATION_PATTERN = /HeadlessChrome|Lighthouse|PhantomJS|Puppeteer|Playwright|Selenium/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const skipped = (reason: string) => json({ skipped: reason });
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function isLikelyBot(ua: string): boolean {
  if (!ua) return true;
  return classifyBot(ua).registryMatch || GENERIC_BOT_PATTERN.test(ua) || AUTOMATION_PATTERN.test(ua);
}

// deno-lint-ignore no-explicit-any
async function resolveAggregateSite(supabase: any, key: string, siteId: string, pageUrl: URL) {
  const { data: byKey } = await supabase.from('sites').select(SITE_COLUMNS).eq('tracking_id', key).maybeSingle();
  if (byKey) {
    return byKey.is_active !== false && (siteId === byKey.id || siteId === byKey.user_id) ? byKey : null;
  }
  const { data: company } = await supabase.from('companies').select('id, is_active').eq('api_key', key).maybeSingle();
  if (!company || company.is_active === false || company.id !== siteId) return null;
  const { data: domainSiteId } = await supabase.rpc('resolve_site_by_domain', { p_url: pageUrl.origin });
  if (!domainSiteId) return null;
  const { data: site } = await supabase.from('sites').select(SITE_COLUMNS).eq('id', domainSiteId as string).maybeSingle();
  return site && site.user_id === company.id && site.is_active !== false ? site : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const key = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!/^[A-Za-z0-9+/=_-]{20,128}$/.test(key)) return json({ error: 'Missing or malformed key' }, 401);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Body too large' }, 413);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const kind = body?.kind;
  if (kind !== 'pageview' && kind !== 'goal') return json({ error: 'kind must be pageview or goal' }, 400);
  let pageUrl: URL;
  try { pageUrl = new URL(String(body.url ?? '')); } catch { return json({ error: 'Invalid url' }, 400); }
  if (pageUrl.protocol !== 'https:' && pageUrl.protocol !== 'http:') return json({ error: 'Invalid url' }, 400);

  // Objection signals and non-humans are dropped before any lookup.
  if (req.headers.get('sec-gpc') === '1') return skipped('gpc');
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 512);
  if (isLikelyBot(ua)) return skipped('bot');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const site = await resolveAggregateSite(supabase, key, String(body.siteId ?? ''), pageUrl);
  if (!site) return json({ error: 'Unknown or inactive key' }, 401);
  if (!site.aggregate_measurement) return skipped('disabled');

  const siteHost = normHost(site.domain ?? '');
  const host = normHost(pageUrl.hostname);
  if (!siteHost || !host || !ownsHost(siteHost, host)) return json({ error: 'Host does not belong to this site' }, 400);

  // Fail closed: an unavailable limiter must not become an unlimited one.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: `agg:${site.id}`, p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError) return skipped('unavailable');
  if (allowed === false) return skipped('rate_limited');

  const { data: salt, error: saltError } = await supabase.rpc('aggregate_daily_salt');
  if (saltError || typeof salt !== 'string' || !salt) {
    console.error('aggregate-hit: salt unavailable');
    return skipped('unavailable');
  }
  const hash = await visitorHash(salt, site.id, clientIp(req.headers), ua);

  const base = { p_site_id: site.id, p_hash: hash, p_path: cleanPath(pageUrl), p_device: deviceFromUA(ua) };
  const noSource = { p_referrer_domain: '', p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' };
  const ingest = async (args: Record<string, unknown>) => {
    const { error } = await supabase.rpc('ingest_aggregate_hit', args);
    if (error) console.error('aggregate-hit: ingest failed:', error.message);
  };
  const goals = normalizeGoals(site.conversion_goals);

  if (kind === 'pageview') {
    await ingest({ ...base, p_kind: 'pageview', p_referrer_domain: referrerSource(body.referrer, siteHost),
      ...utmFrom(body.utm), p_goal_id: null, p_goal_name: null, p_value: null });
    for (const goal of matchPageVisitGoals(goals, pageUrl.href)) {
      await ingest({ ...base, ...noSource, p_kind: 'goal', p_goal_id: goal.id, p_goal_name: goal.name, p_value: num(goal.value) });
    }
    // Form goals only: the beacon matches submits by selector. No names or values leave here.
    return json({ goals: goals.filter((g) => g.type === 'form_submission').map((g) => ({ id: g.id, selector: g.selector.slice(0, 500) })) });
  }

  const goal = typeof body.goalId === 'string'
    ? goals.find((g) => g.id === body.goalId && g.type === 'form_submission')
    : undefined;
  await ingest({
    ...base, ...noSource, p_kind: 'goal',
    p_goal_id: goal ? goal.id : `form:${clip(body.formId, 100) ?? base.p_path}`,
    p_goal_name: goal ? goal.name : (clip(body.contentId, 200) ?? 'Conversion'),
    p_value: goal ? num(goal.value) : num(body.value),
  });
  return new Response(null, { status: 204, headers: corsHeaders });
});
