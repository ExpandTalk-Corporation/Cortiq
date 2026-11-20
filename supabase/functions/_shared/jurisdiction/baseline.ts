// supabase/functions/_shared/jurisdiction/baseline.ts
// The strict baseline applies whenever no usable rule matches. CortIQ's technical default, not legal advice.
import type { Outcome, Purpose } from './types.ts';

export const BASELINE: Readonly<Record<Purpose, Outcome>> = {
  statistics: 'needs_opt_in', conversion: 'needs_opt_in', attribution: 'needs_opt_in',
  ad_platform_sharing: 'needs_opt_in', agent_measurement: 'needs_opt_in',
};
// Which consent category answers a needs_opt_in outcome.
export const CATEGORY: Readonly<Record<Purpose, 'analytics' | 'marketing'>> = {
  statistics: 'analytics', conversion: 'analytics', agent_measurement: 'analytics',
  attribution: 'marketing', ad_platform_sharing: 'marketing',
};
export const SHARING_PURPOSES: ReadonlySet<Purpose> = new Set(['attribution', 'ad_platform_sharing']);
