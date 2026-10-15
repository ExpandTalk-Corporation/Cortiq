// Anthropic BYOK key management (write-only from the browser's perspective).
// The key lives in company_secrets (service-role-only) and is NEVER returned to
// the client. The browser can only: check whether a key exists (status), set one,
// or remove it. Ownership is enforced via the caller's JWT against sites.user_id.

import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { action, companyId, key } = await req.json() as {
      action: 'status' | 'save' | 'remove';
      companyId: string;
      key?: string;
    };
    if (!companyId || !action) return json({ error: 'companyId and action are required' }, 400);

    // Ownership check: the caller must own at least one site under this company.
    // userClient is RLS-scoped, so this only returns rows the user may see.
    const { data: ownedSite } = await userClient
      .from('sites')
      .select('id')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();
    if (!ownedSite) return json({ error: 'Company not found or access denied' }, 403);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (action === 'status') {
      const { data } = await serviceClient
        .from('company_secrets')
        .select('anthropic_api_key')
        .eq('company_id', companyId)
        .maybeSingle();
      const raw = data?.anthropic_api_key ?? null;
      // Return only a boolean + a non-secret hint (last 4), never the key.
      return json({ hasKey: !!raw, last4: raw ? raw.slice(-4) : null });
    }

    if (action === 'save') {
      const trimmed = (key ?? '').trim();
      if (!trimmed.startsWith('sk-ant-')) return json({ error: 'Key must start with sk-ant-' }, 400);
      const { error } = await serviceClient
        .from('company_secrets')
        .upsert({ company_id: companyId, anthropic_api_key: trimmed, updated_at: new Date().toISOString() });
      if (error) return json({ error: 'Could not save key' }, 500);
      return json({ hasKey: true, last4: trimmed.slice(-4) });
    }

    if (action === 'remove') {
      const { error } = await serviceClient
        .from('company_secrets')
        .update({ anthropic_api_key: null, updated_at: new Date().toISOString() })
        .eq('company_id', companyId);
      if (error) return json({ error: 'Could not remove key' }, 500);
      return json({ hasKey: false, last4: null });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (_err) {
    return json({ error: 'Internal server error' }, 500);
  }
});
