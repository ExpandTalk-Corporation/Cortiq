# Data Processing Agreement (DPA)

**Between:**

- **Data Controller:** The legal entity or individual ("Customer") who has registered an account with CortIQ and embeds the CortIQ tracking script or a CortIQ server-side adapter on their website(s).

- **Data Processor:** Expandtalk Corporation AB, org. nr. 559358-8824, registered office Göteborg, VAT no. SE559358882401, Parmmätaregatan 4B, 417 04 Göteborg, Sweden ("CortIQ").

**Version:** 1.2, dated 14 October 2026.

This Data Processing Agreement ("DPA") governs the processing of personal data by CortIQ on behalf of the Customer, in accordance with Article 28 of the General Data Protection Regulation (EU) 2016/679 ("GDPR"). It forms part of the CortIQ Terms of Service (https://cortiq.se/terms/) and is accepted together with them when the Customer creates an account. Installing the tracking script, plugin, Worker or a server-side adapter with the Customer's keys also confirms acceptance of the version then in force. In case of conflict regarding personal data, this DPA prevails over the Terms of Service.

---

## 1. Subject matter and duration

CortIQ processes personal data on behalf of the Customer for the purpose of providing web analytics services, including visitor behaviour tracking, server-side measurement of AI crawlers and agents, heatmap generation, conversion analysis and, where the Customer connects its CRM, lead-quality matching of consented conversions.

This DPA enters into force when the Customer accepts the Terms of Service and remains in effect for as long as CortIQ processes personal data on the Customer's behalf.

---

## 2. Nature and purpose of processing

| | |
|--|--|
| **Purpose** | (a) Web analytics — measuring visitor behaviour to improve the Customer's website (after visitor consent); (b) server-side AI-agent and crawler measurement for the Customer; (c) lead-quality matching of consented conversions against the Customer's CRM (optional) |
| **Nature** | Collection, storage, aggregation, analysis, matching and deletion of visitor data |
| **Categories of data — visitor analytics** | Pseudonymised visitor and session identifiers, page URLs, device type, browser family, geographic region, interaction events (clicks, scrolls, form activity), in-browser bot-check signals, hashed email addresses and advertising click IDs (marketing consent only). The tracking script does not record sessions |
| **Categories of data — server-side agent measurement** | For bot-like requests only: IP address truncated to /24 (IPv4) or /48 (IPv6) on the Customer's server before transfer, user agent, URL path, referrer, timestamp. Ordinary human requests are not transferred to CortIQ |
| **Categories of data — CRM lead-quality matching** | Only if the Customer connects HubSpot: the contact's email address sent by the Customer's HubSpot account, which CortIQ hashes with SHA-256 immediately on receipt and does not store or log in plain text, and the lead-status value. The hash and lead status are kept only where the hash matches a conversion recorded with marketing consent; otherwise the event is discarded |
| **Categories of data — script delivery** | When a browser loads the tracking script from cortiq.se, CortIQ's web host records a standard access log entry (IP address, user agent, requested file, time) |
| **Categories of data subjects** | Visitors to the Customer's website(s), including operators of automated clients (crawlers, AI agents); the Customer's CRM contacts, only where they match a consented conversion |
| **Retention period** | Per-site retention period set in the dashboard (default 365 days, also for sites without GDPR settings). Truncated IPs on AI-bot records are cleared after 30 days; raw Cloudflare log rows are kept at most 90 days. Web-host access logs follow the web host's log retention. Further details in the Privacy Policy, section 9 |

---

## 3. Obligations of the Data Processor (CortIQ)

CortIQ shall:

**3.1** Process personal data only on documented instructions from the Customer — including with regard to transfers of personal data to a third country — unless required to do so by Union or Member State law; in such a case, CortIQ shall inform the Customer of that legal requirement before processing.

**3.2** Ensure that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.

**3.3** Implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including:
- Encryption of data in transit (HTTPS/TLS) and at rest
- Row-Level Security (RLS) on all database tables ensuring per-Customer data isolation
- IP addresses truncated or not stored, depending on the data type (see the Privacy Policy)
- Access controls limiting staff access to personal data

**3.4** Not engage another processor (sub-processor) without prior written authorisation from the Customer. The Customer gives general written authorisation for the sub-processors listed in Section 6. CortIQ will inform the Customer of any intended changes to sub-processors, giving the Customer the opportunity to object (Section 6).

**3.4a** Impose on each sub-processor, by contract, the same data protection obligations as set out in this DPA, in particular sufficient guarantees to implement appropriate technical and organisational measures so that the processing meets the requirements of the GDPR (Art. 28.4 GDPR). Where a sub-processor fails to fulfil its data protection obligations, CortIQ remains fully liable to the Customer for the performance of that sub-processor's obligations.

**3.5** Assist the Customer, by appropriate technical and organisational measures, in fulfilling the Customer's obligation to respond to requests from data subjects exercising their rights under Chapter III of the GDPR.

**3.6** Assist the Customer in ensuring compliance with Articles 32–36 of the GDPR (security, breach notification, data protection impact assessments, prior consultation).

**3.7** At the Customer's choice, delete or return all personal data upon termination of the service, and delete existing copies unless Union or Member State law requires storage of the personal data. Data deletion upon account closure is completed within 30 days.

**3.8** Make available to the Customer all information necessary to demonstrate compliance with the obligations laid down in Article 28 of the GDPR, and allow for and contribute to audits and inspections conducted by the Customer or a mandated auditor. Audits are primarily carried out through written documentation; on-site audits may take place at most once a year, with at least 30 days' notice, at the Customer's expense, unless a personal data breach or a supervisory authority requires otherwise.

**3.9** Immediately inform the Customer if, in CortIQ's opinion, an instruction infringes the GDPR or other Union or Member State data protection provisions (Art. 28.3, last subparagraph, GDPR). CortIQ may suspend the processing concerned until the Customer has confirmed, amended or withdrawn the instruction.

---

## 4. Obligations of the Data Controller (Customer)

The Customer shall:

**4.1** Ensure a lawful basis exists for each category of personal data processed via CortIQ: consent for visitor analytics and the tracking script's in-browser bot checks, in both Cookieless and Full mode; for server-side agent measurement, the Customer's own legal basis (typically legitimate interest, Art. 6.1.f GDPR). Server-side agent measurement does not access the visitor's device; the Customer makes the final assessment of whether any consent requirement applies.

**4.2** Provide data subjects with adequate privacy information, including disclosure of CortIQ as a data processor. CortIQ provides a [Privacy Policy template](./GDPR.md) for this purpose.

**4.3** Configure the CortIQ cookie banner (or an equivalent CMP) to obtain and record valid consent before visitor analytics are activated.

**4.4** Not instruct CortIQ to process personal data in a manner that would violate the GDPR or other applicable data protection law.

**4.5** Respond without undue delay when CortIQ informs the Customer under section 3.9 that an instruction appears to infringe data protection law, by confirming, amending or withdrawing the instruction.

---

## 5. Data subject rights

Because CortIQ stores visitor data under hashed identifiers (not names or email addresses), it is not always technically possible to identify a specific individual's data records. Where technically feasible, CortIQ will assist the Customer in responding to:

- Access requests (Art. 15)
- Rectification requests (Art. 16)
- Erasure requests ("right to be forgotten") (Art. 17)
- Restriction requests (Art. 18)
- Data portability requests (Art. 20)

Requests should be submitted to: [info@expandtalk.se](mailto:info@expandtalk.se)

---

## 6. Sub-processors

This section is the authoritative list. Other CortIQ pages (for example the security page) refer to it.

### 6.1 Sub-processors

| Sub-processor | Role | Data location | Transfer basis (Section 7) | Agreement |
|---------------|------|---------------|----------------------------|-----------|
| Supabase, Inc. (USA) | Database, authentication and server functions for all processing. Supabase runs the CortIQ project on Amazon Web Services (AWS), which is Supabase's own sub-processor | EU — AWS eu-north-1 (Stockholm) | SCCs, Module 3 | [Supabase DPA](https://supabase.com/legal/dpa) |
| Loopia AB (Sweden) | Web host for cortiq.se, which serves the dashboard and the tracking script file. Its access logs record the IP address and user agent of browsers that load the script | Sweden | No transfer | Loopia's data processing agreement (appendix to its general terms) |
| Plus Five Five, Inc., trading as Resend (USA) | Email delivery of report exports — only when the Customer emails an export | USA | EU-US Data Privacy Framework; SCCs, Module 3 | [Resend DPA](https://resend.com/legal/dpa) |
| Cloudflare, Inc. (USA) | Server-side bot classification from edge logs, edge web analytics (aggregate) and geo lookup for consent-banner gating — only if the Customer enables the Cloudflare integration | Global edge network | EU-US Data Privacy Framework; SCCs | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |

The AI insights widget on the dashboard overview sends aggregated statistics for a site (page paths without query strings, page-view and session counts, device breakdown, form names and conversion rates) to OpenAI, L.L.C. (USA) using CortIQ's own API key. It sends no visitor identifiers, IP addresses or email addresses.

### 6.2 Services the Customer connects under its own agreement

The following providers are not sub-processors of CortIQ. The Customer connects its own account, key or property, and the provider acts under the Customer's own agreement with it. CortIQ sends or receives data only on the Customer's documented instruction, given by enabling the integration:

| Service | What happens | Whose account |
|---------|--------------|---------------|
| Google Analytics 4 and Google Search Console | CortIQ reads reports from the Customer's property, and can send conversion events to the Customer's GA4 property | The Customer's property, to which the Customer grants access |
| Google Ads | Upload of conversion adjustments (hashed email, click ID, conversion value) for conversions recorded with marketing consent | The Customer's Google Ads account and credentials |
| HubSpot | The Customer's HubSpot account sends lead-status changes to CortIQ (Section 2) | The Customer's HubSpot account and webhook secret |
| Anthropic (Claude API) | AI assistant and GEO analysis send relevant analytics results to Anthropic | The Customer's own Anthropic API key |
| Hosting of server-side adapters (for example Vercel, Netlify, Cloudflare Workers, the Customer's own Node server or WordPress host) | The adapter runs on the Customer's server and sends only bot-like requests to CortIQ | The Customer's own hosting account |

CortIQ will notify the Customer at least 30 days in advance of any intended change to the sub-processor list. The Customer may object to a new sub-processor within 14 days of notification; if no resolution is reached, either party may terminate the service agreement.

---

## 7. International transfers

Analytics data is stored in the EU. The basis for any transfer outside the EEA, per sub-processor:

- **Supabase, Inc.** — data is stored in AWS eu-north-1 (Stockholm). Supabase is a US company, and access to the data by Supabase or its own sub-processors from outside the EEA can be a transfer. Such transfers are covered by the European Commission's Standard Contractual Clauses (Implementing Decision (EU) 2021/914), Module 3 (processor to processor), which are incorporated in the Supabase DPA (Art. 46.2(c) GDPR). Supabase's DPA does not rely on the EU-US Data Privacy Framework.
- **Loopia AB** — processing in Sweden. No transfer.
- **Resend** — data is processed in the USA. Resend participates in the EU-US Data Privacy Framework (adequacy decision (EU) 2023/1795, Art. 45 GDPR). Its DPA also incorporates the SCCs, Module 3, for transfers where CortIQ acts as processor.
- **Cloudflare** — Cloudflare processes visitor IP addresses at its edge to derive country and aggregate traffic statistics. Cloudflare participates in the EU-US Data Privacy Framework (Art. 45 GDPR), and its DPA incorporates the SCCs (Art. 46 GDPR).
- **Customer-connected services (Section 6.2)** — CortIQ transfers data to these providers on the Customer's documented instruction. The transfer basis is governed by the Customer's own agreement with each provider.

On request, CortIQ provides the Customer with a copy of the transfer clauses that apply to a sub-processor.

---

## 8. Security breach notification

In the event of a personal data breach, CortIQ shall notify the Customer without undue delay, and no later than **72 hours** after becoming aware of the breach. Notification will include:

- Nature of the breach and categories of data affected
- Approximate number of data subjects affected
- Likely consequences of the breach
- Measures taken or proposed to address the breach

The Customer is responsible for notifying the relevant supervisory authority (e.g. IMY in Sweden, or the authority in the Customer's Member State) within 72 hours of being notified, where applicable.

---

## 9. Limitation of liability

To the maximum extent permitted by applicable law, CortIQ's total liability to the Customer under or in connection with this DPA shall not exceed the greater of:

- (a) the total fees paid by the Customer to CortIQ in the **12 months preceding the event** giving rise to the claim; or
- (b) **EUR 500**.

This limitation does not apply to damage caused intentionally or through gross negligence, or to liability that cannot be limited under applicable law, and does not affect data subjects' rights under Article 82 GDPR. Liability under this DPA and the Terms of Service is subject to one aggregate cap, set out in section 9 of the Terms of Service.

---

## 10. Governing law and jurisdiction

This DPA is governed by the laws of Sweden. Any disputes arising from this DPA shall be subject to the exclusive jurisdiction of the courts of Sweden, without prejudice to the data subject's right to lodge a complaint with a supervisory authority.

---

## 11. Contact

**Data Processor:**
Expandtalk Corporation AB
Parmmätaregatan 4B, 417 04 Göteborg, Sweden
Org. nr. 559358-8824
VAT no. SE559358882401
Email: [info@expandtalk.se](mailto:info@expandtalk.se)
Website: [cortiq.se](https://cortiq.se)

For all GDPR and data protection enquiries: [info@expandtalk.se](mailto:info@expandtalk.se)

---

*Version: 1.2, dated 14 October 2026 (replaces version 1.1 of 3 October 2026). Changes to this DPA follow the change procedure in section 12 of the Terms of Service.*

*Changes in 1.2: sub-processor list split into sub-processors and Customer-connected services, with Loopia AB added and AWS shown as Supabase's sub-processor; transfer basis stated per sub-processor; new sections 3.4a (obligations on sub-processors, Art. 28.4 GDPR) and 3.9 (notice of infringing instructions, Art. 28.3 GDPR); section 4.5 amended; CRM lead-quality matching added as a processing category; session recording removed, as the tracking script does not record sessions.*

---

> **For Customers:** You accept this DPA together with the Terms of Service when you create an account. If you require a countersigned copy for your compliance records, contact [info@expandtalk.se](mailto:info@expandtalk.se).
