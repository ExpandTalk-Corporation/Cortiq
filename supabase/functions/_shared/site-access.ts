// Authorize a signed-in user's access to one site before an Edge Function reads
// data for it with the service role.
//
// Access is decided by RLS on `sites` (owner, or organization member), by
// looking the site up with a client that carries the caller's own JWT — the same
// pattern as generate-dashboard-insights. Never trust a siteId from the body alone.
// deno-lint-ignore-file no-explicit-any

export type SiteAccess =
  | { ok: true; userId: string }
  | { ok: false; status: 400 | 401 | 403; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireSiteAccess(
  userClient: any,
  authorization: string | null,
  siteId: unknown,
): Promise<SiteAccess> {
  if (!authorization?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' };

  const token = authorization.slice('Bearer '.length);
  const { data: { user } = { user: null }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) return { ok: false, status: 401, error: 'Unauthorized' };

  if (typeof siteId !== 'string' || !UUID.test(siteId)) {
    return { ok: false, status: 400, error: 'Invalid siteId' };
  }

  const { data: site, error } = await userClient.from('sites').select('id').eq('id', siteId).maybeSingle();
  if (error || !site) return { ok: false, status: 403, error: 'Forbidden' };

  return { ok: true, userId: user.id };
}
