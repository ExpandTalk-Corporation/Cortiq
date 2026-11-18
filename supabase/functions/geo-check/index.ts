// Geo scope check for banner gating. Returns the visitor's country/region from the signed
// edge geo (CortIQ Worker → resolveGeo), not CF-IPCountry directly, and whether it's in the
// EEA/UK/CH consent zone. Fail-safe: unknown country => in scope (show the banner).
import { resolveGeo, geoKey } from '../_shared/geo.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EEA_UK_CH = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT',
  'LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','IS','LI','NO','GB','CH',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // Signed edge geo via the CortIQ Worker; no time zone here — this decides banner scope and
  // unknown must stay in scope (fail-safe).
  const geo = await resolveGeo(req, { key: geoKey(), timeZone: null });
  const inScope = geo.country ? EEA_UK_CH.has(geo.country) : true;
  return new Response(
    JSON.stringify({ country: geo.country, region: geo.region, in_scope: inScope }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } }
  );
});
