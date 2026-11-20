/**
 * GTM container audit — engine types. Pure data; shared by the public /gtm-audit page (browser),
 * the gtm-audit-stats edge function and the Node tests.
 */
import type { Finding } from '../tracking-check/types.ts';
import type { Vendor } from '../tracking-vendors.ts';

export type ParamValue = string | ParamValue[] | { [key: string]: ParamValue };

export interface GtmTag {
  id: string;
  name: string;
  type: string;
  params: Record<string, ParamValue>;
  firingTriggerIds: string[];
  blockingTriggerIds: string[];
  consent: { status: 'needed' | 'not_needed' | 'not_set'; types: string[] };
  paused: boolean;
  folderId: string | null;
  /** ms epoch from the tag fingerprint; null when the fingerprint is not a timestamp. */
  modifiedAt: number | null;
  /** Tag names in "Fire a tag before / after this tag fires" (setupTag / teardownTag). */
  setupTagNames: string[];
  teardownTagNames: string[];
}

export interface GtmCondition { type: string; arg0: string; arg1: string; negate: boolean }

/** A trigger's custom-event condition on {{_event}}, when it has one that is not negated. */
export interface CustomEventMatch { match: 'equals' | 'contains' | 'starts_with' | 'regex'; value: string }

export interface GtmTrigger {
  id: string;
  name: string;
  type: string;
  conditions: GtmCondition[];
  /** All Pages / Initialization / Consent Initialization: not in trigger[], added from fixed IDs. */
  builtIn: boolean;
  /** Members of a TRIGGER_GROUP. */
  groupTriggerIds: string[];
  folderId: string | null;
  params: Record<string, ParamValue>;
  customEvent: CustomEventMatch | null;
}

export interface GtmVariable { id: string; name: string; type: string; params: Record<string, ParamValue> }

export interface GtmTemplate {
  id: string;
  name: string;
  /** publicId of each web permission, e.g. inject_script, send_pixel, access_consent. */
  permissions: string[];
  /** http(s) URL patterns listed in the web permissions. */
  urls: string[];
  gallery: { owner: string; repository: string } | null;
}

export interface GtmFolder { id: string; name: string }

export interface Container {
  /** exportTime as ms epoch (UTC assumed); null when absent or unreadable. */
  exportedAt: number | null;
  publicId: string;
  tags: GtmTag[];
  triggers: GtmTrigger[];
  variables: GtmVariable[];
  folders: GtmFolder[];
  templates: GtmTemplate[];
  builtInVariables: string[];
}

export type ParseErrorCode = 'not_json' | 'not_gtm' | 'format_version' | 'server_container' | 'empty' | 'too_large';
export interface ParseError { error: ParseErrorCode; message: string }

export type IdentificationSource = 'builtin-type' | 'template-permissions' | 'gallery-reference' | 'custom-html-url' | 'none';

export interface Identification {
  vendorId: string | null;
  source: IdentificationSource;
  /** official = the vendor publishes the template itself; null for non-template tags. */
  templateOrigin: 'official' | 'community' | null;
  /** URLs found in Custom HTML / image tags or template permissions. */
  urls: string[];
  /** Capability CortIQ already covers even when no registry vendor applies. */
  covers: 'utm' | null;
}

export type ConsentStatus = 'gated' | 'likely_gated' | 'not_gated' | 'google_consent_mode';

export interface TagInfo {
  tag: GtmTag;
  ident: Identification;
  vendor: Vendor | null;
  consent: ConsentStatus;
  consentEvidence: string;
  template: GtmTemplate | null;
}

export const MIGRATION_CLASSES = ['covered', 'consent_tool', 'pixel', 'conversion', 'third_party', 'keep_google', 'remove', 'review'] as const;
export type MigrationClass = typeof MIGRATION_CLASSES[number];

export const CHECK_KEYS = [
  'gtm.consent_missing', 'gtm.consent_inferred', 'gtm.identifies_visitors', 'gtm.consent_mode_default',
  'gtm.unknown_custom_html', 'gtm.community_template_injects', 'gtm.duplicate', 'gtm.dead', 'gtm.stale',
] as const;
export type CheckKey = typeof CHECK_KEYS[number];

export interface TagRow {
  id: string;
  name: string;
  typeLabel: string;
  vendorId: string | null;
  vendorName: string;
  triggers: string[];
  consent: ConsentStatus;
  consentEvidence: string;
  modifiedAt: number | null;
  migration: MigrationClass;
  migrationLabel: string;
  migrationReason: string;
  folder: string;
  paused: boolean;
}

export interface AuditSummary {
  headline: string;
  tags: number;
  noConsent: number;
  identifies: number;
  removal: number;
  counts: Record<MigrationClass, number>;
}

export interface AuditResult {
  container: Container;
  tags: TagRow[];
  findings: Finding[];
  summary: AuditSummary;
}
