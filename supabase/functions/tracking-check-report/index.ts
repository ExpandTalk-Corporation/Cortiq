// Public, read-only Tracking Check report addressed by an unguessable share token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Not found' }, 404);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: run, error: runError } = await db.from('tracking_check_runs')
    .select('id, mode, baseline_url, target_url, status, summary, finished_at, share_expires_at')
    .eq('share_token', token).maybeSingle();
  if (runError) { console.error('tracking-check-report run', runError); return json({ error: 'Internal error' }, 500); }
  if (!run || run.status !== 'done' || (run.share_expires_at && Date.parse(run.share_expires_at) < Date.now())) return json({ error: 'Not found' }, 404);

  const { data: rows, error: findingsError } = await db.from('tracking_check_findings')
    .select('scope, check_key, title, status, priority, explanation, fix, typical_owner, evidence, verified_at')
    .eq('run_id', run.id).order('sort_order');
  if (findingsError) { console.error('tracking-check-report findings', findingsError); return json({ error: 'Internal error' }, 500); }
  // deno-lint-ignore no-explicit-any
  const findings = (rows ?? []).map((f: any) => ({
    scope: f.scope, checkKey: f.check_key, title: f.title, status: f.status, priority: f.priority, explanation: f.explanation,
    fix: f.fix, typicalOwner: f.typical_owner, evidence: f.evidence, verified: !!f.verified_at, verifiedAt: f.verified_at,
  }));
  return json({ run: { mode: run.mode, baselineUrl: run.baseline_url, targetUrl: run.target_url, finishedAt: run.finished_at, summary: run.summary }, findings });
});
