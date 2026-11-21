> **DRAFT, not in force. Requires review by US counsel.**
> This text is not part of the DPA, the Terms of Service or any contract until US counsel has reviewed it and it is
> published as DPA version 1.8 under the change procedure in section 12 of the Terms of Service. The live DPA is
> `DPA.md` (version 1.7). Section references are working hypotheses for counsel to check; they are CortIQ's
> technical description, not legal advice.

# DPA addendum: California service provider terms (draft for DPA 1.8)

**Parties:** the Customer and Expandtalk Corporation AB ("CortIQ"), as in the DPA.

**Statutes and rules referred to:** California Consumer Privacy Act of 2018 as amended by the California Privacy
Rights Act, Cal. Civ. Code §1798.100 et seq. ("CCPA"); CCPA regulations, Cal. Code Regs. tit. 11, §7000 et seq.
("Regs").

---

## 0. Scope and order of precedence

**0.1** This addendum applies only where the Customer is a "business" under CCPA §1798.140(d) and CortIQ processes
"personal information" (§1798.140(v)) of California "consumers" (§1798.140(i)) on the Customer's behalf under the
DPA ("Customer Personal Information").

**0.2** For that processing CortIQ acts as the Customer's **service provider** (§1798.140(ag)). The addendum is the
written contract required by §1798.100(d), §1798.140(ag)(1) and Regs §7051(a).

**0.3** The addendum adds to the DPA and does not reduce any obligation in it. If the two conflict for Customer
Personal Information, the stricter term applies.

**0.4** Section 6 of this addendum lists flows that CortIQ runs only on the Customer's instruction and that may be
"sharing" by the Customer. The service provider terms in sections 1–5 apply to CortIQ's own processing in those flows
as well; section 6 states who is responsible for what the flow itself means under the CCPA.

---

## 1. No selling or sharing — Regs §7051(a)(1); CCPA §1798.140(ag)(1)(A)

**1.1** CortIQ shall not sell or share Customer Personal Information. "Sell" and "share" have the meanings in
§1798.140(ad) and §1798.140(ah).

**1.2** CortIQ does not provide cross-context behavioral advertising to the Customer or anyone else (Regs §7050(b)).

---

## 2. Specified business purposes — Regs §7051(a)(2); CCPA §1798.140(e)

**2.1** The Customer discloses Customer Personal Information to CortIQ only for the limited, specified business
purposes below. CortIQ processes it only for those purposes.

**2.2** The business purpose is **providing analytic services** (§1798.140(e)(5)). Where noted, it is also **helping
to ensure security and integrity** (§1798.140(e)(2)), to the extent the use is reasonably necessary and
proportionate. Per CortIQ feature:

| CortIQ feature | What CortIQ does for the Customer | Business purpose |
|---|---|---|
| Visitor analytics (Cookieless and Full mode, after the visitor's analytics consent) | Records page views, sessions, referrers, clicks, scroll depth, heatmaps, form interaction timing and conversions, and reports them to the Customer | Analytic services, §1798.140(e)(5) |
| Form analytics | Records which fields were focused, time in field and error counts; field contents are not read, except the self-reported source below | Analytic services, §1798.140(e)(5) |
| Self-reported source (optional) | Maps one select/radio answer, or one HubSpot property, to a fixed source category and reports aggregate counts | Analytic services, §1798.140(e)(5) |
| Aggregate measurement (optional) | Counts daily page views, visits, sources and goals using a hash with a salt that changes every UTC day | Analytic services, §1798.140(e)(5) |
| Server-side AI-agent and crawler measurement | Receives bot-like requests (truncated IP, user agent, path, referrer, time) from the Customer's server and classifies them | Analytic services, §1798.140(e)(5); security and integrity, §1798.140(e)(2) |
| In-browser bot checks | Classifies automated clients after analytics consent | Security and integrity, §1798.140(e)(2); analytic services, §1798.140(e)(5) |
| Conversion and lead-quality matching (optional) | Matches the hash of an email address from the Customer's CRM to a conversion recorded with marketing consent and stores the lead status | Analytic services, §1798.140(e)(5) |
| Consent records | Stores the visitor's consent choices, including Global Privacy Control, as proof of consent and to apply them | Analytic services, §1798.140(e)(5) (performing the service the Customer instructs) |
| Reports, exports, API and MCP access, AI insights on aggregated statistics | Delivers the above results to the Customer | Analytic services, §1798.140(e)(5) |

**2.3** The transfer of data to Google Ads and the HubSpot-to-Google-Ads flow are not business purposes of this
addendum. Section 6 covers them.

---

## 3. Limits on use — Regs §7051(a)(3), (a)(4); CCPA §1798.140(ag)(1)(B)–(D)

**3.1 — Regs §7051(a)(3).** CortIQ shall not retain, use or disclose Customer Personal Information for any purpose
other than the business purposes in section 2, including for any commercial purpose, except as the CCPA and the Regs
permit for service providers (Regs §7050(a)).

**3.2 — Regs §7051(a)(4).** CortIQ shall not retain, use or disclose Customer Personal Information outside the direct
business relationship between CortIQ and the Customer.

**3.3 — CCPA §1798.140(ag)(1)(D).** CortIQ shall not combine Customer Personal Information with personal information
it receives from or on behalf of another person, or collects from its own interaction with the consumer, except as
permitted by Regs §7050(a). Per-site data is isolated by row-level security; the bot classification registry is a
list of user-agent and network patterns, not consumer records.

---

## 4. Compliance and level of protection — Regs §7051(a)(5)

**4.1** CortIQ shall comply with the provisions of the CCPA and the Regs that apply to service providers, and shall
give Customer Personal Information the same level of privacy protection the CCPA requires of businesses.

**4.2** In particular, CortIQ shall:

- (a) cooperate with the Customer in responding to verifiable consumer requests (section 5.9);
- (b) maintain reasonable security procedures and practices appropriate to the nature of the information
  (§1798.81.5; §1798.100(e)), as described in DPA section 3.3;
- (c) honour opt-out preference signals in its own processing as described in section 6.4;
- (d) cooperate with the Customer's cybersecurity audit and risk assessment under Articles 9 and 10 of the Regs,
  including giving the Customer the facts it needs and not misrepresenting them (Regs §7050(h)).

---

## 5. Customer rights and request handling

**5.1 Reasonable steps to ensure proper use — Regs §7051(a)(6).** The Customer may take reasonable and appropriate
steps to ensure that CortIQ uses Customer Personal Information consistently with the Customer's CCPA obligations.
CortIQ supports this with written documentation on request, with the audit right in DPA section 3.8 (including
on-site audits at most once a year, on 30 days' notice), and with a written description of its controls at least
once every 12 months on request.

**5.2 Notice when CortIQ can no longer comply — Regs §7051(a)(7).** CortIQ shall notify the Customer **no later than
five business days** after it determines that it can no longer meet its obligations under the CCPA and the Regs.
The five-day period is a contractual choice; neither §7051(a)(7) nor §1798.100(d)(4) sets a deadline.

**5.3 Stop and remediate — Regs §7051(a)(8).** On notice, the Customer may take reasonable and appropriate steps to
stop and remediate unauthorised use of Customer Personal Information, including requiring CortIQ to provide
documentation that it no longer retains or uses the personal information of consumers who made a valid deletion
request. The Customer may also suspend an integration, delete a site (which deletes all of its data at once) or end
the service.

**5.4 Consumer requests — Regs §7051(a)(9).** The Customer shall inform CortIQ of any consumer request under the CCPA
that CortIQ must comply with, and give CortIQ the information it needs to do so. CortIQ will act on it within the
time that allows the Customer to meet its own deadline. Because CortIQ stores visitor data under pseudonymous
identifiers, the Customer should supply an identifier CortIQ holds (for example a session identifier or the hash of an
email address); DPA section 5 applies.

---

## 5A. Subprocessors — Regs §7051(b), §7050(a)(2)

**5A.1** CortIQ may engage the subprocessors in DPA section 6.1 to help it provide the business purposes in section 2:

| Subprocessor | Role (summary; DPA section 6.1 is authoritative) |
|---|---|
| Supabase, Inc. (USA), running on Amazon Web Services in eu-north-1 (Stockholm) | Database, authentication and server functions |
| Loopia AB (Sweden) | Web host for cortiq.se and the tracking script file; access logs |
| Plus Five Five, Inc., trading as Resend (USA) | Email delivery of large report exports (recipient address and an expiring link) |
| Anthropic, PBC (USA) | AI insights on aggregated statistics, using CortIQ's own key; no visitor identifiers |
| Cloudflare, Inc. (USA) | CortIQ's geo edge Worker (requests in transit; country and US state) and, if the Customer enables it, edge analytics |

**5A.2** CortIQ notifies the Customer of each engagement, as in DPA section 6 (at least 30 days before a new
subprocessor, with a right to object). Each engagement is under a written contract that binds the subprocessor to
terms equivalent to sections 1–5 of this addendum (Regs §7051(b)). CortIQ remains responsible to the Customer for each
subprocessor as in DPA section 3.4a.

**5A.3** Open point for counsel: the subprocessors' own standard terms are written mainly for GDPR. Whether each of
them contains the full set of Regs §7051(a) terms, or needs a separate CCPA addendum, has not been checked clause by
clause (question 1 below).

---

## 6. Flows on the Customer's instruction that may be "sharing" — carve-out

**6.1 The flows.** If the Customer enables them, CortIQ:

- (a) **Google Ads upload:** sends the Google click ID (gclid), a SHA-256 hash of an email address (where the visitor
  gave marketing consent at capture), the conversion value and time to the Customer's own Google Ads account, using
  the Customer's credentials and the conversion action the Customer picks;
- (b) **HubSpot to Google Ads:** receives lead-status changes from the Customer's HubSpot account, hashes the email on
  receipt, matches it to a consented conversion and queues qualified leads for upload under (a).

**6.2 CortIQ's role.** CortIQ performs these transfers only on the Customer's documented instruction, given by
connecting the accounts and picking the conversion action. Google's role and terms are between the Customer and
Google. Disclosing these identifiers to an advertising platform for ad measurement and bidding may be "sharing"
(§1798.140(ah)) by the Customer. CortIQ does not itself provide cross-context behavioral advertising (section 1.2).
How CortIQ's role is best described for these flows is open question 2.

**6.3 The Customer's responsibilities.** For these flows the Customer is responsible for:

- (a) the notice at collection and privacy policy disclosures about selling or sharing (§1798.100(a), §1798.130(a)(5));
- (b) the right to opt out of sale or sharing, including the "Do Not Sell or Share My Personal Information" link or
  alternative opt-out link and processing opt-out preference signals (§1798.135; Regs §7025, §7026);
- (c) any risk assessment the processing requires (Regs §7150(b)(1));
- (d) its own contract with Google and any obligations that apply to Google as recipient.

**6.4 What CortIQ does on an opt-out signal (technical defaults, not legal advice).**

- The tracking script treats Global Privacy Control as a refusal of marketing processing: no click IDs are captured
  and no email is hashed for upload.
- The consent service records the signal (`gpc_signal`) on the visitor's consent record and keeps it for that record;
  a later choice without the signal does not clear it (Regs §7025(c)(5)).
- Before each upload, and before a HubSpot lead is queued, CortIQ checks every consent record of the conversion's own
  session and of sessions linked to it on the same site (same click ID, same visitor, same email hash). If any of them
  carried the signal, the conversion is not uploaded (status `skipped_gpc`). If the check cannot be completed, nothing
  is uploaded and the row waits for the next run.
- Limit: CortIQ can only link sessions it knows about. A consumer who opts out by other means (for example a form or
  email to the Customer) must be passed to CortIQ under section 5.4, or the Customer must stop the integration.

**6.5** The Customer may turn either flow off at any time in the dashboard. Turning off the Google Ads connection stops
all uploads.

---

## 7. Changes

Changes to this addendum follow the change procedure in section 12 of the Terms of Service, as for the DPA.

---

## Open questions for US counsel

1. **Addendum text and subprocessors.** Does sections 0–6 meet §1798.100(d), §1798.140(ag)(1) and Regs §7051(a)(1)–(9)
   and (b)? Do the standard terms of Supabase, Loopia, Resend, Anthropic and Cloudflare bind them to equivalent terms,
   or does CortIQ need separate addenda? Should the addendum also cover the "contractor" role (§1798.140(j)) for any
   feature?
2. **Ads and HubSpot flows.** Do the Google Ads upload (gclid + hashed email + value) and the HubSpot-to-Ads flow count
   as "sharing" by the Customer? Does CortIQ's role in them stay that of a service provider, or does CortIQ need other
   wording (for example a transmission on the business's instruction outside the service provider purposes)? Is the
   sticky, linked-session GPC stop in 6.4 appropriate, given that Regs §7025(c)(3) allows a business to rely on
   consent when a signal conflicts with a business-specific setting? Fallback: under Regs §7050(b) a person that
   contracts to provide cross-context behavioral advertising is a third party for that work; if counsel finds the
   upload is such a service, CortIQ would need third-party contract terms under Regs §7053 for it.
3. **CIPA §631.** Is opt-in consent through the banner (analytics and marketing categories) enough to address
   California Invasion of Privacy Act §631 claims, including for form analytics (field focus, time and error counts,
   no field contents) and the self-reported source field?
4. **CIPA §638.51 and server-side agent measurement before 1 January 2027.** Server-side agent measurement processes
   bot-like requests (truncated IP, user agent, path, referrer) without the visitor's consent. Per the brief for this
   draft: SB 690 (Ch. 976, Stats. 2026), in force 1 January 2027, makes web §638.51 claims against private parties
   enforceable only by the Attorney General; the Variety Media tentative ruling (B350578) is not final. What is the
   exposure until then, and should the Customer documentation say anything more? Not verified against the chaptered
   text: secondary sources say SB 690 also applies to claims filed in the past two years, which would change the
   "until 1 January 2027" framing. Check on leginfo.
5. **Banner GPC text.** Does the consent banner's text and status display when it detects Global Privacy Control meet
   Regs §7025(c)(6)?
6. **cortiq.se and CortIQ's own status.** Does the California section of the cortiq.se privacy policy meet CalOPPA
   (Bus. & Prof. Code §22575, including the Do Not Track disclosure) and Regs §7011? Is Expandtalk Corporation AB a
   "business" under §1798.140(d) for its own processing (cortiq.se visitors and account holders), given its size and
   that cortiq.se runs no advertising pixels?
7. **Upcoming changes.** What do AB 566 (browser opt-out preference signals), the CPPA rulemaking on opt-out preference
   signals (OOPS), and the Delete Request and Opt-out Platform (DROP) package mean for CortIQ and its Customers, and
   should the addendum or the product anticipate them?
