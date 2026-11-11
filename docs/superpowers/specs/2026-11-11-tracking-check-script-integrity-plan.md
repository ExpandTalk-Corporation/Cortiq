# Tracking Check: script integrity, CSP quality and script change monitoring — plan

Status: phase A in progress (feat/tracking-check-csp-quality). 2026-11-11.

## Why

Two 2026 incidents (Plerdy/APT29, Convertr/Plausible) hit sites through analytics scripts whose content an
attacker replaced. Tracking Check already loads every page in a real browser in several consent states, records
every script request with its initiator (`page` / GTM / CMP / other) and parses the CSP header. What is missing:
whether scripts carry `integrity`, whether the CSP actually restricts scripts, and whether scripts change between runs.

## What exists (verified in code)

| Piece | Where |
|---|---|
| Script requests per consent state, with initiator | `browser-probe.js` `p.on('request')` → `StateObservation.requests` |
| Parsed CSP header of the main document | `fetch-probe.ts` `parseCsp` → `FetchObservation.csp` |
| CSP violations per state + `csp.blocked.*` findings | `browser-probe.js` `__tcCsp`, `assess/tags.ts` |
| Weekly/monthly reruns, diff vs previous run | `tracking_check_schedules`, `diff.ts` → `summary.diff` |
| Alert when a scheduled run has new problems | `worker-core.ts` → `recordScheduleAlert` → `alert_run_id` (dashboard only, no email) |

## Phase A — CSP quality (smallest; data already collected)

New findings in scope `CSP`, from `FetchObservation.csp`:

| checkKey | Status | When |
|---|---|---|
| `csp.missing` | warning | no `Content-Security-Policy` header |
| `csp.report_only` | warning | only `Content-Security-Policy-Report-Only` |
| `csp.script_src.wildcard` | warning | effective `script-src` contains `*`, `https:`, `http:` or `data:` |
| `csp.script_src.unsafe_inline` | warning | `'unsafe-inline'` without a nonce, hash or `'strict-dynamic'` |
| `csp.script_src.unsafe_eval` | warning (low) | `'unsafe-eval'` |
| `csp.policy.ok` | pass | none of the above |

- `fetch-probe.ts`: also parse `Content-Security-Policy-Report-Only`; note `<meta http-equiv>` CSP from the probe.
- Effective `script-src` = `script-src-elem` → `script-src` → `default-src` (same fallback as `cspAllows`).
- Fix texts point to nonce + `'strict-dynamic'`, including how that works with GTM. No fail status: most sites
  have no CSP; this is hardening, not a broken setup.
- Existing `csp.blocked.*` checks are unchanged.

## Phase B — Script inventory and missing `integrity`

Probe (`browser-probe.js`):
- After load in each state, read `document.scripts` (src, `integrity`, `crossorigin`) and join with the requests.
- In the accept-all state only, hash script bodies on `response` (SHA-256, Node `crypto`). Caps: 150 scripts,
  2 MB each. Store url, host, initiator, states it loaded in, integrity, sha256, bytes.

Findings (new scope `Scripts`):
- `scripts.sri.missing.<host>` — warning, medium: a third-party script in the page source without `integrity`.
- Scripts that cannot carry a fixed hash by design (GTM `gtm.js`, `gtag/js`, CMP loaders that update in place):
  `manual`, explaining that CSP and monitoring are the mitigation. Flag per vendor in `vendor-matrix.ts`
  (`sriPossible: false`), so we do not tell people to do something the vendor does not support.
- Scripts injected by GTM/CMP/other scripts: SRI cannot be set there; listed in the inventory only.
- `scripts.sri.ok` — pass: every external script is first-party or has `integrity`.

Report: a "Scripts" table (URL, host, loaded by, before/after consent, integrity, hash) and a sheet in the Excel export.
Consent column is our angle: scripts that run before consent are both a GDPR and a supply-chain finding.

## Phase C — Change monitoring between runs

- Storage: table `tracking_check_scripts (run_id, page_path, url, host, initiator, states, integrity, sha256, bytes)`,
  RLS like the other tracking-check tables, deleted with the run.
- `diff.ts`: `newScripts`, `removedScripts`, `changedScripts` (same URL without query string, different hash),
  `newScriptHosts`. Shown under "Changes since <date>".
- Noise control: known vendors that change their files often (gtm.js changes on every container publish) are
  shown as "updated" without alerting. Alert on: a new host, a changed first-party or unknown script, a changed
  script that had `integrity`, a new script loaded before consent.
- Alert: extend the `hasNewProblems` condition with these script changes; same `alert_run_id` path.
  Email needs a mail provider key (none set today) — separate decision.

## Phase D (optional) — Authorise scripts (PCI DSS 4.0 6.4.3 / 11.6.1)

6.4.3 requires an inventory of payment-page scripts with a justification and authorisation for each; 11.6.1
requires change detection at least weekly. With phases B–C, add: "approve" per script/host with a justification,
stored per schedule; unapproved scripts become findings. Daily schedules for payment pages.

## Limits to state in the report and on any public page

- We see what one headless browser in one location sees. Skimmers that target only checkout pages, skip bots or
  select visitors by country are not guaranteed to show up. This is not in-browser monitoring of real visitors.
- Pages behind login are covered only when credentials are given, and those runs cannot be scheduled.
- No claims about PCI compliance; at most "helps with the inventory and change detection in 6.4.3/11.6.1".

## Order and size

A (1 PR, small) → B (1 PR, probe + assess + report) → C (1 PR, migration + diff + alert) → D (decide later).
Each PR: tests in `tests/` for assess/diff, worker + start redeployed, dist FTP for report UI.

## Decisions (2026-11-11)

1. New scope `Scripts` (Tags answers "does the tag fire with the right consent"; Scripts answers "what runs and has it changed").
2. Hash bodies in every run, accept-all state only. The browser already downloads the files; hashing costs milliseconds
   and one CDP call per script. Browser minutes are the cost driver, not hashing.
3. No daily schedules now. Keep weekly/monthly. Later, if wanted: a light "scripts only" run (one state, chosen pages)
   as the cheap option for frequent monitoring.
4. Alerts by email only. Needs a mail provider key (Resend, free tier at current volume); not in the dashboard.
