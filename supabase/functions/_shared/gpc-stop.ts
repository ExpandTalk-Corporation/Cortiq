// Server-side Global Privacy Control stop for the paths that share data with an ad platform
// (google-ads-quality-upload, and hubspot-lead-webhook before it queues an upload).
//
// California (CPPA Regs §7025(c)(1)): an opt-out preference signal applies to the browser and to
// any pseudonymous profile tied to it, and to the consumer when the business knows who they are.
// §7025(c)(5): a later request without the signal is not consent to sell or share again.
// So one GPC on any consent record of a linked session stops the upload for good; the latest
// consent row (session-consent.ts) is not enough on its own.
//
// Where GPC is recorded: cookie_consents.gpc_signal, written by store-consent from the banner's
// gpc_signal field or a `Sec-GPC: 1` header (consent-geo.ts gpcRequested) and kept sticky there.
//
// Linked sessions of one conversion:
//   - its own tracking session (conversion_events.form_data.tracking_session_id),
//   - the sessions of every conversion on the same site with the same hashed email (the consumer,
//     when known) or the same gclid (the same ad click, i.e. the same browser),
//   - unified_visitors on the same site with the same gclid (first_session_id).
// Scope is one site: the site owner is the business that holds the opt-out.
//
// Fail closed: any lookup error or exception is a stop with reason 'gpc_unverified', so the row is
// never sent on an unverified answer (the caller returns it to pending for the next run).

// deno-lint-ignore-file no-explicit-any

export const GPC_MAX_SESSIONS = 200;
const SESSION_RE = /^[\x21-\x7e]{1,255}$/;

export type GpcStop = { stop: false; reason: null } | { stop: true; reason: 'gpc' | 'gpc_unverified' };

const rowsOf = (data: unknown): any[] => (Array.isArray(data) ? data : data ? [data] : []);

/** Valid, de-duplicated session ids from the conversion's own id and linked rows, capped. */
export function linkedSessionIds(own: unknown, linked: { conversions?: unknown; visitors?: unknown } = {}): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (out.size < GPC_MAX_SESSIONS && typeof v === 'string' && SESSION_RE.test(v)) out.add(v);
  };
  add(own);
  for (const r of rowsOf(linked.conversions)) add(r?.form_data?.tracking_session_id);
  for (const r of rowsOf(linked.visitors)) add(r?.first_session_id);
  return [...out];
}

/** True when any consent row carries a GPC signal. */
export function anyGpc(consentRows: unknown): boolean {
  return rowsOf(consentRows).some((r) => r?.gpc_signal === true);
}

const HEX64 = /^[0-9a-f]{64}$/;
const GCLID_RE = /^[A-Za-z0-9_\-.]{1,512}$/;

export async function gpcStop(
  client: any,
  siteId: string,
  conv: { sessionId: unknown; gclid?: unknown; hashedEmail?: unknown },
): Promise<GpcStop> {
  try {
    const failed = (r: { error?: unknown }) => !!r?.error;
    let conversions: unknown[] = [];
    let visitors: unknown[] = [];

    if (typeof conv.hashedEmail === 'string' && HEX64.test(conv.hashedEmail)) {
      const r = await client.from('conversion_events').select('form_data')
        .eq('site_id', siteId).eq('hashed_email', conv.hashedEmail).limit(GPC_MAX_SESSIONS);
      if (failed(r)) return { stop: true, reason: 'gpc_unverified' };
      conversions = conversions.concat(rowsOf(r.data));
    }
    if (typeof conv.gclid === 'string' && GCLID_RE.test(conv.gclid)) {
      const r = await client.from('conversion_events').select('form_data')
        .eq('site_id', siteId).eq('gclid', conv.gclid).limit(GPC_MAX_SESSIONS);
      if (failed(r)) return { stop: true, reason: 'gpc_unverified' };
      conversions = conversions.concat(rowsOf(r.data));
      const v = await client.from('unified_visitors').select('first_session_id')
        .eq('site_id', siteId).eq('gclid', conv.gclid).limit(GPC_MAX_SESSIONS);
      if (failed(v)) return { stop: true, reason: 'gpc_unverified' };
      visitors = rowsOf(v.data);
    }

    const ids = linkedSessionIds(conv.sessionId, { conversions, visitors });
    // No session to check: nothing proves the absence of a signal.
    if (ids.length === 0) return { stop: true, reason: 'gpc_unverified' };

    // Every row, not only the latest: a later row without GPC does not undo it (§7025(c)(5)).
    const c = await client.from('cookie_consents').select('session_id, gpc_signal')
      .eq('site_id', siteId).in('session_id', ids).eq('gpc_signal', true).limit(1);
    if (failed(c)) return { stop: true, reason: 'gpc_unverified' };
    return anyGpc(c.data) ? { stop: true, reason: 'gpc' } : { stop: false, reason: null };
  } catch {
    return { stop: true, reason: 'gpc_unverified' };
  }
}
