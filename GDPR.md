# CortIQ — GDPR & Privacy Compliance

CortIQ is designed to give you complete analytics coverage while staying within European data protection law. This document explains what data is collected, on what legal basis, and how to configure CortIQ for your use case.

---

## What runs when

CortIQ separates an AI-bot / security layer from visitor analytics:

| Layer | Runs | Storage in the browser | Legal basis |
|-------|------|------------------------|-------------|
| **AI-bot / security layer** | Always | None | Designed as strictly necessary security processing — the site operator makes the final assessment |
| **Visitor analytics — Cookieless mode** | Only after analytics consent | None (no cookies, no fingerprint, no persistent IDs) | Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3) |
| **Visitor analytics — Full mode** | Only after analytics consent | Session ID (sessionStorage) + persistent visitor ID for returning-visitor recognition | Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3) |
| **Marketing click IDs** (gclid, fbclid, …) | Only after marketing consent | Session storage | Consent (Art. 6.1.a GDPR) |

Consent is stored with an expiry and is valid for 12 months; after that the banner is shown again. Closing the banner without a choice saves "necessary only".

---

## AI-bot / security layer — what runs without consent

- AI bot & agent detection and crawler classification (training / agentic / citation)
- Bot probe, honeypot and canary checks
- Server-side bot classification from Cloudflare edge logs (cloudflare-ingest), if the Cloudflare integration is enabled

This layer analyses request characteristics such as the user-agent and request patterns. It is designed to run as strictly necessary security processing (protecting the site against automated traffic). Whether that assessment holds for your site is your decision as data controller.

**Disclosure required:** Yes. Describe this processing in your privacy policy. See the [Privacy Policy Template](#privacy-policy-template) below.

---

## Visitor analytics — what is collected (after consent)

Activated only when a visitor accepts the "Statistics" category in the cookie banner. This applies in both Cookieless and Full mode.

- **Page views and sessions** — page URL, referrer, device type, browser family, viewport category
- **AI referrals** — visits arriving from AI services (ChatGPT, Perplexity, Claude, Gemini): referrer, landing URL, UTM parameters, time on page
- **Anonymised IP address** — last octet masked before storage (e.g. 192.168.1.0)
- **Click positions** — x/y coordinates for heatmap generation
- **Scroll depth** — how far the visitor scrolled (25%, 50%, 75%, 100% milestones)
- **Form interactions** — which fields were filled, when the form was abandoned (not the content of the fields)
- **E-commerce and conversion events**
- **Session recording** — a replay of the user's interaction with the page (inputs masked by default)
- **A/B test assignment**

**Cookieless mode:** no cookies, no fingerprint, no cross-visit profile, no persistent IDs. Page views within a visit are linked in memory only. Consent is still required.

**Full mode:** a persistent visitor ID (derived from device characteristics) lets returning visits be recognised, and a session ID is kept in sessionStorage. Data is associated with a hashed visitor ID, not a name or email address.

**Legal basis:** Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3).

---

## Data storage

- **Location:** EU (Supabase EU region, hosted on AWS eu-north-1)
- **Default retention:** 730 days, configurable per site
- **Encryption:** All data in transit via HTTPS/TLS. Data at rest encrypted by Supabase.
- **Access control:** Row-Level Security (RLS) on all database tables. Each company's data is isolated.

---

## Data sub-processors

| Processor | Role | Location | DPA |
|-----------|------|----------|-----|
| Supabase | Database, edge functions | EU (AWS eu-north-1) | [DPA](https://supabase.com/privacy) |
| Google (optional) | GA4 if configured | EU/US | [DPA](https://business.safety.google/adsprocessorterms/) |
| Cloudflare (optional) | Server-side bot classification from edge logs, edge web analytics (aggregate) + geo lookup for banner gating, if the Cloudflare integration is enabled | US (EU-US DPF; SCCs) | [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |

CortIQ does not sell or share visitor data with third parties for advertising.

---

## Data Processing Agreement (DPA) for CortIQ customers

CortIQ acts as a **data processor** on behalf of site owners (data controllers) who embed the tracking script. Under GDPR Art. 28, a written Data Processing Agreement is required between CortIQ and each customer.

**What this means for you as a CortIQ customer:**
- CortIQ processes visitor data on your behalf and under your instructions
- You remain the data controller — you decide what is collected and for what purpose
- A DPA must be in place before you go live in production

**Standard contractual commitments CortIQ makes:**
- Process data only for the purposes specified by the customer
- Implement appropriate technical and organisational security measures
- Delete data on customer request within 30 days
- Not engage sub-processors without informing the customer
- Assist with Subject Access Requests where technically possible

> The full DPA is available in [DPA.md](./DPA.md). Customers requiring a countersigned copy should contact [daniel@expandtalk.se](mailto:daniel@expandtalk.se).

---

## Visitor rights

CortIQ stores data under hashed visitor IDs, not names or email addresses. Cookieless-mode data is not linked across visits, so most Subject Access Requests (SARs) cannot be matched to an individual from CortIQ data alone. In Full mode, data can be located via the persistent visitor ID if the visitor provides it.

A visitor can withdraw analytics consent at any time via the cookie banner. Data collected before withdrawal is retained for the configured retention period.

Configure data deletion under **Settings → GDPR → Data Retention** in the CortIQ dashboard.

---

## Cookie banner configuration

The CortIQ cookie banner (included in the WordPress plugin and available as a standalone script) implements the following:

- Granular categories: Necessary / Preferences / Statistics / Marketing
- No pre-checked boxes for non-essential categories (compliant with CJEU Planet49 ruling)
- Consent ID and timestamp logged per user for audit trail
- Consent version tracking — banner re-shown if your policy version changes
- Consent expiry — each choice is stored with an expiry and is valid for 12 months, then re-asked
- Closing the banner saves "necessary only"
- Google Consent Mode v2 wired automatically when GA4 is configured

---

## WordPress plugin — privacy settings

| Setting | Recommended value | Notes |
|---------|-------------------|-------|
| Tracking mode | Cookieless or Full | Cookieless: no cookies or persistent IDs. Full: persistent visitor ID for returning visitors. Both require analytics consent |
| Show cookie banner | ✅ Enabled | Required for visitor analytics in both modes, unless another CMP is already active |
| Statistics toggle | Always shown | The banner always shows the Statistics category |
| Anonymise IP | ✅ Enabled | Always recommended |
| Exclude administrators | ✅ Enabled | Avoids polluting analytics with admin traffic |

---

## Privacy Policy Template

Copy this section into your site's privacy policy. Replace `[YOUR COMPANY]` and `[CONTACT EMAIL]`, keep the paragraph for the tracking mode you use, and review it with your own legal assessment.

---

### Analytics (CortIQ)

This website uses CortIQ Analytics to understand how visitors use the site.

**Bot and security protection (always active)**

To protect the website against automated traffic, we analyse technical request data (such as the browser user-agent and request patterns) to detect and classify bots and AI agents. No cookies are set for this. [Describe your legal basis for this processing.]

**Analytics (only after consent)**

If you accept the Statistics category in our cookie banner, we collect: visited pages, referrer, device type, browser family, anonymised IP address, click positions (heatmaps), scroll depth, form interaction data, conversion events and session recordings. Without your consent, none of this is collected.

[Cookieless mode:] No cookies are set and no persistent identifier is stored; visits are not linked to each other.
[Full mode:] We use a persistent visitor identifier, derived from technical characteristics of your device, so that returning visits can be recognised, and store a session identifier in your browser for the duration of your visit.

This processing is based on your consent (Art. 6.1.a GDPR). Your choice is stored for 12 months, after which we ask again. You can withdraw consent at any time via the cookie icon in the bottom corner.

**Data storage and retention**

All data is stored in the EU. We retain analytics data for [X] days. You have the right to request deletion by contacting [CONTACT EMAIL].

**Sub-processor:** CortIQ (Expandtalk Corporation AB), [https://cortiq.se](https://cortiq.se)

---

## Compliance checklist

- [ ] Privacy policy updated with the CortIQ analytics section above
- [ ] Cookie banner enabled — required for visitor analytics in both modes (or existing CMP configured to dispatch `siteConsentUpdated` event)
- [ ] Tracking mode (Cookieless / Full) chosen and matching paragraph kept in the privacy policy
- [ ] Data retention period reviewed and set in CortIQ dashboard
- [ ] GA4 server-side configured if using Google Analytics (avoids GA4 client-side cookies)
- [ ] Session recording: sensitive fields marked with `data-cortiq-mask`
- [ ] Supabase project in EU region confirmed
