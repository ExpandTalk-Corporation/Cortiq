=== CortIQ Analytics ===
Contributors: cortiq
Tags: analytics, ai-tracking, heatmap, cookie-free, gdpr, chatgpt, session-recording
Requires at least: 5.6
Tested up to: 6.8
Stable tag: 5.4.1
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Analytics for the agentic web. Track AI agents, human visitors and Core Web Vitals — cookie-free and GDPR-compliant.

== Description ==

CortIQ Analytics gives you a complete picture of who visits your site: human visitors and AI agents alike. AI-agent and bot detection runs as a strictly necessary security function; visitor analytics (page views, heatmaps, session recording) start only after the visitor gives analytics consent.

= What you can measure =

**AI agent traffic**
* Which AI agents visit your site: ChatGPT Browser, Perplexity Comet, Claude Browser, Gemini and others
* Which pages AI agents access and how often
* Citation tracking — when an LLM references your content
* AI agent conversion attribution — traffic and goals driven by AI referrals
* Browser type classification: Visual / Headless / Text-based

**Human visitor behaviour**
* Page views, sessions, bounce rate, time on site
* Traffic sources: organic, direct, referral, paid, social
* Click heatmaps — exact click positions per page and device type
* Scroll depth heatmaps — funnel showing how far visitors scroll (25 / 50 / 75 / 100%)
* Form analytics — field-level drop-off analysis
* Session recording — full replay of visitor interactions (with data masking for sensitive fields)
* User journey and navigation flow

**Conversion & testing**
* Goal tracking and conversion funnels
* A/B testing with statistical significance
* UTM campaign tracking

**Technical**
* Core Web Vitals (LCP, INP, CLS)
* Device, browser and geographic breakdown
* Data Warehouse export (BigQuery, Snowflake, Redshift, PostgreSQL)

= Privacy & GDPR =

AI-agent and bot detection runs without consent as a strictly necessary security function. Visitor analytics — in both Cookieless and Full mode — start only after the visitor grants Statistics consent via the built-in cookie banner. Cookieless mode additionally avoids fingerprinting and cross-visit profiles. You decide the legal basis for your site. The banner implements:
* Granular categories (Necessary / Preferences / Statistics / Marketing)
* No pre-ticked boxes for non-essential categories
* Consent ID and timestamp logging
* Google Consent Mode v2 — wired automatically if GA4 is configured
* IP anonymisation enabled by default

All data is stored in the EU.

= Requirements =

* A CortIQ account — [sign up at cortiq.se](https://cortiq.se)
* Site ID from the CortIQ dashboard (Settings → Setup)
* Tracking ID (API key) from the CortIQ dashboard

== Installation ==

1. Upload the `cortiq-analytics` folder to `/wp-content/plugins/`
2. Activate the plugin via the Plugins menu in WordPress
3. Go to **Settings → CortIQ Analytics**
4. Enter your **Site ID** (UUID from CortIQ dashboard → Settings → Setup)
5. Enter your **Tracking ID** (API key from the same page)
6. Optionally enter your **GA4 Measurement ID** (e.g. `G-XXXXXXXXXX`)
7. Save. Tracking starts immediately.

The plugin loads the CortIQ tracking script in `<head>` and shows the cookie consent banner in the footer. Both can be disabled independently.

== Frequently Asked Questions ==

= Do I need a cookie banner? =

Yes, for visitor analytics. CortIQ's page views, heatmaps and sessions start only after Statistics consent, also in Cookieless mode. Without a banner only AI-agent and bot detection runs. The built-in banner handles this, including Google Consent Mode v2 for GA4.

= Does this work alongside Google Analytics? =

Yes. Enter your GA4 Measurement ID in the plugin settings. CortIQ wires Google Consent Mode v2 automatically — GA4 only fires after the visitor accepts analytics cookies.

= Where is my data stored? =

All data is stored in the EU (AWS eu-north-1 via Supabase).

= Does the plugin slow down my site? =

The tracking script is loaded with `defer` so it does not block rendering.

= Can I mask sensitive fields in session recordings? =

Yes. Add `data-cortiq-mask` to any input or element. The field content is replaced with asterisks in the recording. See the [GDPR guide](https://github.com/expandtalk/cortiq/blob/main/GDPR.md) for details.

== Changelog ==

= 5.4.1 =
* Tracking script: AI-referral measurement (visitors arriving from ChatGPT, Perplexity, Claude, Gemini) now starts only after analytics consent. Only AI-bot and security detection runs without consent.

= 5.4.0 =
* Plugin and tracking script now share one version number; `spa-tracking.js` exposes it as `window.CortIQ.version`.
* Fix: consent choices now include `expiresAt`, which the current tracking script requires. Before this, a saved choice was ignored on the next page load and analytics stopped after the first page. Existing choices are upgraded automatically — visitors are not re-prompted. The tracking script also accepts choices saved by 5.3.x, so sites that have not updated yet keep working.
* The Statistics toggle is always shown: Cookieless mode now requires analytics consent too. Settings and readme text updated to match.

= 5.3.5 =
* Cache-bust: bumped version so browsers re-fetch the latest `spa-tracking.js` from the CDN. Ensures the updated consent behaviour (clicks, scroll, heatmaps and conversion capture now require analytics consent even in cookieless mode; aggregate page-view measurement stays banner-free) reaches installed sites. No settings change required.

= 5.3.4 =
* Optional geo-gating: show the cookie banner only to EEA / UK / Switzerland visitors (Privacy settings). Visitors elsewhere don't see it; cookie-free tracking still runs.

= 5.3.3 =
* GA4 Consent Mode v2 hardened: all six signals (adds functionality/personalization/security_storage), region-scoped defaults (EEA+UK+CH — visitors elsewhere aren't gated), ads_data_redaction + url_passthrough.
* New settings: geo scope for consent defaults, policy version (change to re-prompt everyone), and re-ask cooldown (days).

= 5.3.2 =
* Reopen control: for visitors on necessary-only it becomes a small labelled "Cookies" pill — a discreet, static invitation to reconsider (no animation, no notification dots). Full-consent visitors keep the plain icon.

= 5.3.1 =
* Banner: close (X) button. Dismissing saves "necessary only" — closing never implies consent (EDPB).
* Two more banner languages: Français and Português (now English, Svenska, Deutsch, Français, Português).

= 5.3.0 =
* Cookieless mode: consent-exempt audience measurement (no device storage, no fingerprint, no cross-visit profile) — removes the Statistics toggle from the banner. Choose Cookieless or Full per site under Tracking mode.
* Banner localisation: English, Svenska and Deutsch, auto-detected from the WordPress locale (or set it manually), with clearer value-based copy.
* GA4 Consent Mode v2: Basic (GA4 loads only after the visitor accepts Statistics — default) or Advanced (cookieless pings + modelling).
* Banner: a saved choice (including reject) is respected for ~12 months — no re-prompting. The reopen icon reflects the current consent level.

= 5.2.3 =
* Cookie banner: configurable accent colour — pick a preset, use the colour picker, or enter a custom hex value
* Smaller, subtler "reopen cookie settings" button; banner is slightly narrower
* Settings → CortIQ Analytics → "Banner color"

= 5.2.2 =
* Cookie banner button order: Accept all / Only necessary / Save selection

= 5.2.1 =
* Fix: page views, heatmaps and sessions now fire reliably (tracking script configuration)

= 5.2.0 =
* GDPR: consent decisions are recorded server-side as compliance proof (Art. 7), not just in the browser
* Cookie banner posts to the CortIQ consent ledger with policy-version tracking
* Enter the Site ID and Tracking ID exactly as shown in the CortIQ dashboard — both now work directly

= 5.1.0 =
* Unified single-file plugin — no class dependencies
* Full rebranding to CortIQ Analytics
* Improved settings page with live status indicators
* Legacy GA measurement ID migration (from pre-5.1 installs)

= 5.0.0 =
* AI agent detection: ChatGPT Browser, Perplexity Comet, Claude Browser
* Cookie-free server-side analytics
* GA4 server-side integration
* Agent-specific dashboards

= 4.2.0 =
* Google Site Kit integration
* Navigation sync

= 3.0.0 =
* Supabase backend integration
* Improved tracking with retry logic
