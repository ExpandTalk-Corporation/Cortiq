// Tracking Check API: access check, page suggestions, run creation, status, sharing and schedules.
import { createClient } from '../_shared/supabase.ts';
import { assertSafeUrl } from '../_shared/safe-url.ts';
import { discoverPages, suggestPages } from '../_shared/tracking-check/pages.ts';
import { runLinkProbe } from '../_shared/tracking-check/browserless.ts';
import { randomToken, seal } from '../_shared/tracking-check/secret-box.ts';
import { kickWorker } from '../_shared/tracking-check/kick.ts';
import { browserAccess } from '../_shared/browser-access.ts';
import type { Mode, PolicyTemplate } from '../_shared/tracking-check/types.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const LIMITS = { comparisonPages: 25, policyPages: 15, legacyPaths: 25, runsPerDay: 10, authHours: 2 };
// Allowlisted accounts get LIMITS; once TRACKING_CHECK_PUBLIC=true, any other confirmed account gets STANDARD.
// Each page is a headless-browser load per consent state, so the standard quota stays small.
export const STANDARD = { comparisonPages: 5, policyPages: 5, legacyPaths: 10, runsPerDay: 3, authHours: 2 };
// Active weekly/monthly schedules per account. Scheduled runs do not count against runsPerDay (that quota
// is for runs started by hand); this cap and the frequency bound how many runs schedules can create.
export const SCHEDULES = { full: 20, standard: 5 };
const FREQUENCIES = ['weekly', 'monthly'] as const;
type Frequency = typeof FREQUENCIES[number];
type Tier = 'full' | 'standard';
type Limits = typeof LIMITS;
class InputError extends Error {}

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = data?.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { confirmed, listed, preview, allowed } = browserAccess(user);
  const tier: Tier = listed ? 'full' : 'standard';
  const limits: Limits = tier === 'full' ? LIMITS : STANDARD;

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request body' }, 400);
  if (!allowed && body.action !== 'access') {
    return json({ error: confirmed ? 'Tracking Check is in private preview' : 'Confirm your email address to run Tracking Check' }, 403);
  }

  const service: Db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    switch (body.action) {
      case 'access': return json({
        allowed, tier, preview, confirmed,
        limits: { runsPerDay: limits.runsPerDay, policyPages: limits.policyPages, comparisonPages: limits.comparisonPages },
        runsToday: allowed ? await runsToday(user.id, service) : 0,
        schedules: { max: SCHEDULES[tier], active: allowed ? await activeSchedules(user.id, service) : 0 },
      });
      case 'suggest': return json(await suggest(body));
      case 'create': return await create(body, user.id, service, limits);
      case 'status': return await status(body, user.id, service);
      case 'share': return await share(body, user.id, service);
      case 'revoke': return await revoke(body, user.id, service);
      case 'schedule': return await schedule(body, user.id, service, SCHEDULES[tier]);
      case 'dismiss': return await dismiss(body, user.id, service);
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error('tracking-check-start', e);
    return json({ error: 'Internal error' }, 500);
  }
});

async function siteOrigin(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || !raw.trim()) throw new InputError('Site URL is required');
  try { return (await assertSafeUrl(raw.trim())).origin; } catch (e) { throw new InputError(e instanceof Error ? e.message : 'Invalid URL'); }
}

function cleanPaths(list: unknown, max: number, label: string, allowQuery = false): string[] {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new InputError(`${label} must be a list`);
  const paths = [...new Set(list.map((p) => String(p).trim()).filter(Boolean).map((p) => (p.startsWith('/') ? p : `/${p}`)))];
  if (paths.some((p) => p.length > 500 || /\s/.test(p))) throw new InputError(`Invalid ${label}`);
  // Page paths end up in shared reports; query values could carry tokens. Old URLs may need them to resolve.
  if (!allowQuery && paths.some((p) => /[?#]/.test(p))) throw new InputError('Pages must not contain query strings');
  if (paths.length > max) throw new InputError(`At most ${max} ${label} per run`);
  return paths;
}

function parsePolicy(raw: unknown): PolicyTemplate {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Body;
  const flag = (k: string) => p[k] === true;
  const ids = Array.isArray(p.expectedIds) ? p.expectedIds.map((s: unknown) => String(s).trim()).filter(Boolean) : [];
  if (ids.length > 20 || ids.some((id: string) => !/^[A-Za-z0-9-]{3,40}$/.test(id))) throw new InputError('Invalid expected IDs');
  const items = Array.isArray(p.manualItems) ? p.manualItems : [];
  if (items.length > 10) throw new InputError('At most 10 manual items');
  const manualItems = items.map((i: Body) => ({ key: String(i?.key ?? ''), label: String(i?.label ?? '').slice(0, 200) }));
  if (manualItems.some((i: { key: string; label: string }) => !/^[a-z0-9_]{1,40}$/.test(i.key) || !i.label)) throw new InputError('Invalid manual items');
  return {
    noGoogleBeforeConsent: flag('noGoogleBeforeConsent'), consentDefaultsDenied: flag('consentDefaultsDenied'),
    ga4RequiresAnalytics: flag('ga4RequiresAnalytics'), adsRequiresMarketing: flag('adsRequiresMarketing'),
    enhancedConversionsOff: flag('enhancedConversionsOff'), noUnknownVendorsAfterReject: flag('noUnknownVendorsAfterReject'),
    expectedIds: ids, manualItems,
  };
}

async function suggest(body: Body) {
  const origin = await siteOrigin(body.url);
  const found = await discoverPages(origin, {
    browserLinks: (urls, enough) => runLinkProbe({
      endpoint: Deno.env.get('BROWSERLESS_URL') ?? '', token: Deno.env.get('BROWSERLESS_API_KEY') ?? '', urls, enough,
    }),
  });
  return {
    pages: suggestPages(found.urls, origin),
    source: found.source, from: found.from, blockedStatus: found.blockedStatus, viaBrowser: found.viaBrowser,
  };
}

async function runsToday(userId: string, service: Db): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // Scheduled reruns are left out: the daily quota is for runs started by hand.
  const { count, error } = await service.from('tracking_check_runs').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('trigger', 'manual').gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

async function create(body: Body, userId: string, service: Db, limits: Limits) {
  const mode: Mode = body.mode === 'policy' ? 'policy' : body.mode === 'comparison' ? 'comparison' : (() => { throw new InputError('mode must be comparison or policy'); })();
  const target = await siteOrigin(body.targetUrl);
  const baseline = mode === 'comparison' ? await siteOrigin(body.baselineUrl) : null;
  const pages = cleanPaths(body.pages, mode === 'policy' ? limits.policyPages : limits.comparisonPages, 'pages');
  if (!pages.length) throw new InputError('Select at least one page');
  const legacy = mode === 'comparison' ? cleanPaths(body.legacyPaths, limits.legacyPaths, 'legacy URLs', true) : [];
  const policy = mode === 'policy' ? parsePolicy(body.policy) : null;

  // Basic auth is off until the hosted browser runs under an EU processor agreement: credentials would
  // otherwise reach Browserless (USA) without one. The sealing below stays for when it is re-enabled.
  if (body.basicAuth?.username) throw new InputError('Password-protected (basic auth) sites are not supported yet');

  if (await runsToday(userId, service) >= limits.runsPerDay) {
    return json({ error: `Daily limit of ${limits.runsPerDay} runs reached. Contact info@expandtalk.se to run more.` }, 429);
  }

  let auth_ciphertext: string | null = null;
  let auth_expires_at: string | null = null;
  if (body.basicAuth?.username) {
    auth_ciphertext = await seal(JSON.stringify({ username: String(body.basicAuth.username), password: String(body.basicAuth.password ?? '') }), Deno.env.get('TRACKING_CHECK_AUTH_KEY')!);
    auth_expires_at = new Date(Date.now() + limits.authHours * 3600 * 1000).toISOString();
  }

  const { data: run, error } = await service.from('tracking_check_runs')
    .insert({ user_id: userId, mode, baseline_url: baseline, target_url: target, policy, pages: { pages, legacy }, auth_ciphertext, auth_expires_at, requires_auth: !!auth_ciphertext })
    .select('id').single();
  if (error) throw error;

  const roles = mode === 'comparison' ? ['baseline', 'target'] : ['target'];
  const tasks: Body[] = [];
  for (const path of pages) for (const site_role of roles) for (const kind of ['fetch', 'browser']) tasks.push({ run_id: run.id, site_role, path, kind, legacy: false });
  for (const path of legacy) tasks.push({ run_id: run.id, site_role: 'target', path, kind: 'fetch', legacy: true });
  const { error: taskError } = await service.from('tracking_check_tasks').insert(tasks);
  if (taskError) {
    // A run without tasks would never finish; remove it so it does not count against the daily limit either.
    const { error: cleanupError } = await service.from('tracking_check_runs').delete().eq('id', run.id);
    if (cleanupError) console.error('tracking-check-start cleanup', cleanupError);
    throw taskError;
  }

  kickWorker();
  return json({ runId: run.id });
}

async function ownRun(runId: unknown, userId: string, service: Db) {
  if (typeof runId !== 'string') return null;
  const { data } = await service.from('tracking_check_runs').select('id, status, user_id, created_at').eq('id', runId).maybeSingle();
  return data && data.user_id === userId ? data : null;
}

async function status(body: Body, userId: string, service: Db) {
  const run = await ownRun(body.runId, userId, service);
  if (!run) return json({ error: 'Not found' }, 404);
  const { data: tasks } = await service.from('tracking_check_tasks').select('status, claimed_at').eq('run_id', run.id);
  const list: { status: string; claimed_at: string | null }[] = tasks ?? [];
  const progress = { total: list.length, done: 0, failed: 0, running: 0, pending: 0 };
  for (const t of list) if (t.status in progress) progress[t.status as 'done' | 'failed' | 'running' | 'pending']++;
  if (run.status === 'running') {
    // Before the first claim no task has a claimed_at yet; fall back to the run's own
    // creation time so a freshly-created run isn't treated as stalled on every poll.
    const created = Date.parse(run.created_at);
    const lastClaim = Math.max(Number.isFinite(created) ? created : 0, ...list.map((t) => (t.claimed_at ? Date.parse(t.claimed_at) : 0)));
    if (Date.now() - lastClaim > 120_000) kickWorker();
  }
  return json({ status: run.status, progress });
}

async function share(body: Body, userId: string, service: Db) {
  const run = await ownRun(body.runId, userId, service);
  if (!run) return json({ error: 'Not found' }, 404);
  const days = typeof body.expiresInDays === 'number' && body.expiresInDays > 0 ? Math.min(body.expiresInDays, 365) : null;
  const token = randomToken();
  const { error } = await service.from('tracking_check_runs')
    .update({ share_token: token, share_expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null }).eq('id', run.id);
  if (error) throw error;
  return json({ token });
}

async function revoke(body: Body, userId: string, service: Db) {
  const run = await ownRun(body.runId, userId, service);
  if (!run) return json({ error: 'Not found' }, 404);
  const { error } = await service.from('tracking_check_runs').update({ share_token: null, share_expires_at: null }).eq('id', run.id);
  if (error) throw error;
  return json({ ok: true });
}

async function activeSchedules(userId: string, service: Db): Promise<number> {
  const { count, error } = await service.from('tracking_check_schedules').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('enabled', true);
  if (error) throw error;
  return count ?? 0;
}

export function nextRunAt(frequency: Frequency, from = new Date()): string {
  const next = new Date(from.getTime());
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

// Turns weekly/monthly reruns of a finished run on or off. A run that already belongs to a schedule
// updates that schedule, so a whole lineage of runs shares one schedule and one diff chain.
async function schedule(body: Body, userId: string, service: Db, max: number) {
  const frequency = body.frequency;
  if (frequency !== 'off' && !FREQUENCIES.includes(frequency)) throw new InputError('frequency must be off, weekly or monthly');
  if (typeof body.runId !== 'string') return json({ error: 'Not found' }, 404);
  const { data: run } = await service.from('tracking_check_runs')
    .select('id, user_id, status, mode, baseline_url, target_url, policy, pages, schedule_id, requires_auth').eq('id', body.runId).maybeSingle();
  if (!run || run.user_id !== userId) return json({ error: 'Not found' }, 404);

  let current: { id: string; enabled: boolean } | null = null;
  if (run.schedule_id) {
    const { data } = await service.from('tracking_check_schedules').select('id, user_id, enabled').eq('id', run.schedule_id).maybeSingle();
    if (data && data.user_id === userId) current = data;
  }
  const now = new Date();

  if (frequency === 'off') {
    if (current) {
      const { error } = await service.from('tracking_check_schedules').update({ enabled: false, updated_at: now.toISOString() }).eq('id', current.id);
      if (error) throw error;
    }
    return json({ scheduleId: current?.id ?? null, frequency: 'off' });
  }

  if (run.status !== 'done') throw new InputError('Only finished runs can be scheduled');
  if (run.requires_auth) throw new InputError('Runs that used login credentials cannot be scheduled');
  if (!current?.enabled && await activeSchedules(userId, service) >= max) {
    return json({ error: `You can have at most ${max} scheduled checks. Turn one off first.` }, 429);
  }

  const fields = { frequency, enabled: true, next_run_at: nextRunAt(frequency, now), updated_at: now.toISOString() };
  if (current) {
    const { error } = await service.from('tracking_check_schedules').update(fields).eq('id', current.id);
    if (error) throw error;
    return json({ scheduleId: current.id, frequency, nextRunAt: fields.next_run_at });
  }

  const { data: created, error } = await service.from('tracking_check_schedules').insert({
    ...fields, user_id: userId, source_run_id: run.id, mode: run.mode, baseline_url: run.baseline_url,
    target_url: run.target_url, policy: run.policy, pages: run.pages, last_run_id: run.id,
  }).select('id').single();
  if (error) throw error;
  const { error: linkError } = await service.from('tracking_check_runs').update({ schedule_id: created.id }).eq('id', run.id);
  if (linkError) throw linkError;
  return json({ scheduleId: created.id, frequency, nextRunAt: fields.next_run_at });
}

// Hides the "new problems" notice of a schedule.
async function dismiss(body: Body, userId: string, service: Db) {
  if (typeof body.scheduleId !== 'string') return json({ error: 'Not found' }, 404);
  const { data } = await service.from('tracking_check_schedules').select('id, user_id').eq('id', body.scheduleId).maybeSingle();
  if (!data || data.user_id !== userId) return json({ error: 'Not found' }, 404);
  const { error } = await service.from('tracking_check_schedules').update({ alert_run_id: null, updated_at: new Date().toISOString() }).eq('id', data.id);
  if (error) throw error;
  return json({ ok: true });
}
