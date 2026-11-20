// supabase/functions/_shared/jurisdiction/types.ts
// Spec 2026-11-18 phase 3. Pure data types for the rule engine. Erasable TS only (node --test strips types).

export const PURPOSES = ['statistics', 'conversion', 'attribution', 'ad_platform_sharing', 'security'] as const;
export type Purpose = typeof PURPOSES[number];

export const OUTCOMES = ['allowed', 'allowed_unless_opt_out', 'needs_opt_in', 'blocked'] as const;
export type Outcome = typeof OUTCOMES[number];
export const OUTCOME_RANK: Readonly<Record<Outcome, number>> = { allowed: 0, allowed_unless_opt_out: 1, needs_opt_in: 2, blocked: 3 };

export const RULE_STATUSES = ['draft', 'reviewed_agent', 'approved_internal', 'reviewed_counsel', 'suspended'] as const;
export type RuleStatus = typeof RULE_STATUSES[number];
export const PRODUCTION_STATUSES: readonly RuleStatus[] = ['approved_internal', 'reviewed_counsel'];

export const MARKETS = ['eu', 'uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other'] as const;
export type Market = typeof MARKETS[number];

export type Storage = 'none' | 'session' | 'persistent';
export type Identifiers = 'none' | 'session' | 'cross_site';
export const STORAGE_RANK: Readonly<Record<Storage, number>> = { none: 0, session: 1, persistent: 2 };
export const IDENT_RANK: Readonly<Record<Identifiers, number>> = { none: 0, session: 1, cross_site: 2 };
export interface Technique { storage: Storage; identifiers: Identifiers }

// 'ip' = signed edge geo (same values as _shared/geo.ts GeoSource, plus 'adapter' for unsigned
// server-adapter claims). Everything except 'ip' is untrusted (spec: fail closed).
export type GeoSource = 'ip' | 'timezone' | 'unknown' | 'adapter';
export interface Visitor { country: string | null; region: string | null; geoSource: GeoSource }

export type Answer = 'yes' | 'no' | 'dont_know';
export interface CustomerProfile { establishment: string | null; markets: Market[]; appliesLaws: Record<string, Answer> }

export type Evidence = 'ledger' | 'tracker_gate' | 'none';
export interface Signals {
  consent: { analytics: boolean | null; marketing: boolean | null };
  evidence: Evidence;
  gpc: boolean;
  consentModeDefault?: 'granted' | 'denied';
  consentModeUpdate?: 'granted' | 'denied';
}

export const TIGHTEN_SETTINGS = ['default', 'opt_in', 'off'] as const;
export type Tighten = typeof TIGHTEN_SETTINGS[number];

export interface ApprovedException {
  ruleId: string; jurisdiction: Market; purpose: Purpose; legalBasis: string;
  assessmentRef: string; approvedBy: string; approvedAt: string; expiresAt: string;
}

export interface RuleSource { title: string; ref: string; checked: string }
export interface RuleApproval { approvedBy: string; approvedAt: string; reviewDue: string }
export interface Rule {
  id: string; version: number; markets: readonly Market[]; purposes: readonly Purpose[];
  technique: Technique;          // the most invasive technique this rule covers
  outcome: Outcome; status: RuleStatus;
  law: string | null;            // key into CustomerProfile.appliesLaws; null = always applies
  relaxable: boolean;            // true = only applies through an ApprovedException
  requiredLegalBasis: string | null;
  sources: readonly RuleSource[]; uncertainties: readonly string[]; assessment: string;
  effectiveFrom: string; approval: RuleApproval | null;
}
export interface Pack { version: string; rules: readonly Rule[] }

export type Reason = 'allowed' | 'opt_out' | 'gpc' | 'consent_missing' | 'consent_refused' | 'rule_blocked' | 'customer_off';
export type Fallback = 'unknown_geo' | 'no_profile' | null;

export interface DecideInput {
  visitor: Visitor; customer: CustomerProfile | null; purpose: Purpose; signals: Signals; technique: Technique;
  exceptions: readonly ApprovedException[]; tighten?: Partial<Record<Purpose, string>>;
  testSite?: boolean; now?: Date; pack?: Pack;
}
export interface Decision {
  outcome: Outcome; permit: boolean; reason: Reason; evidence: Evidence; constraints: Technique;
  ruleIds: string[]; markets: Market[]; fallback: Fallback; packVersion: string;
}
