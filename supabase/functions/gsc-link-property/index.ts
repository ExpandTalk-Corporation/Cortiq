import { createClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/validateRequest.ts';

// Reuses a Google connection the owner already made for another of their sites, so a
// second site does not need a new Google consent. Body: { site_id, property_url }.
// The tokens are copied server-side from the owner's freshest row for that property;
// the browser never sees them (see 20261003000001_gsc_credentials_column_grants.sql).
// The property becomes the site's only active one, as when it is chosen in step 3.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { site_id: siteId, property_url: propertyUrl } = await req.json().catch(() => ({}));
    if (typeof siteId !== 'string' || !UUID_RE.test(siteId) || typeof propertyUrl !== 'string' || !propertyUrl) {
      return json({ error: 'site_id and property_url are required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: sites, error: sitesError } = await supabase.from('sites').select('id').eq('user_id', user.id);
    if (sitesError) throw sitesError;
    const owned = (sites ?? []).map((s: { id: string }) => s.id);
    if (!owned.includes(siteId)) return json({ error: 'Site not found or access denied' }, 403);

    // Freshest token for this property among the owner's other sites.
    const { data: source, error: sourceError } = await supabase
      .from('site_google_credentials')
      .select('refresh_token, access_token, token_expires_at')
      .in('site_id', owned.filter((id: string) => id !== siteId))
      .eq('property_url', propertyUrl)
      .order('token_expires_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return json({ error: 'No existing Google connection has access to this property' }, 404);

    const { error: clearError } = await supabase
      .from('site_google_credentials')
      .update({ is_active: false })
      .eq('site_id', siteId);
    if (clearError) throw clearError;

    const { error: upsertError } = await supabase
      .from('site_google_credentials')
      .upsert(
        { site_id: siteId, property_url: propertyUrl, is_active: true, ...source },
        { onConflict: 'site_id,property_url' },
      );
    if (upsertError) throw upsertError;

    return json({ success: true, property_url: propertyUrl });
  } catch (err) {
    console.error('gsc-link-property error:', err);
    return json({ error: err instanceof Error ? err.message : 'Could not link the property' }, 500);
  }
});
