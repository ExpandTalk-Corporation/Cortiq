// supabase/functions/_shared/jurisdiction/packs.ts
// Rule pack 2026.11.20-1: today's behaviour written as data. Every legal statement is a hypothesis.
// Raising a status to approved_internal is a reviewed commit that also fills `approval`.
import type { Pack, Rule } from './types.ts';
import { PRODUCTION_STATUSES } from './types.ts';

export const PACK_VERSION = '2026.11.20-1';
const ALL_BUT_EU = ['uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other'] as const;

const EU_AGGREGATE: Rule = {
  id: 'eu.statistics.aggregate', version: 1, markets: ['eu'], purposes: ['statistics', 'conversion'],
  technique: { storage: 'none', identifiers: 'none' }, outcome: 'allowed_unless_opt_out',
  status: 'reviewed_agent', law: null, relaxable: false, requiredLegalBasis: null,
  sources: [
    { title: 'Directive 2002/58/EC (ePrivacy) art. 5(3), consolidated', ref: 'CELEX:02002L0058-20091219', checked: '2026-11-20' },
    { title: 'Directive 2009/136/EC (amending Directive 2002/58/EC)', ref: 'CELEX:32009L0136', checked: '2026-11-20' },
    { title: 'Lag (2022:482) om elektronisk kommunikation 9 kap. 28 §, konsoliderad t.o.m. SFS 2026:1681', ref: 'SFS 2022:482', checked: '2026-11-20' },
    { title: 'Regulation (EU) 2016/679 art. 6(1)(f)', ref: 'CELEX:32016R0679', checked: '2026-11-20' },
    { title: 'EDPB Guidelines 2/2023 on Technical Scope of Art. 5(3) ePD, v2.0', ref: 'edpb.europa.eu', checked: '2026-11-20' },
    { title: 'CJEU C-673/17 Planet49 (1 October 2019)', ref: 'CELEX:62017CJ0673', checked: '2026-11-20' },
    { title: 'CJEU C-413/23 P EDPS v SRB (4 September 2025)', ref: 'CELEX:62023CJ0413', checked: '2026-11-20' },
    { title: 'DPA 1.5 § 4.1', ref: 'PR #69', checked: '2026-11-20' },
  ],
  uncertainties: [
    'EDPB Guidelines 2/2023 (v2.0, paras 33, 51, 53) treat JavaScript-instructed transmission as gaining access under art. 5(3). Under that reading consent is required in Sweden, as LEK 9 kap. 28 § has no audience-measurement exception.',
    'Art. 5(3) applies whether or not personal data is processed (C-673/17 Planet49); a GDPR legitimate-interest balance does not satisfy art. 5(3).',
    'The beacon reads the stored consent record (localStorage) and sends locally measured foreground time; both are arguments for access.',
    'No Swedish (PTS/IMY) or CJEU decision on consent-free cookieless audience measurement was found; supervisory practice may differ between member states.',
    'Refusals are read only from the CortIQ banner, Cookiebot, a Consent Mode `analytics_storage` update and GPC; other CMPs\' refusals are not honoured.',
    'Customer opt-in (`sites.aggregate_measurement`) is the control: the site owner, as controller, makes the legal assessment.',
    'Whether the daily-salted hash of IP and user agent is personal data for CortIQ and for the site owner during the UTC day (C-413/23 P, para 86: depends on means reasonably likely to identify). The IP address is processed in clear to compute the hash.',
  ],
  assessment: 'Hypothesis: counting page views and goals with a script that stores nothing on the device and sends no identifier that outlives one UTC day carries a low privacy impact, and a GDPR art. 6(1)(f) balance can favour the site owner when refusal and GPC are honoured. Whether art. 5(3) ePrivacy (LEK 9 kap. 28 §) requires consent is not settled: the EDPB (Guidelines 2/2023) treats script-instructed sending as access, and Swedish law has no audience-measurement exception. CortIQ offers the mode opt-in per site; the site owner makes the legal assessment.',
  effectiveFrom: '2026-10-30', approval: null,
};

const WORLD_AGGREGATE: Rule = {
  ...EU_AGGREGATE, id: 'world.statistics.aggregate', markets: [...ALL_BUT_EU], status: 'draft',
  sources: [{ title: 'Current aggregate-hit behaviour (counts every country)', ref: 'supabase/functions/aggregate-hit/index.ts', checked: '2026-11-20' }],
  uncertainties: [
    'No legal review covers markets outside the EU/EEA.',
    'UK: PECR Schedule A1 para 5 (in force 5 Feb 2026) may cover this if the site informs visitors and offers a simple free objection; whether para 5(2) affects use of IP/UA is not reviewed.',
    'Québec Law 25 (CQLR c. P-39.1, s. 8.1) not reviewed.',
    'Switzerland (FADP; Telecommunications Act art. 45c) and Brazil (LGPD) not reviewed.',
  ],
  assessment: 'Hypothesis: records today\'s behaviour outside the EU; not reviewed for any of these markets.',
  effectiveFrom: '2026-11-20',
};

const SERVER_LOG: Rule = {
  id: 'all.security.server_log', version: 1, markets: ['eu', ...ALL_BUT_EU], purposes: ['security'],
  technique: { storage: 'none', identifiers: 'none' }, outcome: 'allowed',
  status: 'draft', law: null, relaxable: false, requiredLegalBasis: null,
  sources: [
    { title: 'Directive 2002/58/EC (ePrivacy) art. 5(3), consolidated', ref: 'CELEX:02002L0058-20091219', checked: '2026-11-20' },
    { title: 'Lag (2022:482) om elektronisk kommunikation 9 kap. 28 §', ref: 'SFS 2022:482', checked: '2026-11-20' },
    { title: 'Regulation (EU) 2016/679 art. 6(1)(f)', ref: 'CELEX:32016R0679', checked: '2026-11-20' },
    { title: 'EDPB Guidelines 2/2023 on Technical Scope of Art. 5(3) ePD, v2.0, paras 42–43, 54–55', ref: 'edpb.europa.eu', checked: '2026-11-20' },
    { title: 'server-hit code comment and anonymizeIP implementation', ref: 'supabase/functions/server-hit/index.ts', checked: '2026-11-20' },
    { title: 'DPA 1.5 § 4.1', ref: 'PR #69', checked: '2026-11-20' },
  ],
  uncertainties: [
    'EDPB 2/2023 paras 42–43 and 54–55: IP address, user agent and HTTP headers can fall under art. 5(3); whether a passively received request is "access" is not settled (DPA 1.5 § 4.1).',
    'Truncated IP (/24 IPv4, /48 IPv6), UA and path are still personal data; the customer needs an art. 6(1)(f) balance and Art. 13/21(4) information; not available to public authorities in the performance of their tasks.',
    'Honeypot hits are stored for any user agent; agentic fetches act for a human user.',
    'Market-specific rules outside the EU (UK, CH, US, CA, BR) not reviewed.',
    'The jurist review recommends a measurement purpose and outcome `allowed_unless_opt_out` with a right to object before this rule can be approved; that change awaits further review.',
  ],
  assessment: 'Hypothesis: logging requests by known automated agents on the server, with truncated IP (/24 IPv4, /48 IPv6) and no device storage, is outside the consent requirement for terminal equipment.',
  effectiveFrom: '2026-11-20', approval: null,
};

export const PACK: Pack = { version: PACK_VERSION, rules: [EU_AGGREGATE, WORLD_AGGREGATE, SERVER_LOG] };

export function usable(rule: Rule, testSite: boolean): boolean {
  if (rule.status === 'suspended') return false;
  if (PRODUCTION_STATUSES.includes(rule.status)) return true;
  return testSite && (rule.status === 'draft' || rule.status === 'reviewed_agent');
}
