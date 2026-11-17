/**
 * gtm-audit-stats — anonymous usage counters from the public GTM container audit (/gtm-audit).
 *
 * The page sends one JSON payload per analysed file, built by _shared/gtm-audit/stats.ts from a
 * whitelist (engine version, tag-count bucket, counts per tag type, registry vendor id, check key and
 * migration class). This function re-validates it with the same module and adds the counts to
 * gtm_audit_stats_daily. No IP address, User-Agent, name, domain or container ID is stored.
 */
import { createClient } from '../_shared/supabase.ts';
import { statsRows, validateStats } from '../_shared/gtm-audit/stats.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 10 * 1024;
const REQUESTS_PER_MINUTE = 120;

const reply = (status: number) => new Response(null, { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply(405);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply(413);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return reply(413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return reply(400); }
  const stats = validateStats(body);
  if (!stats) return reply(400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // One global bucket: the endpoint is public, and a flood must not inflate the counters.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: 'gtm-audit-stats', p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError || allowed === false) return reply(204);

  const { keys, counts } = statsRows(stats);
  const { error } = await supabase.rpc('ingest_gtm_audit_stats', { p_keys: keys, p_counts: counts });
  if (error) console.error('gtm-audit-stats: ingest failed:', error.message);
  return reply(204);
});
