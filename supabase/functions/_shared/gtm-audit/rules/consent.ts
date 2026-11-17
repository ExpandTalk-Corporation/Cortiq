import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { GOOGLE_TYPES } from '../tag-types.ts';
import { finding, isActive, plural, tagLabel } from './finding.ts';

const LOADS_SCRIPT = /<script[^>]+src\s*=|createElement\(\s*['"]script['"]\s*\)/i;

/** Analytics/marketing vendor tags, and unidentified Custom HTML that loads an external script. */
function needsConsent(i: TagInfo): boolean {
  if (i.vendor) return (i.vendor.category === 'analytics' || i.vendor.category === 'marketing') && i.vendor.kind !== 'cmp' && i.vendor.kind !== 'infrastructure';
  const html = typeof i.tag.params.html === 'string' ? i.tag.params.html : '';
  return i.tag.type === 'html' && i.ident.urls.length > 0 && LOADS_SCRIPT.test(html);
}

/** Active tags that need consent and have no consent condition. Shared with the audit summary. */
export const missingConsent = (infos: TagInfo[]): TagInfo[] =>
  infos.filter((i) => isActive(i) && i.consent === 'not_gated' && needsConsent(i));

export function consentMissing(infos: TagInfo[]): Finding {
  const hits = missingConsent(infos);
  if (!hits.length) {
    return finding('gtm.consent_missing', 'Every analytics and marketing tag has a consent condition', 'pass', 'high', 'gtm', 'Each analytics and marketing tag waits for a consent condition in its triggers or consent settings.', '', []);
  }
  return finding('gtm.consent_missing', `${plural(hits.length, 'tag')} with no consent condition found`, 'fail', 'high', 'gtm',
    'These analytics or marketing tags fire on triggers with no consent condition, and their consent settings require no consent type. A trigger can still depend on logic the audit cannot read (for example a Custom JavaScript variable), so check each tag before changing it.',
    "Fire each tag on your consent tool's consent event, or set Additional consent checks (ad_storage or analytics_storage) in the tag's consent settings.",
    hits.map((i) => `${tagLabel(i)}: ${i.consentEvidence}`));
}

export function consentInferred(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => isActive(i) && i.consent === 'likely_gated');
  if (!hits.length) return finding('gtm.consent_inferred', 'No consent read from trigger names alone', 'pass', 'medium', 'gtm', 'No tag relies on a trigger whose consent condition is only implied by its name.', '', []);
  return finding('gtm.consent_inferred', `${plural(hits.length, 'tag')} where consent is only implied by the trigger name`, 'manual', 'medium', 'gtm',
    'The trigger names suggest consent, but the triggers have no condition the audit can read. The consent check may live in a variable or in code outside the container.',
    'Open each trigger in GTM Preview and confirm that the tag waits for the visitor\'s choice.',
    hits.map((i) => `${tagLabel(i)}: ${i.consentEvidence}`));
}

export function identifiesVisitors(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => isActive(i) && i.vendor?.identifiesVisitors);
  if (!hits.length) return finding('gtm.identifies_visitors', 'No visitor identification tools found', 'pass', 'high', 'legal', 'No tag loads a tool that matches visits to companies or people.', '', []);
  const open = hits.some((i) => i.consent === 'not_gated');
  return finding('gtm.identifies_visitors', `${plural(hits.length, 'tag')} that identify visitors`, open ? 'fail' : 'warning', 'high', 'legal',
    'These tools match visits to companies or people (B2B visitor identification). That is processing of personal data, which usually needs consent and a mention in the privacy policy, also when the tag waits for consent.',
    'Confirm the legal basis with your data protection officer or lawyer, name each tool in the privacy policy and keep it behind marketing consent.',
    hits.map((i) => `${tagLabel(i)}: ${i.consentEvidence}`));
}

const DEFAULT_RE = /['"]consent['"]\s*,\s*['"]default['"]/;

export function consentModeDefault(container: Container, infos: TagInfo[]): Finding {
  const google = infos.filter((i) => isActive(i) && GOOGLE_TYPES.has(i.tag.type) && i.tag.type !== 'ua');
  if (!google.length) return finding('gtm.consent_mode_default', 'No Google tags, so no Consent Mode default is needed', 'pass', 'medium', 'gtm', 'The container has no active Google tags.', '', []);
  const initIds = new Set(container.triggers.filter((t) => t.type === 'CONSENT_INIT').map((t) => t.id));
  const setter = infos.find((i) => !i.tag.paused && i.tag.firingTriggerIds.some((id) => initIds.has(id)) && (
    i.vendor?.kind === 'cmp'
    || !!i.template?.permissions.includes('access_consent')
    || (typeof i.tag.params.html === 'string' && DEFAULT_RE.test(i.tag.params.html))
  ));
  if (setter) return finding('gtm.consent_mode_default', 'Consent Mode default is set on Consent Initialization', 'pass', 'medium', 'gtm', 'A tag on Consent Initialization sets the Consent Mode default before Google tags run.', '', [`Set by ${tagLabel(setter)}`]);
  return finding('gtm.consent_mode_default', 'No Consent Mode default found on Consent Initialization', 'warning', 'medium', 'gtm',
    'The container has Google tags but no tag on the Consent Initialization trigger that sets a Consent Mode default (a consent tool template or a gtag("consent", "default", …) tag). Without a default, Google tags may use storage before the visitor chooses. A default set in the page source before GTM loads also works — check the page if that is how this site does it.',
    'Add your consent tool\'s GTM template on Consent Initialization – All Pages, or a tag there that runs gtag("consent", "default", {…}).',
    google.map(tagLabel));
}
