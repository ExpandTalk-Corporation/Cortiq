// Resolve the tracked site for a public ingest request.
//
// Tags send `siteId`, but not always a sites.id: the WordPress plugin sends the ACCOUNT id
// (sites.user_id) as siteId. track-event and store-consent already cope by resolving the
// page's domain; ai-bot-tracker and visitor-identification rejected those requests with
// 403, so plugin sites got no JS-tag bot data and no visitor profiles.
//
// Rule: an exact sites.id wins. Otherwise the page URL's domain is resolved (same RPC as
// the rest of the pipeline, handles www/IDN) and accepted only if that site belongs to the
// account id that was sent — a forged page URL cannot attribute data to someone else's site.
// deno-lint-ignore-file no-explicit-any

export interface ResolvedSite {
  id: string;
  is_active: boolean;
  [key: string]: unknown;
}

export async function resolveSite(
  supabase: any,
  siteId: string,
  pageUrl: string | null | undefined,
  columns = 'id, is_active',
): Promise<ResolvedSite | null> {
  const { data: direct } = await supabase.from('sites').select(columns).eq('id', siteId).maybeSingle();
  if (direct) return direct as ResolvedSite;

  if (!pageUrl) return null;
  let url: string;
  try { url = new URL(pageUrl).origin; } catch { return null; }

  const { data: domainSiteId } = await supabase.rpc('resolve_site_by_domain', { p_url: url });
  if (!domainSiteId) return null;

  const { data: site } = await supabase
    .from('sites')
    .select(`${columns}, user_id`)
    .eq('id', domainSiteId as string)
    .maybeSingle();
  if (!site || site.user_id !== siteId) return null;
  return site as ResolvedSite;
}
