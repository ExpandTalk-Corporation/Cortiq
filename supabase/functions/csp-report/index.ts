/**
 * csp-report — receives Content-Security-Policy violation reports from cortiq.se.
 *
 * public/.htaccess and public/api-docs/.htaccess point report-uri (older browsers) and
 * Reporting-Endpoints / report-to (current browsers) here. Reports are reduced to page path,
 * directive, blocked origin+path and source file (_shared/csp-report.js) and counted per UTC day
 * in csp_reports, which only the service role can read. Reports for other hosts are ignored.
 *
 * Browsers ignore the response, so everything that is not a malformed request answers 204.
 */
import { createClient } from '../_shared/supabase.ts';
import { parseCspReports } from '../_shared/csp-report.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 64 * 1024;
const REQUESTS_PER_MINUTE = 300;

const done = () => new Response(null, { status: 204, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: corsHeaders });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413, headers: corsHeaders });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413, headers: corsHeaders });
  const rows = parseCspReports(text);
  if (!rows.length) return done();

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // One global bucket: the endpoint is public, and a flood must not grow the table without bound.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: 'csp-report', p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError || allowed === false) return done();

  for (const row of rows) {
    const { error } = await supabase.rpc('ingest_csp_report', {
      p_document_path: row.document_path, p_directive: row.directive, p_blocked: row.blocked,
      p_source: row.source, p_disposition: row.disposition,
    });
    if (error) { console.error('csp-report: ingest failed:', error.message); break; }
  }
  return done();
});
