// "Do you need the pixel?" — per site, would an ad platform get enough conversions behind a
// cookie banner for its optimisation to be worth the banner? Pure; no '@/' imports (tested directly).

export type ReadinessState = 'no_primary_goal' | 'fix_goals' | 'aggregate_enough' | 'borderline' | 'attribution_pays';
export type PrimaryGoalStatus = 'healthy' | 'fires_too_often' | 'silent' | 'duplicate_primary' | null;

export interface ReadinessInput {
  hasPrimaryGoal: boolean;
  primaryGoalStatus: PrimaryGoalStatus;
  primaryConversions30d: number;
  /** Share of banner answers granting analytics (0..1), or null without banner data. */
  acceptanceRate: number | null;
  adsConnected: boolean;
  daysOfData: number;
}

export interface ReadinessResult {
  state: ReadinessState;
  effectiveConversions: number;
  acceptanceUsed: number;
  acceptanceAssumed: boolean;
  reasons: string[];
}

// Rule of thumb from Google's Smart Bidding guidance (target CPA ≈ 30, target ROAS ≈ 50
// conversions per 30 days). Verify against current Google Ads documentation before quoting
// these numbers in marketing copy.
export const SMART_BIDDING_MIN = 30;
export const SMART_BIDDING_COMFORTABLE = 50;
// Used when the site has no banner data of its own; always shown to the user as an assumption.
export const ASSUMED_ACCEPTANCE = 0.5;
export const MIN_DAYS_OF_DATA = 7;

export function assessPixelReadiness(input: ReadinessInput): ReadinessResult {
  const acceptanceAssumed = input.acceptanceRate === null || !Number.isFinite(input.acceptanceRate);
  const acceptanceUsed = acceptanceAssumed ? ASSUMED_ACCEPTANCE : Math.min(1, Math.max(0, input.acceptanceRate as number));
  const conversions = Math.max(0, Number.isFinite(input.primaryConversions30d) ? input.primaryConversions30d : 0);
  const effectiveConversions = Math.floor(conversions * acceptanceUsed + 1e-9);
  const result = (state: ReadinessState, reasons: string[]): ReadinessResult =>
    ({ state, effectiveConversions, acceptanceUsed, acceptanceAssumed, reasons });

  if (!input.hasPrimaryGoal) {
    return result('no_primary_goal', ['Mark one conversion goal as Primary to get a recommendation.']);
  }
  if (input.primaryGoalStatus && input.primaryGoalStatus !== 'healthy') {
    return result('fix_goals', [`The primary goal is flagged "${input.primaryGoalStatus.replace(/_/g, ' ')}". Fix it before deciding on ad tracking.`]);
  }

  const reasons: string[] = [];
  if (acceptanceAssumed) reasons.push(`No banner data yet — assumed ${Math.round(ASSUMED_ACCEPTANCE * 100)}% consent acceptance.`);
  if (input.daysOfData < MIN_DAYS_OF_DATA) reasons.push(`Only ${Math.max(0, input.daysOfData)} days of data — the recommendation will firm up.`);
  reasons.push(`${conversions} conversions × ${Math.round(acceptanceUsed * 100)}% acceptance ≈ ${effectiveConversions} an ad platform would see per 30 days.`);

  if (effectiveConversions < SMART_BIDDING_MIN) {
    reasons.push(`Below ~${SMART_BIDDING_MIN} per month, Smart Bidding has too little to learn from.`);
    return result('aggregate_enough', reasons);
  }
  if (effectiveConversions < SMART_BIDDING_COMFORTABLE) {
    reasons.push(`Between ~${SMART_BIDDING_MIN} and ~${SMART_BIDDING_COMFORTABLE}, Smart Bidding can work but learns slowly.`);
    return result('borderline', reasons);
  }
  if (!input.adsConnected) {
    reasons.push('Enough volume, but no ad platform is connected (no Google Ads customer ID).');
    return result('aggregate_enough', reasons);
  }
  reasons.push('Enough volume for Smart Bidding — consented click IDs and Enhanced Conversions should pay off.');
  return result('attribution_pays', reasons);
}
