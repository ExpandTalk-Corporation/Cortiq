// Who may use the headless browser (Tracking Check and heatmap screenshots).
// Until the browser runs under an EU agreement (browser-service/, DPA 1.5) only allowlisted accounts may
// use it: the hosted browser is not a listed sub-processor, so no customer data may reach it.
// Set TRACKING_CHECK_PUBLIC=true once the EU browser is live to open it to every confirmed account.
type User = { email?: string | null; email_confirmed_at?: string | null };

export function browserAccess(user: User) {
  const allowlist = (Deno.env.get('TRACKING_CHECK_ALLOWED_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const confirmed = !!user.email && !!user.email_confirmed_at;
  const listed = confirmed && allowlist.includes(user.email!.toLowerCase());
  const isPublic = Deno.env.get('TRACKING_CHECK_PUBLIC') === 'true';
  return { confirmed, listed, preview: !isPublic, allowed: confirmed && (isPublic || listed) };
}
