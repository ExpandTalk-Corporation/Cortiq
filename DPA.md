# Data Processing Agreement (DPA)

**Between:**

- **Data Controller:** The legal entity or individual ("Customer") who has registered an account with CortIQ and embeds the CortIQ tracking script on their website(s).

- **Data Processor:** Expandtalk Corporation AB, org. nr. 559358-8824, Stenkolsgatan 5, 417 07 Göteborg, Sweden ("CortIQ").

This Data Processing Agreement ("DPA") is a standalone agreement that governs the processing of personal data by CortIQ on behalf of the Customer, in accordance with Article 28 of the General Data Protection Regulation (EU) 2016/679 ("GDPR"). It takes effect upon the Customer creating an account with CortIQ or embedding the CortIQ tracking script on their website, whichever occurs first.

---

## 1. Subject matter and duration

CortIQ processes personal data on behalf of the Customer for the purpose of providing web analytics services, including visitor behaviour tracking, AI agent detection, heatmap generation, session recording, and conversion analysis.

This DPA enters into force when the Customer creates an account with CortIQ and remains in effect for the duration of the service agreement.

---

## 2. Nature and purpose of processing

| | |
|--|--|
| **Purpose** | Web analytics — measuring visitor behaviour to improve the Customer's website |
| **Nature** | Collection, storage, aggregation, analysis, and deletion of visitor data |
| **Categories of data** | Anonymised visitor identifiers, page URLs, device type, browser family, geographic region, interaction events (clicks, scrolls, form activity), session recordings |
| **Categories of data subjects** | Visitors to the Customer's website(s) |
| **Retention period** | 730 days by default; configurable per site in the CortIQ dashboard |

---

## 3. Obligations of the Data Processor (CortIQ)

CortIQ shall:

**3.1** Process personal data only on documented instructions from the Customer — including with regard to transfers of personal data to a third country — unless required to do so by Union or Member State law; in such a case, CortIQ shall inform the Customer of that legal requirement before processing.

**3.2** Ensure that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.

**3.3** Implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including:
- Encryption of data in transit (HTTPS/TLS) and at rest
- Row-Level Security (RLS) on all database tables ensuring per-Customer data isolation
- IP address anonymisation (last octet masked) by default
- Access controls limiting staff access to personal data

**3.4** Not engage another processor (sub-processor) without prior written authorisation from the Customer. Current authorised sub-processors are listed in Section 6. CortIQ will inform the Customer of any intended changes to sub-processors, giving the Customer the opportunity to object.

**3.5** Assist the Customer, by appropriate technical and organisational measures, in fulfilling the Customer's obligation to respond to requests from data subjects exercising their rights under Chapter III of the GDPR.

**3.6** Assist the Customer in ensuring compliance with Articles 32–36 of the GDPR (security, breach notification, data protection impact assessments, prior consultation).

**3.7** At the Customer's choice, delete or return all personal data upon termination of the service, and delete existing copies unless Union or Member State law requires storage of the personal data. Data deletion upon account closure is completed within 30 days.

**3.8** Make available to the Customer all information necessary to demonstrate compliance with the obligations laid down in Article 28 of the GDPR, and allow for and contribute to audits and inspections conducted by the Customer or a mandated auditor.

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

Requests should be submitted to: [daniel@expandtalk.se](mailto:daniel@expandtalk.se)

---

## 6. Sub-processors

| Sub-processor | Role | Location | DPA / Privacy Policy |
|---------------|------|----------|----------------------|
| Supabase, Inc. | Database hosting, edge functions | EU (AWS eu-north-1, Stockholm) | [Supabase DPA](https://supabase.com/privacy) |
| Google LLC | GA4 server-side (optional, only if Customer configures GA4) | EU/US (SCCs in place) | [Google DPA](https://business.safety.google/adsprocessorterms/) |
| Amazon Web Services, Inc. | Cloud infrastructure (via Supabase) | EU (eu-north-1) | [AWS DPA](https://aws.amazon.com/agreement/) |
| Cloudflare, Inc. | Server-side bot classification from edge logs, edge web analytics (aggregate) and geo lookup for consent-banner gating — optional, only if the Customer enables the Cloudflare integration | US (EU-US Data Privacy Framework certified; SCCs) | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |

CortIQ will notify the Customer at least 30 days in advance of any intended change to the sub-processor list. The Customer may object to a new sub-processor within 14 days of notification; if no resolution is reached, either party may terminate the service agreement.

---

## 7. International transfers

All personal data is stored and processed within the European Economic Area (EEA) by default. Transfers outside the EEA occur only where the Customer enables an optional integration:

- **Google Analytics** — Google Standard Contractual Clauses (SCCs) apply.
- **Cloudflare edge analytics / geo lookup** — Cloudflare processes visitor IP addresses at its edge to derive country and aggregate traffic statistics. Transfers rely on Cloudflare's EU-US Data Privacy Framework certification and SCCs (Art. 46 GDPR). Cloudflare's EU data-localization options may be configured to keep processing within the EEA.
- **AI features (Anthropic) and advertising uploads (Google Ads, HubSpot)** — SCCs and, where applicable, EU-US DPF, together with pseudonymisation and data minimisation.

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

This limitation applies regardless of the form of action (contract, tort, or otherwise) and even if CortIQ has been advised of the possibility of such damages. It does not limit liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded under applicable law.

The Customer acknowledges that CortIQ's pricing reflects this allocation of risk.

---

## 10. Governing law and jurisdiction

This DPA is governed by the laws of Sweden. Any disputes arising from this DPA shall be subject to the exclusive jurisdiction of the courts of Sweden, without prejudice to the data subject's right to lodge a complaint with a supervisory authority.

---

## 11. Contact

**Data Processor:**
Expandtalk Corporation AB
Stenkolsgatan 5, 417 07 Göteborg, Sweden
Org. nr. 559358-8824
Email: [daniel@expandtalk.se](mailto:daniel@expandtalk.se)
Website: [cortiq.se](https://cortiq.se)

For all GDPR and data protection enquiries: [daniel@expandtalk.se](mailto:daniel@expandtalk.se)

---

*This DPA was last updated: 2026-06-03*
*Version: 1.0*

---

> **For Customers:** By creating an account with CortIQ or embedding the tracking script on your website, you agree to the terms of this DPA. If you require a countersigned copy for your compliance records, contact [daniel@expandtalk.se](mailto:daniel@expandtalk.se).
