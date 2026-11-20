# GTM audit — conversion rules (engine v3)

Date: 2026-11-20. Builds on engine v2 (`2026-11-20-gtm-audit-destinations-dependencies-design.md`).
Origin: rules proposed 2026-11-18 from a real customer report. Fixtures stay synthetic (GTM-SAMPLE1, example.com);
never use a real customer's export.

## Scope

Three new checks. The fourth proposed rule (compare HubSpot form GUIDs in triggers with `form_registry`) needs a
logged-in entry point with the customer's own data; the public page has none and must never fetch. It is parked
until the audit gets a dashboard entry point.

All three use one shared definition of a conversion tag, in a new `conversions.ts`:

- `awct` (Google Ads conversion), and
- a tag of a registry vendor whose event text (same `EVENT_KEYS` join as `migrate.ts`) matches `CONVERSION_RE`
  (move the regex and keys to `conversions.ts`; `migrate.ts` and `rules/hygiene.ts` import them — no second copy).

Only effectively active tags count (`effectivelyActive` from `refs.ts`).

### 1. `gtm.conversion_on_every_page` — warning, high, owner marketing

A conversion tag whose firing trigger matches every page: the built-in All Pages / Initialization /
Consent Initialization trigger, or a Page View / DOM Ready / Window Loaded trigger with no conditions.
A page-view trigger with a condition (e.g. Page Path contains /thank-you) is the normal setup and passes.
A trigger group counts as every-page only when every member does.

Copy: title "N conversion tags fire on every page". Explanation: a conversion counted on every page view
inflates conversions and feeds the bidding algorithm the wrong signal. Fix: fire it on the confirmation page or
the form-submit event only. Details: `Tag (Vendor): trigger name`.

### 2. `gtm.conversion_double_count` — warning, high, owner marketing

Two or more conversion tags of the same vendor share a firing trigger but send different events
(different event text, e.g. two Google Ads conversion labels, or Meta Lead + CompleteRegistration).
Same vendor + same event + same trigger is already `gtm.duplicate` and is not repeated here.

Copy: one detail line per trigger: `Trigger: Tag A (label/event), Tag B (…)`. Explanation: one action is
counted as several conversions. In Google Ads only Primary actions are used for bidding — if one of them is set to
Secondary it is only reported, not double counted. Fix: keep one conversion per action, or set the others to
Secondary in Google Ads.

### 3. `gtm.enhanced_conversions_off` — manual, low, owner marketing

Active `awct` tags where the container shows no Enhanced Conversions:
EC counts as on when the tag's `enableEnhancedConversion` param is `"true"`, or the container has an active
`awud` / `awcc` tag, or a Google tag (`googtag`) whose params mention user-provided data
(`user_data` / `allow_enhanced_conversions`). Pass when no `awct` tag is active.

Status is `manual`: Enhanced Conversions can also be switched on in Google Ads itself (automatic EC), which the
container does not show. Copy must say both, and that EC sends hashed user data (e.g. email) to Google, which
needs marketing consent and a mention in the privacy policy. Never "you should turn it on" as advice without that.

## Engine and stats

- `CHECK_KEYS` gets the three keys (after `gtm.multiple_destinations`), `runRules` in the same order.
- `ENGINE_VERSION` 3. `validateStats` accepts v ≤ 3; the stats whitelist follows `CHECK_KEYS` automatically.
- **Deploy order:** redeploy `gtm-audit-stats` before the dist FTP (the v2 function rejects the new keys and `v: 3`).
- Page copy: any list of checks on `/gtm-audit/` names the new ones. Sample report regenerated
  (`node scripts/gtm-audit/sample-report.mjs`) with a synthetic container that triggers each rule.
- CLAUDE.md "GTM container audit": rule count and the parked form-GUID rule.
