# Data Processing Agreement (DPA)

**Between:**

- **Data Controller:** The legal entity or individual ("Customer") who has registered an account with CortIQ and embeds the CortIQ tracking script on their website(s).

- **Data Processor:** Expandtalk Corporation AB, org. nr. 559358-8824, Parmmätaregatan 4B, 417 04 Göteborg, Sweden ("CortIQ").

This Data Processing Agreement ("DPA") governs the processing of personal data by CortIQ on behalf of the Customer, in accordance with Article 28 of the General Data Protection Regulation (EU) 2016/679 ("GDPR"). It forms part of the CortIQ Terms of Service (https://cortiq.se/terms/) and is accepted together with them when the Customer creates an account. Installing the tracking script, plugin or Worker with the Customer's keys also confirms acceptance of the version then in force. In case of conflict regarding personal data, this DPA prevails over the Terms of Service.

---

## 1. Subject matter and duration

CortIQ processes personal data on behalf of the Customer for the purpose of providing web analytics services, including visitor behaviour tracking, AI agent detection, heatmap generation, session recording, and conversion analysis.

This DPA enters into force when the Customer accepts the Terms of Service and remains in effect for as long as CortIQ processes personal data on the Customer's behalf.

---

## 2. Nature and purpose of processing

| | |
|--|--|
| **Purpose** | Web analytics — measuring visitor behaviour to improve the Customer's website |
| **Nature** | Collection, storage, aggregation, analysis, and deletion of visitor data |
| **Categories of data** | Pseudonymised visitor and session identifiers, truncated IP addresses, page URLs, device type, browser family, geographic region, interaction events (clicks, scrolls, form activity), session recordings, hashed email addresses and advertising click IDs (marketing consent only) |
| **Categories of data subjects** | Visitors to the Customer's website(s) |
| **Retention period** | Per-site retention period set in the dashboard (default 365 days; 730 days for sites without GDPR settings). Security-layer retention as stated in the Privacy Policy, section 9 |

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

**3.4** Not engage another processor (sub-processor) without prior written authorisation from the Customer. Current authorised sub-processors are listed in Section 6. CortIQ will inform the Customer of any intended changes to sub-processors, giving the Customer the opportunity to object.

**3.5** Assist the Customer, by appropriate technical and organisational measures, in fulfilling the Customer's obligation to respond to requests from data subjects exercising their rights under Chapter III of the GDPR.

**3.6** Assist the Customer in ensuring compliance with Articles 32–36 of the GDPR (security, breach notification, data protection impact assessments, prior consultation).

**3.7** At the Customer's choice, delete or return all personal data upon termination of the service, and delete existing copies unless Union or Member State law requires storage of the personal data. Data deletion upon account closure is completed within 30 days.

**3.8** Make available to the Customer all information necessary to demonstrate compliance with the obligations laid down in Article 28 of the GDPR, and allow for and contribute to audits and inspections conducted by the Customer or a mandated auditor. Audits are primarily carried out through written documentation; on-site audits may take place at most once a year, with at least 30 days' notice, at the Customer's expense, unless a personal data breach or a supervisory authority requires otherwise.

---

## 4. Obligations of the Data Controller (Customer)

The Customer shall:

**4.1** Ensure a lawful basis exists for each category of personal data processed via CortIQ (e.g. consent for visitor analytics in both Cookieless and Full mode; the Customer's own assessment for the AI-bot / security layer, which is designed to run as strictly necessary security processing).

**4.2** Provide data subjects with adequate privacy information, including disclosure of CortIQ as a data processor. CortIQ provides a [Privacy Policy template](./GDPR.md) for this purpose.

**4.3** Configure the CortIQ cookie banner (or an equivalent CMP) to obtain and record valid consent before visitor analytics are activated.

**4.4** Not instruct CortIQ to process personal data in a manner that would violate the GDPR or other applicable data protection law.

**4.5** Inform CortIQ without undue delay if any instruction given to CortIQ would, in the Customer's opinion, infringe applicable data protection law.

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

| Sub-processor | Role | Location | DPA / Privacy Policy |
|---------------|------|----------|----------------------|
| Supabase, Inc. | Database hosting, edge functions | EU (AWS eu-north-1, Stockholm) | [Supabase DPA](https://supabase.com/privacy) |
| Google LLC | GA4 server-side (optional, only if Customer configures GA4) | EU/US (SCCs in place) | [Google DPA](https://business.safety.google/adsprocessorterms/) |
| Amazon Web Services, Inc. | Cloud infrastructure (via Supabase) | EU (eu-north-1) | [AWS DPA](https://aws.amazon.com/agreement/) |
| Resend, Inc. | Sending report exports by email — optional, only when the Customer emails an export | US (SCCs) | [Resend DPA](https://resend.com/legal/dpa) |
| Cloudflare, Inc. | Server-side bot classification from edge logs, edge web analytics (aggregate) and geo lookup for consent-banner gating — optional, only if the Customer enables the Cloudflare integration | US (EU-US Data Privacy Framework certified; SCCs) | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |

CortIQ will notify the Customer at least 30 days in advance of any intended change to the sub-processor list. The Customer may object to a new sub-processor within 14 days of notification; if no resolution is reached, either party may terminate the service agreement.

---

## 7. International transfers

All personal data is stored and processed within the European Economic Area (EEA) by default. Transfers outside the EEA occur only where the Customer enables an optional integration:

- **Google Analytics** — Google Standard Contractual Clauses (SCCs) apply.
- **Cloudflare edge analytics / geo lookup** — Cloudflare processes visitor IP addresses at its edge to derive country and aggregate traffic statistics. Transfers rely on Cloudflare's EU-US Data Privacy Framework certification and SCCs (Art. 46 GDPR). Cloudflare's EU data-localization options may be configured to keep processing within the EEA.
- **Customer-connected providers** — where the Customer connects its own account with a third-party provider (Anthropic with the Customer's own API key, Google Analytics, Google Ads, HubSpot), CortIQ transfers data to that provider on the Customer's documented instruction. That provider acts under the Customer's own agreement with it and is not a sub-processor of CortIQ.

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
Email: [info@expandtalk.se](mailto:info@expandtalk.se)
Website: [cortiq.se](https://cortiq.se)

For all GDPR and data protection enquiries: [info@expandtalk.se](mailto:info@expandtalk.se)

---

*This DPA was last updated: 2026-10-03*
*Version: 1.1 — changes to this DPA follow the change procedure in section 12 of the Terms of Service.*

---

> **For Customers:** You accept this DPA together with the Terms of Service when you create an account. If you require a countersigned copy for your compliance records, contact [info@expandtalk.se](mailto:info@expandtalk.se).
