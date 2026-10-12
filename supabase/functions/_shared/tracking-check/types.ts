// Shared Tracking Check types. Erasable TypeScript only: runs in Deno and in Node tests.
export type Mode = 'comparison' | 'policy';
export type SiteRole = 'baseline' | 'target';
export type ConsentState = 'none' | 'reject' | 'accept' | 'analytics_only' | 'marketing_only';
export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';
/** How a consent state was reached. `not_needed`: no interaction required (state `none`, or no banner on the page). */
export type ConsentMethod = 'adapter' | 'text' | 'not_automated' | 'not_needed';

export interface RedirectHop { url: string; status: number }

export interface FetchObservation {
  requestedUrl: string;
  hops: RedirectHop[];               // every response in order; the last one is the final response
  finalUrl: string;
  finalStatus: number;
  paramsLost: string[];              // tracking params sent but missing from the final URL
  csp: Record<string, string[]> | null;
  challenge: boolean;                // bot-protection challenge page
  error: string | null;
}

export interface ObservedRequest { url: string; type: string }

export interface StateObservation {
  state: ConsentState;
  method: ConsentMethod;
  status: number;                                 // HTTP status of the main document (last load); 0 when unknown
  requests: ObservedRequest[];
  cookies: { name: string; domain: string }[];   // new since the consent action (all cookies for `none`)
  storageKeys: string[];                          // new since the consent action, without the local:/session: prefix
  cspViolations: { blockedUrl: string; directive: string }[];
  consentCommands: { kind: 'default' | 'update'; params: Record<string, string> }[];
  enhancedConversions: boolean;
  challenge: boolean;
  error: string | null;
}

export interface FormHit {
  provider: 'hubspot' | 'gravity_forms';
  formId: string;
  method: 'hs_context' | 'data_form_id' | 'embed_script' | 'gravity_class';
}

export interface BrowserObservation {
  url: string;
  cmp: string | null;
  states: StateObservation[];
  forms: FormHit[];
}

export interface PageObservation {
  path: string;
  legacy: boolean;
  fetch: FetchObservation | null;
  browser: BrowserObservation | null;
  failed: string | null;             // task failed all attempts
}

export interface SiteObservation { role: SiteRole; origin: string; pages: PageObservation[] }

export interface PolicyTemplate {
  noGoogleBeforeConsent: boolean;
  consentDefaultsDenied: boolean;
  ga4RequiresAnalytics: boolean;
  adsRequiresMarketing: boolean;
  enhancedConversionsOff: boolean;
  noUnknownVendorsAfterReject: boolean;
  expectedIds: string[];
  manualItems: { key: string; label: string }[];
}

export type Scope = 'Parameters' | 'Tags' | 'CSP' | 'Consent' | 'Forms' | 'Ads/GA4' | 'Manual' | 'Coverage';
export type FindingStatus = 'pass' | 'fail' | 'warning' | 'manual' | 'untestable';
export type Priority = 'high' | 'medium' | 'low';
export type Owner = 'developer' | 'gtm' | 'cmp' | 'marketing' | 'legal';

export interface Finding {
  scope: Scope;
  checkKey: string;
  title: string;
  status: FindingStatus;
  priority: Priority | null;
  explanation: string;
  fix: string;
  typicalOwner: Owner | null;
  evidence: { pages: string[]; details: string[] };
}

export interface AssessInput {
  mode: Mode;
  target: SiteObservation;
  baseline: SiteObservation | null;
  policy: PolicyTemplate | null;
}

export interface BasicAuth { username: string; password: string }

/** Values appended to every tested URL. Distinct values make lost parameters easy to spot. */
export const TRACKING_TEST_VALUES: Record<string, string> = {
  utm_source: 'cortiq_check',
  utm_medium: 'test',
  utm_campaign: 'tracking_check',
  gclid: 'TC_GCLID_TEST',
  gbraid: 'TC_GBRAID_TEST',
  wbraid: 'TC_WBRAID_TEST',
  fbclid: 'TC_FBCLID_TEST',
  msclkid: 'TC_MSCLKID_TEST',
  _gl: '1*tc*test',
};
export const TRACKING_PARAMS: string[] = Object.keys(TRACKING_TEST_VALUES);
