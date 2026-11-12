// Tracking Check opens customers' pages in a real browser, so their tracker reports those runs
// like a visit. The probe marks its User-Agent with this token, and the ingest functions
// acknowledge such requests without storing anything: the run still sees the tracker's
// requests go out, and the customer's sessions and AI figures stay free of our own tests.
export const TRACKING_CHECK_UA_TOKEN = 'CortIQ-TrackingCheck';

export const isTrackingCheck = (req: Request): boolean =>
  (req.headers.get('user-agent') ?? '').includes(TRACKING_CHECK_UA_TOKEN);

/** A 200 that stores nothing, for a request from a Tracking Check run; null for anything else. */
export function skipTrackingCheck(req: Request, headers: Record<string, string>): Response | null {
  if (!isTrackingCheck(req)) return null;
  return new Response(JSON.stringify({ success: true, skipped: 'tracking_check' }),
    { headers: { ...headers, 'Content-Type': 'application/json' } });
}
