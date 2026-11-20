// supabase/functions/_shared/jurisdiction-edge.ts
// Spec 2026-11-18 phase 3: the one place Edge Functions talk to the rule engine. Pure apart from
// the client calls; never reads Deno (callers pass Deno.env.get('JURISDICTION_ENFORCE')).
import {
  decide, profileToCustomer, MARKETS, PURPOSES,
  type ApprovedException, type CustomerProfile, type Decision, type Market, type Purpose,
  type Signals, type Technique, type Visitor,
} from './jurisdiction/index.ts';

export const INGEST_FUNCTIONS = ['aggregate-hit', 'server-hit', 'ai-bot-tracker', 'track-event', 'visitor-identification',
  'record-conversion', 'store-consent', 'google-ads-quality-upload'] as const;
export type IngestFn = typeof INGEST_FUNCTIONS[number];

export interface SitePolicy { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>>; exceptions: ApprovedException[]; testSite: boolean }
export const STRICT_POLICY: SitePolicy = Object.freeze({ customer: null, tighten: {}, exceptions: [], testSite: false }) as SitePolicy;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

function parseException(e: unknown): ApprovedException | null {
  if (!isObj(e)) return null;
  const keys = ['ruleId', 'jurisdiction', 'purpose', 'legalBasis', 'assessmentRef', 'approvedBy', 'approvedAt', 'expiresAt'] as const;
  if (!keys.every((k) => str(e[k]))) return null;
  if (!(MARKETS as readonly string[]).includes(e.jurisdiction as string) || !(PURPOSES as readonly string[]).includes(e.purpose as string)) return null;
  return Object.fromEntries(keys.map((k) => [k, e[k]])) as unknown as ApprovedException;
}

export function parseSitePolicy(raw: unknown): SitePolicy {
  if (!isObj(raw)) return { ...STRICT_POLICY, tighten: {}, exceptions: [] };
  let customer: CustomerProfile | null = null;
  if (isObj(raw.profile)) {
    try { customer = profileToCustomer(raw.profile as never); } catch { customer = null; }
  }
  const tighten: Partial<Record<Purpose, string>> = {};
  if (isObj(raw.tighten)) {
    for (const p of PURPOSES) if (typeof raw.tighten[p] === 'string') tighten[p] = raw.tighten[p] as string;
  }
  const exceptions = Array.isArray(raw.exceptions) ? raw.exceptions.map(parseException).filter((e): e is ApprovedException => !!e) : [];
  return { customer, tighten, exceptions, testSite: raw.testSite === true };
}

// deno-lint-ignore no-explicit-any
export async function loadSitePolicy(client: any, siteId: string): Promise<SitePolicy> {
  try {
    const { data, error } = await client.rpc('get_site_jurisdiction', { p_site_id: siteId });
    if (error) { console.error('jurisdiction: policy load failed:', error.message); return STRICT_POLICY; }
    return parseSitePolicy(data);
  } catch (e) {
    console.error('jurisdiction: policy load threw:', (e as Error).message);
    return STRICT_POLICY;
  }
}

export function isEnforced(fn: IngestFn, flag: string | null | undefined): boolean {
  if (typeof flag !== 'string') return false;
  const list = flag.split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes('all') || list.includes(fn);
}

export interface Ledger { analytics: boolean | null; marketing: boolean | null; gpc: boolean }
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

// deno-lint-ignore no-explicit-any
export async function readLedger(client: any, siteId: string, sessionId: unknown, now: Date = new Date()): Promise<Ledger | null> {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 255) return null;
  try {
    const { data, error } = await client.from('cookie_consents')
      .select('consent_given, consent_types, gpc_signal, expires_at')
      .eq('site_id', siteId).eq('session_id', sessionId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    const exp = Date.parse(data.expires_at);
    if (Number.isFinite(exp) && exp <= now.getTime()) return null;
    const gpc = data.gpc_signal === true;
    if (data.consent_given === false) return { analytics: false, marketing: false, gpc };
    const t = isObj(data.consent_types) ? data.consent_types : {};
    return { analytics: bool(t.analytics), marketing: bool(t.marketing), gpc };
  } catch { return null; }
}

// The ledger only tightens: a ledger false beats a tracker gate; a missing ledger row is "no answer".
export function signalsFrom(ledger: Ledger | null, opts: { trackerGate: ('analytics' | 'marketing')[]; gpcHeader: boolean }): Signals {
  const gate = (c: 'analytics' | 'marketing'): boolean | null => (opts.trackerGate.includes(c) ? true : null);
  const pick = (c: 'analytics' | 'marketing'): boolean | null => {
    const l = ledger ? ledger[c] : null;
    return l === false ? false : (l === true ? true : gate(c));
  };
  const consent = { analytics: pick('analytics'), marketing: pick('marketing') };
  const fromLedger = !!ledger && (ledger.analytics !== null || ledger.marketing !== null);
  const evidence = fromLedger ? 'ledger' : (opts.trackerGate.length ? 'tracker_gate' : 'none');
  return { consent, evidence, gpc: opts.gpcHeader || ledger?.gpc === true };
}

export function visitorFrom(geo: { country: string | null; region: string | null; source: string }, adapter = false): Visitor {
  const geoSource = adapter ? 'adapter' : (geo.source === 'ip' || geo.source === 'timezone' ? geo.source : 'unknown');
  return { country: geo.country ?? null, region: geo.region ?? null, geoSource };
}

export async function decideAndLog(
  // deno-lint-ignore no-explicit-any
  client: any, fn: IngestFn, siteId: string,
  input: { visitor: Visitor; purpose: Purpose; signals: Signals; technique: Technique },
  policy: SitePolicy, flag: string | null | undefined, count = 1,
): Promise<Decision & { enforce: boolean; drop: boolean }> {
  const d = decide({ ...input, customer: policy.customer, exceptions: policy.exceptions, tighten: policy.tighten, testSite: policy.testSite });
  const enforce = isEnforced(fn, flag);
  try {
    const { error } = await client.rpc('log_jurisdiction_decision', {
      p_site_id: siteId, p_fn: fn, p_purpose: input.purpose,
      p_country: input.visitor.geoSource === 'ip' ? (input.visitor.country ?? '') : '',
      p_rule_id: d.ruleIds.join(',').slice(0, 200), p_outcome: d.outcome, p_reason: d.reason,
      p_evidence: d.evidence, p_enforced: enforce, p_count: Math.max(1, Math.floor(count)),
    });
    if (error) console.error('jurisdiction: log failed:', error.message);
  } catch (e) { console.error('jurisdiction: log threw:', (e as Error).message); }
  return { ...d, enforce, drop: enforce && !d.permit };
}

// Ad-platform export of a stored conversion. No country is stored on conversion_events, so the
// visitor is unknown and the site's strictest market decides (fail closed). Ledger evidence only.
// deno-lint-ignore no-explicit-any
export async function gateAdsUpload(client: any, siteId: string, sessionId: unknown, policy: SitePolicy, flag: string | null | undefined): Promise<{ drop: boolean }> {
  const d = await decideAndLog(client, 'google-ads-quality-upload', siteId, {
    visitor: { country: null, region: null, geoSource: 'unknown' },
    purpose: 'ad_platform_sharing',
    signals: signalsFrom(await readLedger(client, siteId, sessionId), { trackerGate: [], gpcHeader: false }),
    technique: { storage: 'persistent', identifiers: 'cross_site' },
  }, policy, flag);
  return { drop: d.drop };
}

export type { Market };
