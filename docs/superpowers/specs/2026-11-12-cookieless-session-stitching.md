# Cookieless session stitching

Date: 2026-11-12 · Status: phase 1 built (tracker/plugin 5.5.14), phase 2 not started

## Problem

Up to 5.5.13, cookieless mode held the session id in memory only. Every full page load started a
new visit, so on a classic multi-page site a visit of five pages was counted as five one-page
visits. Visits were inflated, pages per visit and bounce rate were wrong, and source attribution
was lost after the landing page (reporting accuracy, point E).

## Phase 1: sessionStorage after consent (built)

- Cookieless mode keeps `cortiq_session_id` and `cortiq_session_expires` in sessionStorage, the
  same keys and inactivity timeout as full mode. The id is a random UUID, not a fingerprint.
- Written only after analytics consent (`hasStoredAnalyticsConsent`). Withdrawal removes both keys.
  The values are deleted when the tab closes.
- Still no cookies, no localStorage writes, no visitor identification, no click IDs, no email
  hashing in cookieless mode.
- Opt-out: `sessionStorage: false` in `cortiqConfig` or `data-session-storage="false"` on the script
  tag (WP plugin: "Memory only" under Cookieless). Keeps the 5.5.13 behaviour: nothing written,
  one visit per full page load.
- The opt-out is a snippet setting only. `sites` has no column for it, so the dashboard cannot
  show a "page-load sessions" note yet.
- Tests: `tests/foundation/cookieless-session-storage.test.mjs`.

Legal position: sessionStorage is storage on the terminal equipment (ePrivacy art. 5(3) / LEK
9 kap. 28 §), which is why it stays behind the same analytics consent as everything else in the
tracker. Copy says "sessionStorage after consent"; never "nothing stored" or "no consent needed".

## Phase 2: server-side hash (follow-up, not built)

Stitch page loads without any browser storage for operators who choose memory only:

- Session key = SHA-256 of a daily salt | site | IP | UA, computed in the edge function, like
  `aggregate-hit`. Salt deleted at the end of the UTC day.
- Consent-only: applied to events from the consented tracker, never to unconsented traffic.
- Before building: jurist review (the hash is still processing of personal data, and IP+UA
  linking across pages is a profiling question) and DPA 1.6 describing the processing.
- Open: interaction with the inactivity timeout, NAT/shared IPs merging visits, and whether
  phase 2 replaces or complements phase 1.
