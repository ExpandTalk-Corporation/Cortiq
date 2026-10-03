import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Never filter expired/denied rows before selecting the latest decision: doing so
// could resurrect an older grant after withdrawal. A profile flag is not consent.
export async function getSessionConsent(client: SupabaseClient, siteId: string, sessionId: string) {
  const { data, error } = await client.from('cookie_consents')
    .select('consent_given, consent_types, expires_at')
    .eq('site_id', siteId).eq('session_id', sessionId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error('Unable to verify session consent');
  const active = data?.consent_given === true &&
    typeof data.expires_at === 'string' && Date.parse(data.expires_at) > Date.now();
  return {
    analytics: active && data?.consent_types?.analytics === true,
    marketing: active && data?.consent_types?.marketing === true,
    preferences: active && data?.consent_types?.preferences === true,
  };
}
