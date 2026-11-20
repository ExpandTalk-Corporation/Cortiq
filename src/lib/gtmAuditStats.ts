// Sends the anonymous, whitelisted counters from one GTM audit to the gtm-audit-stats edge function.
// Fire and forget: a failure never reaches the page. The container file itself is never sent.
import type { AuditStats } from '../../supabase/functions/_shared/gtm-audit/stats.ts';

const base = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
export const STATS_ENDPOINT: string | null = base ? `${base}/functions/v1/gtm-audit-stats` : null;

export async function sendAuditStats(stats: AuditStats, endpoint: string | null = STATS_ENDPOINT): Promise<void> {
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(stats),
      keepalive: true,
    });
  } catch {
    // Counters are best effort.
  }
}
