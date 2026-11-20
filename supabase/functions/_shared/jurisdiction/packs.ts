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
    { title: 'Directive 2002/58/EC (ePrivacy) art. 5(3)', ref: 'CELEX:32002L0058', checked: '2026-10-30' },
    { title: 'Lag (2022:482) om elektronisk kommunikation 9 kap. 28 §', ref: 'SFS 2022:482', checked: '2026-10-30' },
    { title: 'Regulation (EU) 2016/679 art. 6(1)(f)', ref: 'CELEX:32016R0679', checked: '2026-10-30' },
  ],
  uncertainties: [
    'Whether a daily-salted hash of IP and user agent is personal data for the site owner.',
    'National implementations of art. 5(3) outside Sweden were not reviewed.',
    'The review (PR #69, jurist agent) is not counsel review.',
  ],
  assessment: 'Hypothesis: counting page views without device storage and without identifiers that outlive one UTC day does not access the terminal equipment, and a legitimate-interest balance can favour the site owner when refusal and GPC are honoured.',
  effectiveFrom: '2026-10-30', approval: null,
};

const WORLD_AGGREGATE: Rule = {
  ...EU_AGGREGATE, id: 'world.statistics.aggregate', markets: [...ALL_BUT_EU], status: 'draft',
  sources: [{ title: 'Current aggregate-hit behaviour (counts every country)', ref: 'supabase/functions/aggregate-hit/index.ts', checked: '2026-11-20' }],
  uncertainties: ['No legal review covers markets outside the EU/EEA.', 'UK PECR reg. 6 and Québec Law 25 may treat this differently.'],
  assessment: 'Hypothesis: records today\'s behaviour outside the EU; not reviewed for any of these markets.',
  effectiveFrom: '2026-11-20',
};

const SERVER_LOG: Rule = {
  id: 'all.security.server_log', version: 1, markets: ['eu', ...ALL_BUT_EU], purposes: ['security'],
  technique: { storage: 'none', identifiers: 'none' }, outcome: 'allowed',
  status: 'draft', law: null, relaxable: false, requiredLegalBasis: null,
  sources: [{ title: 'server-hit code comment on server-side bot logging', ref: 'supabase/functions/server-hit/index.ts', checked: '2026-11-20' }],
  uncertainties: ['No legal review of server-side bot logging without consent.', 'Human visitors can be logged when an adapter misclassifies them.'],
  assessment: 'Hypothesis: logging requests by known automated agents on the server, with anonymised IP and no device storage, is outside the consent requirement for terminal equipment.',
  effectiveFrom: '2026-11-20', approval: null,
};

export const PACK: Pack = { version: PACK_VERSION, rules: [EU_AGGREGATE, WORLD_AGGREGATE, SERVER_LOG] };

export function usable(rule: Rule, testSite: boolean): boolean {
  if (rule.status === 'suspended') return false;
  if (PRODUCTION_STATUSES.includes(rule.status)) return true;
  return testSite && (rule.status === 'draft' || rule.status === 'reviewed_agent');
}
