# Consent & Cookie Banner Strategy

Status: **DRAFT for approval — superseded in part (see below)** · Owner: Daniel · Last updated: 2026-09-23

> **Current product position (2026-09):** Cookieless mode shipped, but it is **not** treated as consent-exempt. All visitor analytics — page views, sessions, clicks, scroll, heatmaps, forms, e-commerce, conversions, session recording, A/B tests — start only after analytics consent, in both Cookieless and Full mode (GDPR Art. 6.1.a / ePrivacy Art. 5.3). The banner always shows the Statistics toggle; consent is valid 12 months, then re-asked; a closed banner saves "necessary only". Without consent only the AI-bot / security layer runs (bot & agent detection, crawler classification, bot probe, honeypot, canary, AI-search/citation detection, Cloudflare edge-log bot classification), designed as strictly necessary security processing — the site operator makes the final legal assessment. Sections below that describe Cookieless as consent-exempt or banner-free are historical.

Goal: raise banner acceptance strictly within GDPR / ePrivacy. The original proposal was to make CortIQ's own analytics consent-exempt and remove the "Statistics" toggle; that was **not adopted** — Cookieless mode reduces data collected but still requires consent. Copy, UX nudging, Consent Mode v2 and platform features are the levers.

This doc covers five areas. Each ends with a **Decision** to approve or change.

---

## 0. The hard constraint (why #1 is not just copy)

ePrivacy Art. 5(3) (LEK in Sweden) requires consent for **storing or reading information on the user's device** — not for measurement itself. The CNIL/EDPB audience-measurement exemption allows consent-free analytics only if **all** of these hold:

- no cross-site tracking,
- **no device fingerprinting**,
- **no persistent cross-visit identifier**,
- IP truncated / not stored raw,
- first-party only, purpose limited to aggregate statistics,
- any first-party identifier is short-lived (session), not used to recognise the visitor on later visits.

**CortIQ does not meet this today.** From the code:

- `visitor-identification` builds a **device fingerprint** (SHA-256 of UA + screen + timezone + language + platform + canvas + WebGL) using a **static per-site salt** (`sites.fingerprint_salt`), and upserts `unified_visitors` to recognise **returning visitors** across visits.
- `spa-tracking.js` persists a visitor/session UUID client-side.

Fingerprinting + cross-visit identity are exactly what the exemption forbids. So "measure without a banner" is a real engineering mode, not a wording change. The dashboard copy ("cookie-free") already contradicts the implementation ("user agent fingerprints") — same root cause.

---

## 1. Cookieless mode  (shipped — consent still required)

Introduce **two explicit modes**, selectable per site in the WP plugin and in the CortIQ API (`sites` row):

### Mode A — Cookieless (consent-gated, data-minimised)
- **No device fingerprint.** Skip canvas/WebGL/UA fingerprinting.
- **No cross-visit identity.** No `unified_visitors` recognition across visits.
- **Daily-rotating salt** (Plausible/Fathom model): the server derives a per-day visitor hash = `SHA-256(daily_salt || truncated_IP || UA)` used only to count **unique visitors within that day**. The salt rotates at midnight and old salts are discarded, so the same person cannot be linked across days. Raw IP never stored.
- **No persistent client storage.** Session grouping uses an in-memory, per-tab id (lost on tab close). No localStorage, no cookie.
- Result: after analytics consent, heatmaps (grid-snapped), scroll depth, pageviews and sessions-within-a-visit work in aggregate. AI-bot detection runs without consent as part of the security layer.
- ~~The "Statistics" category disappears from the banner.~~ **Not adopted:** the banner always shows the Statistics toggle, and no visitor analytics run before consent in this mode.

### Mode B — Full (consent-gated)
- Current behaviour: fingerprint + returning-visitor identity + engagement-over-time. Requires the Statistics consent toggle. For customers who explicitly want visitor-level analytics and accept the banner cost.

### What Mode A loses vs Mode B
- Returning-visitor / new-vs-returning splits, engagement scores over time, visitor-level journeys across sessions/days.
- Keeps: traffic volume, top pages, referrers, heatmaps, scroll depth, sessions within a visit, unique-per-day counts, AI-bot/agent intelligence.

### Legal framing (important)
We describe the **technical basis** ("no device storage, no fingerprint, daily-rotating salt, IP truncated, aggregate only") and let the operator conclude. We do **not** print a categorical "no consent required under GDPR" — that's the customer's legal call, and it's a liability to assert it for them. This also fixes the dashboard-copy issue.

### Touch points
`spa-tracking.js` (skip identify + no client storage in Mode A), `visitor-identification` (stripped/daily-hash path), `track-event`/`ingest_pageview` (daily unique key), `sites` schema (`tracking_mode` column + `daily_salt` rotation), banner category rendering.

**Decision 1 (resolved):** Two modes shipped (Cookieless / Full, selectable as Tracking mode in the WP plugin). Both require analytics consent.

---

## 2. i18n + value-based copy

- **WP plugin:** read `get_locale()`, a flat PHP string table keyed by `sv_SE` / `en_US` / `de_DE` (default English), plus an admin dropdown: **Auto (WP locale) / English / Svenska / Deutsch**. Localise banner text + category names/descriptions.
- **JS snippet (Next/Astro):** `config.locale` + a JS string table; default from `navigator.language`.
- **Copy:** value-based, not legalistic. e.g. *"Hjälp oss förstå vad läsarna gillar"* over *"Helps us understand how visitors use the site"*. Short first layer, details behind "Visa detaljer" (already built).
- Keep it a **flat dictionary** — adding a language = adding a key. No i18n framework for 3 languages. `store-consent` already logs `locale` for the audit trail.

**Decision 2:** English default, ship sv + en + de now, structured for more. OK?

---

## 3. GDPR-safe banner UX nudge

Allowed and effective:
- **Modal/overlay** instead of a discrete corner banner (raises interaction rate). No **cookie wall** (blocking content is not allowed).
- **Prominent "Accept all"** next to a **clearly readable "Only necessary"** — both in the first layer. What gets banners struck down is a missing reject in the first layer, grey-on-grey text, or more clicks to reject than to accept. Contrast colour itself is fine (EDPB taskforce did not fault it).
- **Don't re-ask on rejection for 6–12 months**; renew consent by ~13 months. Constant re-prompting is a dark pattern.
- **Consent-level reopen icon states:** calm/filled at full accept, a subtle badge/tone at necessary-only — a soft invitation to reconsider. **No pulsing, blinking, or red-dot notifications** (manipulative, annoys more than it converts).

**Decision 3:** Go modal + prominent-accept + 12-month re-ask + subtle icon states?

---

## 4. GA4 & third-party tools — Consent Mode v2

- **Consent Mode v2** (required by Google since Mar 2024 for EEA ad traffic). Emit `gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})` **before** GA4 loads; update to `granted` when the visitor accepts Statistics/Marketing.
  - **Basic** (GA4 not loaded until consent — cleanest legally, most data loss) vs **Advanced** (cookieless pings + Google modelling — grey zone). **Default Basic**, let the customer opt into Advanced.
  - Note: the plugin currently outputs GA4 with **no** consent gating — this is a real gap to close.
- **Per-integration category mapping** (hard-coded): GA4 / Clarity / Hotjar → Statistics; Google Ads / Meta / TikTok → Marketing; GTM → warn (black box). 
- **Technical blocking, not promises:** unconsented third-party scripts must be `type="text/plain"` and rewritten to active on consent — not merely "we won't fire events".
- **Withdraw as easy as accept:** the reopen icon covers this. Be honest that we can delete first-party cookies via JS but can only stop *loading* third-party domains' cookies, not delete them.
- **Conservative GA4 defaults + checklist** when a customer connects GA4: EU data location, IP anonymisation (now automatic), no Google Signals, 2-month retention. "GA4 configured as EU-safe as possible" is a sales point.

**Decision 4:** Consent Mode v2 with Basic default + technical script blocking + category mapping?

---

## 5. CortIQ platform features (build after 1–4)

- **Geo-gating:** show the banner only in EEA/UK/CH via `CF-IPCountry` (already read in `_shared/jurisdiction.ts`) + a server-side API flag; implied/no banner elsewhere — whether that is acceptable outside the EEA is the operator's legal call. Low impact on primarily-Swedish traffic, but valuable for international customers — build as a platform feature, don't expect movement on itsäkerhet.com.
- **Integration risk badges** (Low/Medium/High) by out-of-EU transfer, cookie lifetime, sensitivity. GA4 = Medium (US transfer), CortIQ own = Low/None. Turns the hub into a compliance tool.
- **Live "Cookie banner preview"** in the Integration Hub — toggling an integration shows the banner change. Visually ties "fewer tools = simpler banner = higher acceptance".
- **Dashboard "Setup health check"** (top of Overview): script active ✓ / GDPR mode ✓ / consent log ✓ / GA4 with Consent Mode ✓, green-yellow-red.
- **Consent Impact view:** banner acceptance rate and consent-level breakdown. ~~CortIQ (all visitors) vs GA4 (consented only) gap~~ — not applicable: CortIQ visitor analytics are consent-gated too, so there is no "all visitors" measurement to compare against. Also enables A/B testing of banner colour/copy.

**Decision 5:** Build order within #5 — start with risk badges + health check (fast, high trust), then Consent Impact (after Mode A), then geo + preview?

---

## 6. Security / hygiene (cross-cutting, task #7)

- **Standardise the script host on `cortiq.se`** everywhere (no loading tracking from itsäkerhet.com etc. — looks off in customers' network logs).
- Confirm **no real API keys** render in the setup view / doc examples (tracking IDs + Supabase URL are public by design; keys are not).
- **Origin/site_id defense-in-depth** on ingest endpoints to reduce junk on others' tracking IDs. Rate-limiting per `site_id` already exists (`check_rate_limit`); RLS already on.

---

## Recommended sequence

1. **Cookieless mode** (shipped; data minimisation — consent still required).
2. **i18n + copy** (parallel, cheap).
3. **Banner UX nudge** (modal, prominent accept).
4. **Consent Mode v2** for GA4.
5. **Platform features** (risk badges + health check → Consent Impact → geo + preview).

Security hygiene (#6) folds into whichever plugin/dashboard work touches those files.
