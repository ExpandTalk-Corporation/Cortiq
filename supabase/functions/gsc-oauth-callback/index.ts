import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/validateRequest.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { code, state, error: oauthError } = body;

    if (oauthError) {
      return new Response(
        JSON.stringify({ error: 'OAuth authorization failed', details: oauthError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: 'Missing code or state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // state = site_id — must be a UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(state)) {
      return new Response(
        JSON.stringify({ error: 'Invalid state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const frontendUrl  = Deno.env.get('FRONTEND_URL') || 'https://cortiq.se';

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing Google OAuth credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the caller is authenticated and owns the site referenced by state
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', state)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!site) {
      return new Response(
        JSON.stringify({ error: 'Site not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange authorization code for tokens
    const redirectUri = `${frontendUrl}/auth/gsc-callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', tokenRes.status);
      return new Response(
        JSON.stringify({ error: 'OAuth token exchange failed. Check Google Cloud Console configuration.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokens = await tokenRes.json();
    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = tokens;

    // Fetch properties from GSC
    const propsRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!propsRes.ok) {
      const hint = propsRes.status === 403
        ? "Enable 'Google Search Console API' in Google Cloud Console"
        : "Check OAuth scopes include 'https://www.googleapis.com/auth/webmasters.readonly'";
      return new Response(
        JSON.stringify({ error: 'Failed to fetch GSC properties', hint }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propsData = await propsRes.json();
    const properties: { siteUrl: string; permissionLevel: string }[] = propsData.siteEntry || [];

    if (properties.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No GSC properties found in this Google account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date(Date.now() + (expiresIn ?? 3600) * 1000);

    // Reconnecting must refresh tokens without un-selecting the property the owner
    // already chose, so existing rows only get new tokens and new properties are
    // inserted inactive (the column default is true, so it is set explicitly).
    const tokens = {
      refresh_token:    refreshToken,
      access_token:     accessToken,
      token_expires_at: expiresAt.toISOString(),
    };
    const { data: existing } = await supabase
      .from('site_google_credentials')
      .select('property_url')
      .eq('site_id', state);
    const known = new Set((existing ?? []).map((r: { property_url: string }) => r.property_url));

    let upsertError = null;
    if (known.size > 0) {
      ({ error: upsertError } = await supabase
        .from('site_google_credentials')
        .update(tokens)
        .eq('site_id', state));
    }
    const fresh = properties.filter((p) => !known.has(p.siteUrl));
    if (!upsertError && fresh.length > 0) {
      ({ error: upsertError } = await supabase
        .from('site_google_credentials')
        .insert(fresh.map((p) => ({ site_id: state, property_url: p.siteUrl, is_active: false, ...tokens }))));
    }

    if (upsertError) {
      console.error('Failed to store credentials:', upsertError);
      throw upsertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        properties: properties.map((p) => ({ url: p.siteUrl, permissionLevel: p.permissionLevel })),
        message: `Connected ${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('GSC OAuth callback error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'OAuth callback failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
