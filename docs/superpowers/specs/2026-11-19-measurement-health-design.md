# Measurement health, conversion alerts and traceable AI insights — design

Date: 2026-11-19 · Status: approved in chat, spec under review · Branch: `feat/measurement-health`

## Goal

A site owner sees at once when measurement or conversions break, and every number in an AI insight can be
traced to the calculation behind it. This is the slim "phase 1" of the larger analytics roadmap.

**Out of scope (enterprise licence, later):** segments, scheduled reports, roles, event contracts / JSON Schema
validation, statistical anomaly tests, and cleanup of the dead tables (funnels, segments, custom_reports,
scheduled_reports, ai_conversion_goals, kpi_ai_insights, …).

## Facts this design rests on (production, 2026-11-19)

- `tracking_events` is almost only page views (`event_type = 'view'`); there are no custom event names to
  inventory. The inventory is therefore a **signal inventory** (which data streams arrive, how much, last seen).
- 1 of 7 sites has conversion goals (3 goals); `conversion_events` has 0 rows.
- `form_sessions`: 160 rows on 4 sites (88 completed, 72 abandoned). A row is written at completion or
  abandonment only; there is no separate start event, so **starts = completed + abandoned**.
- `user_interactions` (button/link/nav clicks, 2 369 rows since 2026-11-12) has no `site_id`; it joins to a
  site through `session_id` → `tracking_sessions.site_id`.
- Goal health (`useConversionGoalHealth`) is computed in the browser only. Uptime and pipeline alerts are
  computed in SQL and shown by `PipelineAlerts.tsx`.
- The tracker does not report its version. `sites.sri_pinned_version` only records the last pinned snippet the
  owner copied.
- AI insights already store provenance in `agent_runs` (`queries_run`, `data_snapshot`) and `InsightCard` has a
  Sources toggle, but numbers in the text are free-form and unchecked.

## Decisions

- **A1** — Health and alerts are computed server-side, following the uptime / pipeline-freshness pattern.
- **B1** — The model never writes numbers. It references server-computed facts by id; the server renders values.
- **C1** — The "Alerts" tab becomes **"Measurement health"**. Overview keeps showing open alerts.
- Conversion alerts cover **both configured goals and measured forms** (user's choice), so they work on the four
  sites with form data even without goals.

---

## 1. Measurement health

### 1.1 RPC `get_measurement_health(p_site_id uuid)`

`SECURITY INVOKER`, `STABLE`; RLS decides access (a user only gets sites they own). Returns one JSON object:

```json
{
  "status": "ok | warning | broken",
  "checked_at": "…",
  "checks": [
    { "key": "uptime", "status": "ok|warning|broken|unknown", "evidence": { … } }
  ],
  "signals": [
    { "signal": "page_views", "count_7d": 0, "count_28d": 0, "last_seen": "…" }
  ]
}
```

`status` is the worst check status (`unknown` counts as `ok`). Sentences are not built in SQL. The UI turns
`key` + `evidence` into text through `_shared/measurement-health.ts`, so wording lives in one place and is
testable.

**Checks**

| key | Source | broken | warning |
|---|---|---|---|
| `uptime` | open `uptime_alerts` | open `down` alert | open `snippet_missing` alert |
| `pipelines` | open `pipeline_alerts` | — | any open alert |
| `goals_configured` | `sites.conversion_goals` | — | 0 goals |
| `goal_health` | goals × `conversion_events`, 30 d | — | any goal `silent`, `fires_too_often` or `duplicate_primary` |
| `consent_rate` | `cookie_consents.consent_types->>'analytics'` | — | rate over the last 7 d is ≥ 15 pp below the previous 28 d, with ≥ 30 choices in each window |
| `conversions` | open `conversion_alerts` (§2) | — | any open alert |

`goal_health` ports `matchesGoal` (`src/lib/goalMatching.ts`) to SQL: `event_name = goal.name`, or
`element_selector` contains the first comma-separated part of `goal.selector`. Both implementations get a
comment pointing at the other. Thresholds match the hook: firing rate > 0.30 of sessions (30 d
`tracking_sessions.started_at`), silent = 0 hits in 30 d. `useConversionGoalHealth` stays as it is for
`ConversionGoalsConfig` and pixel readiness; it is not rewritten in this phase.

**Tracker version** is not a SQL check (the SRI manifest lives in the frontend bundle). The RPC returns
`evidence.snippet_version` under `uptime`, and the UI compares it with `src/lib/sri-manifest.json`:
older than `latest` → warning "tracker x.y.z, latest is a.b.c"; any newer manifest version with
`securityFix: true` → broken. `null` (auto-updating snippet, or the version was not seen) → no message.

### 1.2 Tracker version seen on the home page

- New column `site_uptime.snippet_version text`.
- `_shared/uptime.ts` gets `snippetVersion(html): string | null`. It matches `/v/<semver>/cortiq.js`
  (pinned SRI install) or `cortiq…js?ver=<semver>` (WP plugin), and returns `null` otherwise.
- `site-uptime` passes it to `record_uptime_check` through a new optional parameter `p_snippet_version`
  (default `null`). The column is only overwritten when a value is found, so one failed fetch does not clear it.

### 1.3 Signal inventory

One row per signal for 7 d and 28 d, plus `last_seen`:

| signal | Table | Site filter |
|---|---|---|
| `page_views` | `page_views` | `site_id` |
| `clicks_button`, `clicks_link`, `clicks_nav` | `user_interactions` (`interaction_type`) | via `tracking_sessions.site_id` on `session_id` |
| `form_sessions` | `form_sessions` | `site_id` |
| `consent_choices` | `cookie_consents` | `site_id` |
| `aggregate_hits` | `aggregate_pages_daily` (sum of views) | `site_id` |
| `server_hits` | `ai_bot_traffic` where the source is not `js_tag` | `site_id` |
| `link_clicks` | `link_click_counts` | `site_id` |
| `conversions` | `conversion_events` | `site_id` |

Signals with 0 in both windows and no `last_seen` are still returned, so the UI can show "never seen". The
exact column names for `aggregate_pages_daily` and `ai_bot_traffic` follow `pipeline_activity()`, which already
reads them.

Performance: every count is bounded to 28 days on an indexed time column. If a query plan shows a sequential
scan on `user_interactions`, add `(session_id)` and `(created_at)` indexes in the same migration.

---

## 2. Conversion alerts

### 2.1 Table `conversion_alerts`

```
id uuid pk, site_id uuid → sites, kind text, subject text, detail jsonb,
opened_at timestamptz, resolved_at timestamptz,
opened_notified_at timestamptz, resolved_notified_at timestamptz
```

- `kind ∈ {goal_silent, form_zero_completions, form_abandon_spike}`. `subject` is the goal id or `form_id`.
- A unique partial index on `(site_id, kind, subject) WHERE resolved_at IS NULL` allows one open alert per subject.
- RLS: `SELECT` for `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())`; writes are service
  role only.
- Retention: resolved alerts older than 365 d are deleted in `run_data_retention()`.

### 2.2 Rules, all in `check_conversion_alerts()` (SECURITY DEFINER, service role only)

| kind | Opens when | Resolves when |
|---|---|---|
| `goal_silent` | the goal had ≥ 3 hits in the 28 d before the last 7 d, has 0 in the last 7 d, and the site has ≥ 50 page views in the last 7 d | ≥ 1 hit in the last 7 d, or the goal no longer exists |
| `form_zero_completions` | the form had ≥ 5 starts in the last 7 d, 0 completions, and ≥ 1 completion in the previous 28 d | ≥ 1 completion in the last 7 d |
| `form_abandon_spike` | ≥ 10 starts in both windows and the abandon rate in the last 7 d is ≥ 25 pp above the previous 28 d | the difference falls below 15 pp (hysteresis), or there are < 10 starts in the last 7 d |

Starts = completed + abandoned (§ Facts). `detail` stores the numbers that triggered the rule (counts and rates
for both windows), and the UI sentence is built from them, so an alert always shows its own evidence.

Thresholds are named constants at the top of the function, repeated in `_shared/conversion-alerts.ts` for the
UI text. A foundation test checks that both copies have the same values.

### 2.3 Scheduling and email

- `pipeline-freshness` (hourly, cron `41 * * * *`) calls `rpc('check_conversion_alerts')` after
  `check_pipeline_freshness`. No new cron or Edge Function.
- Email: the same Resend path and `opened_notified_at` / `resolved_notified_at` bookkeeping as pipeline
  alerts, active only when `RESEND_API_KEY` is set. The inline Resend call is moved to `_shared/resend.ts` and
  used by `pipeline-freshness` and `site-uptime` (small refactor, same behaviour).

---

## 3. Traceable AI insights

### 3.1 Fact sheet — `_shared/insight-facts.ts`

`buildFacts(data) → Fact[]` is a pure function (testable without a DB):

```ts
type Fact = {
  id: string;            // "m1", "m2", … stable order within one run
  label: string;         // "Form 'contact': abandon rate"
  value: number;
  unit: 'count' | 'percent' | 'seconds' | 'ratio';
  source: string;        // table or RPC, e.g. "form_sessions"
  period: { from: string; to: string };
  formula: string;       // "abandoned / (completed + abandoned)"
  rows: number;          // rows the value is computed from
};
```

Inputs come from the data the function already loads (`get_analytics_summary`, heatmap count, `form_analytics`),
plus `form_sessions` for the period, goal hits from `conversion_events`, and open alerts (uptime, pipeline,
conversion). Same-length previous-period values are added as separate facts (no computed deltas in the text;
a delta is its own fact with formula `current - previous`).

Data protection: facts are aggregates (counts, rates, paths without query strings). No new data categories go to
the AI provider, so DPA 1.5 is unaffected. This is noted in the PR, not reviewed by the jurist.

### 3.2 Prompt contract and validator

- The prompt lists facts as `m3 | Form 'contact': abandon rate | 41.2 percent | 2026-11-12..2026-11-18`, and
  instructs: every number in `title`, `description` and `actionItems` must be written as `{{mN}}`; never write a
  digit otherwise; no arithmetic.
- `validateInsight(insight, facts)` in `_shared/insight-facts.ts` returns `{ ok, errors[] }`:
  - it strips `{{mN}}` tokens, then rejects any remaining standalone number (a digit sequence with a word
    boundary on both sides, including forms like `41%`, `3.5` and `1,200`). Digits are allowed only inside a
    token that also contains letters (`GA4`, `H1`) or inside a URL path (a token starting with `/`). Both
    rules are covered by tests;
  - it rejects unknown ids;
  - it requires at least one token per insight (an insight without evidence is dropped).
- Flow: generate → validate each insight → if any fails, one retry with the error list appended → insights that
  still fail are dropped, and the count is stored in `agent_runs.data_snapshot.rejected`.

### 3.3 Storage

- `agent_runs.data_snapshot.facts` holds the full fact sheet. It is already per run, already behind RLS, and
  needs no new table.
- `dashboard_insights.data_points` holds the fact ids the insight uses. Text is stored with tokens, not
  rendered values, so the UI can always link a number to its fact.

### 3.4 UI

- `InsightCard` renders `{{mN}}` as the formatted value (percent → `41.2 %`, seconds → `1 m 12 s`), with a
  dotted underline. Clicking or focusing it opens a popover with label, source, period, formula and row count.
- Insights stored before this change (no tokens) render as today.
- An unknown token (data missing) renders as `—` with the popover text "fact not found", never as raw `{{m9}}`.

---

## 4. UI — "Measurement health" tab

- `navSections.ts`: the `alerts` item keeps its id (URLs and `TAB_ALIASES` keep working) and gets the label
  "Measurement health".
- Tab layout, top to bottom:
  1. **Status strip**: ok / warning / broken, with the number of open issues and `checked_at`.
  2. **Checks**: one row per check, showing its sentence and evidence. Each row links to where it is fixed
     (Goals tab, snippet setup, GDPR tab).
  3. **Open alerts**: `PipelineAlerts` extended with `conversion_alerts` (amber, with the triggering numbers).
  4. **Signals table**: signal, 7 d, 28 d, last seen. "Never seen" is muted, not red. Signals are informative,
     not failures.
  5. Existing `BehavioralAlertsTab`.
- Overview: `PipelineAlerts` also shows open conversion alerts. Nothing else changes on Overview.
- New hook `useMeasurementHealth(siteId)` (TanStack Query, keyed on site id to avoid the site-switch race noted
  in #159).
- Copy is English, factual, and contains no compliance claims.

## 5. Testing

Foundation tests (`npm run test:foundation`), no real customer data in fixtures:

- `uptime-snippet-version.test.mjs`: pinned path, WP `?ver=`, auto snippet → null, junk → null.
- `insight-facts.test.mjs`: `buildFacts` on synthetic input (ids, formulas, row counts); `validateInsight`
  accepts a tokenised text, rejects bare digits, unknown ids and insights without tokens, and respects the
  allowlist.
- `measurement-health-copy.test.mjs`: every check key and alert kind has a sentence; tracker version
  comparison against a sample manifest (older, security fix, latest, null).
- `conversion-alert-thresholds.test.mjs`: the SQL constants equal `_shared/conversion-alerts.ts`.
- SQL is verified after `db push` with `--read-only` queries: `get_measurement_health` for each site, and
  `check_conversion_alerts()` once by hand followed by `select * from conversion_alerts`.
- A manual browser check of the tab against the dev server, for one site with forms and one without data.

## 6. Delivery

One PR on `feat/measurement-health`, built in this order so each step is shippable:

1. Migration: `site_uptime.snippet_version`, `record_uptime_check` param, `conversion_alerts`,
   `check_conversion_alerts()`, `get_measurement_health()`, retention.
2. `_shared/uptime.ts` version parsing, `_shared/resend.ts`, `pipeline-freshness` + `site-uptime` updates.
3. Health tab + `useMeasurementHealth` + conversion alerts in `PipelineAlerts`.
4. Insight facts, validator, prompt change, `InsightCard` tokens.

Deploy: `db push --remote --yes`, then deploy `pipeline-freshness`, `site-uptime` and
`generate-dashboard-insights`, build dist and FTP. No tracker or WP plugin change, so no version bump.
