// Session timeout (sites.session_timeout_minutes): a visit ends after this many minutes without
// tracked activity, as in GA4. Shared by track-event (Deno), the dashboard (snippet + settings)
// and the foundation tests (Node). The tracker (public/spa-tracking.js) has the same rule inline.

export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
export const MIN_SESSION_TIMEOUT_MINUTES = 5;
export const MAX_SESSION_TIMEOUT_MINUTES = 240;

/** Whole minutes from 5 to 240; anything else (missing column, null, junk) falls back to 30. */
export function normalizeSessionTimeout(value) {
  const n = value === null || value === undefined || value === '' ? NaN : Number(value);
  return Number.isInteger(n) && n >= MIN_SESSION_TIMEOUT_MINUTES && n <= MAX_SESSION_TIMEOUT_MINUTES
    ? n
    : DEFAULT_SESSION_TIMEOUT_MINUTES;
}
