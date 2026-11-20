# CortIQ — GDPR & Privacy Compliance

CortIQ is designed to give you complete analytics coverage while staying within European data protection law. This document explains what data is collected, on what legal basis, and how to configure CortIQ for your use case.

---

## What runs when

CortIQ separates server-side agent measurement from everything that runs in the visitor's browser:

| Layer | Runs | Storage in the browser | Legal basis |
|-------|------|------------------------|-------------|
| **Server-side agent measurement** | Always (on your server or edge, not in the browser) | None — no device access | Typically legitimate interest (Art. 6.1.f GDPR); in our assessment not covered by ePrivacy Art. 5(3) (not settled) – the site operator makes the final assessment |
| **In-browser bot checks** (bot probe, honeypot, canary) | Only after analytics consent | `_ciq_adp` (sessionStorage), only for clients detected as automated | Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3) |
| **Visitor analytics — Cookieless mode** | Only after analytics consent | Session ID + its expiry time (sessionStorage, deleted when the tab closes); none if the site chooses memory only. No cookies, no fingerprint, no persistent IDs | Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3) |
| **Visitor analytics — Full mode** | Only after analytics consent | Session ID (sessionStorage) + persistent visitor ID for returning-visitor recognition | Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3) |
| **Marketing click IDs** (gclid, fbclid, …) | Only after marketing consent | Session storage | Consent (Art. 6.1.a GDPR) |

Consent is stored with an expiry: an accepted choice is valid for 12 months, a necessary-only choice for 180 days by default (setting, 1–400 days); after that the banner is shown again, never on every visit. Closing the banner without a choice saves "necessary only".

---

## Server-side agent measurement — no device access

Runs on your own server or edge: Next.js/Vercel middleware, Netlify Edge, Cloudflare Worker, Node/Express, the WordPress plugin, or any server through the HTTP API.

- Crawler and AI-agent classification (training / agentic / citation) from the request user agent
- robots.txt and llms.txt fetches
- Hits on a hidden honeypot link in your server-rendered HTML
- Only bot-like requests are sent to CortIQ; ordinary human requests never leave your server
- Data per request: timestamp, URL path, referrer, user agent, and the IP truncated to /24 (IPv6 /48) on your server before sending. CortIQ clears the truncated IP after 30 days

Most AI training and citation crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) never execute JavaScript, so this is also the only reliable way to see them.

The measurement reads only the HTTP request your server already receives and stores or reads nothing on the visitor's device. In our assessment it is therefore not covered by ePrivacy Art. 5(3) (Swedish LEK chapter 9, section 28), so cookie consent is not required for it. Note that the EDPB's Guidelines 2/2023 take a broad view of "gaining access" (paragraphs 42–43 and 55), so this is an interpretation, not settled law. You need a legal basis under the GDPR (typically legitimate interest, Art. 6(1)(f), with a documented balancing test; not available to public authorities in the performance of their tasks) and must describe the processing and the right to object (Art. 21) in your privacy policy.

The tracking script's in-browser bot checks (bot probe, honeypot, canary) read device properties, which is device access under Art. 5.3. They start only after analytics consent.

**Disclosure required:** Yes. Describe this processing in your privacy policy. See the [Privacy Policy Template](#privacy-policy-template) below.

---

## Visitor analytics — what is collected (after consent)

Activated only when a visitor accepts the "Statistics" category in the cookie banner. This applies in both Cookieless and Full mode.

- **Page views and sessions** — page URL, referrer, device type, browser family, viewport category
- **AI referrals** — visits arriving from AI services (ChatGPT, Perplexity, Claude, Gemini): referrer, landing URL, UTM parameters, time on page
- **IP address** — not stored by visitor analytics. Where an IP is kept (consent ledger, bot records) it is truncated before storage (e.g. 192.168.1.0); on bot records it is cleared after 30 days
- **Click positions** — x/y coordinates for heatmap generation
- **Scroll depth** — how far the visitor scrolled (25%, 50%, 75%, 100% milestones)
- **Form interactions** — which fields were filled, when the form was abandoned (not the content of the fields)
- **Self-reported source (Full mode, opt-in per site)** — if you configure a "how did you hear about us?" select or radio field, the option the visitor selects is mapped in the browser to a category from a fixed list (search engine, AI assistant, podcast, colleague or friend, other, …) and only the category is stored on the conversion. Text inputs and textareas are never read. See [Self-reported source](#self-reported-source-how-did-you-hear-about-us)
- **E-commerce and conversion events**
- **A/B test assignment**

**Cookieless mode:** no cookies, no fingerprint, no cross-visit profile, no persistent IDs. After analytics consent, page views within a visit are linked by a session id kept in sessionStorage for the tab's lifetime (operators can choose memory only: the session id is not stored, and every full page load starts a new visit). Consent is still required.

**Full mode:** a persistent visitor ID (derived from device characteristics) lets returning visits be recognised, and a session ID is kept in sessionStorage. Data is associated with a hashed visitor ID, not a name or email address.

**Legal basis:** Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3).

---

## Self-reported source ("how did you hear about us?")

Optional, Full mode only, off until you configure it (Settings → Integrations → Self-reported source). It records what buyers say about how they found you, one answer per conversion, as a category from a fixed list. Answers are recall, not fact.

- **Form path (analytics consent):** you name one select or radio field. On submit, with analytics consent, the tracking script reads the selected option, maps it to a category with your value list (trim + lower-case exact match, anything else becomes "other") and sends only the category. Free text, textareas and "other, please specify" fields are never read.
- **HubSpot path (marketing consent):** you name a HubSpot contact property (an enumeration/dropdown property is recommended). CortIQ maps its value to a category in memory and links it to a conversion through the email hash, which exists only with marketing consent. The raw value is not stored or logged. Unmatched contacts are dropped.
- **Policy version:** you set the policy version under which the updated banner and privacy text apply. Answers are only stored for visitors whose latest consent was given under that version.
- **Never shared:** the category is not sent to Google Ads, GA4 or AI services, and the dashboard shows it only in aggregate (counts below 5 are shown as "fewer than 5").
- **Your form:** tell people at the question itself that their answer is stored with their enquiry (Art. 13); a template is in Settings and in the [Privacy Policy Template](#privacy-policy-template). Do not offer answer options that reveal sensitive data (health, religion, political opinion, union membership, sexual orientation).

The CortIQ banner texts mention both paths. If you use your own CMP, update its Statistics and Marketing texts and bump your policy version.

---

## Data storage

- **Location:** EU (Supabase EU region, hosted on AWS eu-north-1)
- **Default retention:** 365 days, configurable per site (also for sites without GDPR settings). Truncated IPs on AI-bot records are cleared after 30 days; raw Cloudflare log rows are kept at most 90 days
- **Encryption:** All data in transit via HTTPS/TLS. Data at rest encrypted by Supabase.
- **Access control:** Row-Level Security (RLS) on all database tables. Each company's data is isolated.

---

## Data sub-processors

| Processor | Role | Location | DPA |
|-----------|------|----------|-----|
| Supabase | Database, edge functions | EU (AWS eu-north-1) | [DPA](https://supabase.com/privacy) |
| Google (optional) | GA4 if configured | EU/US | [DPA](https://business.safety.google/adsprocessorterms/) |
| Cloudflare (optional) | Edge web analytics (aggregate) + geo lookup for banner gating through CortIQ's own Cloudflare access, if the Cloudflare integration is enabled. The CortIQ Worker in **your** Cloudflare account is your own provider, not CortIQ's sub-processor | US (EU-US DPF; SCCs) | [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |

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

> The full DPA is available in [DPA.md](./DPA.md). Customers requiring a countersigned copy should contact [info@expandtalk.se](mailto:info@expandtalk.se).

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

**Measurement of bots and AI agents (server-side)**

Our server analyses technical data from incoming requests (user agent, requested page, referrer and a shortened IP address) to count and classify visits by bots and AI agents. Only requests that look automated are sent to CortIQ, our processor. Nothing is stored on or read from your device. [Adjust to your own assessment.]

The legal basis is our legitimate interest (Art. 6(1)(f) GDPR) in statistics on visits to our site by bots and AI agents: which agents visit, which pages they fetch and how often. **You have the right to object** to this processing at any time on grounds relating to your particular situation (Art. 21 GDPR); contact [CONTACT EMAIL]. You can also object automatically: if your browser or agent sends the Global Privacy Control signal (`Sec-GPC: 1`), we treat the request as an objection and we do not send it to CortIQ, so it is not included in these statistics. The shortened IP address is deleted after 30 days; other request data is kept for [X] days.

**Analytics (only after consent)**

If you accept the Statistics category in our cookie banner, we collect: visited pages, referrer, device type, browser family, anonymised IP address, click positions (heatmaps), scroll depth, form interaction data (not the content of the fields) and conversion events. Without your consent, none of this is collected.

[If you use the self-reported source form field:] When our form asks how you heard about us, the option you select is stored with your enquiry as a category from a fixed list (for example "search engine" or "podcast"). We use it, together with other enquiries, to see which channels people say led them to us. Text you type is not read.
[If you use the HubSpot path, add under Marketing:] If you accept the Marketing category, a hash of your email address is used to link your answer to "how did you hear about us?" in our customer system to your visit. Only a category is stored, and it is not sent to Google or other advertising platforms.

[Cookieless mode:] No cookies are set and no persistent identifier is stored. A session identifier is kept in your browser (sessionStorage) until you close the tab, so that page views within one visit can be linked; separate visits are not linked to each other. [If you chose memory only: The session identifier is held in memory and not stored in your browser.]
[Full mode:] We use a persistent visitor identifier, derived from technical characteristics of your device, so that returning visits can be recognised, and store a session identifier in your browser for the duration of your visit.

This processing is based on your consent (Art. 6.1.a GDPR). Your choice is stored for 12 months, after which we ask again. You can withdraw consent at any time via the cookie icon in the bottom corner.

**Data storage and retention**

All data is stored in the EU. We retain analytics data for [X] days (CortIQ's default is 365). Server-side bot measurement data: the shortened IP address is deleted after 30 days, other request data follows the same retention. You have the right to request deletion by contacting [CONTACT EMAIL].

**Processor:** CortIQ (Expandtalk Corporation AB), [https://cortiq.se](https://cortiq.se)

---

## Compliance checklist

- [ ] Privacy policy updated with the CortIQ analytics section above
- [ ] Cookie banner enabled — required for visitor analytics in both modes (or existing CMP configured to dispatch `siteConsentUpdated` event)
- [ ] Tracking mode (Cookieless / Full) chosen and matching paragraph kept in the privacy policy
- [ ] Data retention period reviewed and set in CortIQ dashboard
- [ ] GA4 server-side configured if using Google Analytics (avoids GA4 client-side cookies)
- [ ] Supabase project in EU region confirmed
