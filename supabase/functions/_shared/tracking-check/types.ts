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
  /** Enforced policy: the Content-Security-Policy header, else a <meta http-equiv> policy in the page. */
  csp: Record<string, string[]> | null;
  /** Content-Security-Policy-Report-Only header. Absent in observations from before this field. */
  cspReportOnly?: Record<string, string[]> | null;
  challenge: boolean;                // bot-protection challenge page
  error: string | null;
}

/** Where a script came from: the page source, Google Tag Manager, the cookie banner, or another script. */
export type ScriptOrigin = 'page' | 'gtm' | 'cmp' | 'other';

export interface ObservedRequest {
  url: string;
  type: string;
  /** Scripts only: 'page' when the script is in the page source, else the URL of the script that injected it. */
  initiator?: string;
}

export interface StateObservation {
  state: ConsentState;
  method: ConsentMethod;
  status: number;                                 // HTTP status of the main document (last load); 0 when unknown
  requests: ObservedRequest[];
  cookies: { name: string; domain: string }[];   // set or written again since the consent action (all cookies for `none`)
  /** Cookies from before the consent action that were left untouched after it. Absent in observations from before this field. */
  keptCookies?: { name: string; domain: string }[];
  /** Local and session storage keys inside cross-origin frames (embeds), new since the consent action. Absent in older observations. */
  frameStorage?: { origin: string; key: string }[];
  storageKeys: string[];                          // new since the consent action, without the local:/session: prefix
  cspViolations: { blockedUrl: string; directive: string }[];
  consentCommands: { kind: 'default' | 'update'; params: Record<string, string> }[];
  enhancedConversions: boolean;
  challenge: boolean;
  error: string | null;
  /** Was a cookie banner (visible, adapter-specific, or a hidden/shadow/iframe CMP signal) observed before the consent action? A `method` of `adapter`/`text` is only trustworthy when this is true. */
  bannerSeen: boolean;
  /** After a CMP-adapter choice and a reload: was the CMP's own banner shown again? null when not measured (no adapter action, or its banner was not seen before). */
  bannerAfterChoice?: boolean | null;
}

export interface FormHit {
  provider: 'hubspot' | 'gravity_forms';
  formId: string;
  method: 'hs_context' | 'data_form_id' | 'embed_script' | 'gravity_class';
}

export interface HubSpotFormEmbed { legacy: boolean; v4: boolean; framed: boolean }

export interface BrowserObservation {
  url: string;
  cmp: string | null;
  states: StateObservation[];
  forms: FormHit[];
  /** HubSpot form embed seen in the rendered page; null when none. Absent in older observations. */
  hubspotForms?: HubSpotFormEmbed | null;
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
