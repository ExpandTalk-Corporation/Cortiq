// Banner acceptance (analytics) — shared by ConsentImpact and pixel readiness. No '@/' imports:
// the client is passed in so the foundation tests can call it directly.

/** Share of banner answers that granted analytics, or null when nobody has answered yet. */
export function acceptanceRate(rows: Array<{ consent_types: unknown }>): number | null {
  if (rows.length === 0) return null;
  const granted = rows.filter((r) => (r.consent_types as { analytics?: unknown } | null)?.analytics === true).length;
  return granted / rows.length;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAnalyticsAcceptance(client: any, siteId: string, sinceIso: string): Promise<number | null> {
  const { data } = await client
    .from('cookie_consents')
    .select('consent_types, created_at')
    .eq('site_id', siteId)
    .gte('created_at', sinceIso)
    .limit(2000);
  return acceptanceRate(data ?? []);
}
