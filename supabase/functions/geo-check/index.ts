// Geo scope check for banner gating. Returns the visitor's country/region from the signed
// edge geo (CortIQ Worker → resolveGeo), not CF-IPCountry directly, and whether it's in the
// EEA/UK/CH consent zone. Fail-safe: unknown country => in scope (show the banner).
import { resolveGeo, geoKey } from '../_shared/geo.ts';
import { createClient } from '../_shared/supabase.ts';
import { decide, PURPOSES } from '../_shared/jurisdiction/index.ts';
import { loadSitePolicy, signalsFrom, visitorFrom } from '../_shared/jurisdiction-edge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EEA_UK_CH = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT',
  'LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','IS','LI','NO','GB','CH',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // Signed edge geo via the CortIQ Worker; no time zone here — this decides banner scope and
  // unknown must stay in scope (fail-safe).
  const geo = await resolveGeo(req, { key: geoKey(), timeZone: null });
  const inScope = geo.country ? EEA_UK_CH.has(geo.country) : true;
  const payload: Record<string, unknown> = { country: geo.country, region: geo.region, in_scope: inScope };

  // Optional: what CortIQ's technical defaults decide for this visitor on one site. No consent is
  // assumed (signals empty), so the answer is the strictest per purpose. Not legal advice.
  const site = new URL(req.url).searchParams.get('site');
  if (site && UUID.test(site)) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const policy = await loadSitePolicy(supabase, site);
    const outcomes: Record<string, string> = {};
    for (const purpose of PURPOSES) {
      outcomes[purpose] = decide({
        visitor: visitorFrom(geo), purpose,
        signals: signalsFrom(null, { trackerGate: [], gpcHeader: req.headers.get('sec-gpc') === '1' }),
        technique: { storage: 'none', identifiers: 'none' },
        customer: policy.customer, exceptions: policy.exceptions, tighten: policy.tighten, testSite: false,
      }).outcome;
    }
    payload.outcomes = outcomes;
  }
  return new Response(JSON.stringify(payload),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } });
});
