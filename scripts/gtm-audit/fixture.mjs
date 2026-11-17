// Builders for synthetic GTM container exports (format v2). Synthetic data only — never a real container.
export const ALL_PAGES = '2147479553';
export const CONSENT_INIT = '2147479572';
export const INIT = '2147479573';
export const DEFAULT_MODIFIED = Date.UTC(2026, 9, 1);

export const tpl = (key, value) => ({ type: 'TEMPLATE', key, value: String(value) });
export const bool = (key, value) => ({ type: 'BOOLEAN', key, value: String(value) });
export const list = (key, items) => ({ type: 'LIST', key, list: items });
export const ms = (entries) => ({ type: 'MAP', map: Object.entries(entries).map(([k, v]) => tpl(k, v)) });
export const ref = (id) => ({ type: 'TRIGGER_REFERENCE', value: String(id) });
export const needed = (...types) => ({
  consentStatus: 'NEEDED', consentType: { type: 'LIST', list: types.map((t) => ({ type: 'TEMPLATE', value: t })) },
});

export function tag(id, name, type, params = [], { fire = [ALL_PAGES], block = [], consent, paused, folder, modified } = {}) {
  return {
    tagId: String(id), name, type, parameter: params, fingerprint: String(modified ?? DEFAULT_MODIFIED),
    firingTriggerId: fire.map(String),
    ...(block.length ? { blockingTriggerId: block.map(String) } : {}),
    ...(paused ? { paused: true } : {}),
    ...(folder ? { parentFolderId: String(folder) } : {}),
    consentSettings: consent ?? { consentStatus: 'NOT_SET' },
  };
}

export const cond = (type, arg0, arg1, negate = false) => ({
  type, parameter: [tpl('arg0', arg0), tpl('arg1', arg1), ...(negate ? [bool('negate', true)] : [])],
});

export function trigger(id, name, type, { filter = [], custom = [], params = [], folder } = {}) {
  return {
    triggerId: String(id), name, type,
    ...(custom.length ? { customEventFilter: custom } : {}),
    ...(filter.length ? { filter } : {}),
    ...(params.length ? { parameter: params } : {}),
    ...(folder ? { parentFolderId: String(folder) } : {}),
  };
}
export const customEvent = (id, name, event, opts = {}) => trigger(id, name, 'CUSTOM_EVENT', { ...opts, custom: [cond('EQUALS', '{{_event}}', event)] });
export const triggerGroup = (id, name, memberIds) => trigger(id, name, 'TRIGGER_GROUP', { params: [list('triggerIds', memberIds.map(ref))] });
export const variable = (id, name, type, params = []) => ({ variableId: String(id), name, type, parameter: params });

/** permissions: { inject_script: ['https://cdn.example.com/*'], access_consent: [] } */
export function template(id, name, { permissions = {}, gallery } = {}) {
  const perms = Object.entries(permissions).map(([publicId, urls]) => JSON.stringify({
    instance: {
      key: { publicId, versionId: '1' },
      param: urls.length ? [{ key: 'urls', value: { type: 2, listItem: urls.map((u) => ({ type: 1, string: u })) } }] : [],
    },
    isRequired: true,
  }));
  const templateData = `___INFO___\n\n{"type":"TAG","displayName":${JSON.stringify(name)}}\n\n___WEB_PERMISSIONS___\n\n[${perms.join(',')}]\n\n___TESTS___\n\nscenarios: []\n`;
  return {
    templateId: String(id), name, templateData,
    ...(gallery ? { galleryReference: { host: 'github.com', owner: gallery[0], repository: gallery[1], version: 'abc123', signature: 'def456' } } : {}),
  };
}
export const tplType = (id) => `cvt_1234567_${id}`;

export function exportOf({ tags = [], triggers = [], variables = [], folders = [], templates = [], builtIns = [], exportTime = '2026-11-01 10:00:00', usageContext = ['WEB'] } = {}) {
  return {
    exportFormatVersion: 2, exportTime,
    containerVersion: {
      container: { publicId: 'GTM-SAMPLE1', usageContext },
      tag: tags, trigger: triggers, variable: variables, folder: folders, customTemplate: templates,
      builtInVariable: builtIns.map((type) => ({ type, name: type })),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Synthetic sample container for the /gtm-audit landing page. Invented names, IDs and hosts only.
// It is built to show every check result and every migration class at least once.
export function sampleExport() {
  const OLD_2023 = Date.UTC(2023, 2, 14);
  const OLD_2022 = Date.UTC(2022, 5, 1);
  const script = (src) => tpl('html', `<script src="${src}" async></script>`);
  return exportOf({
    exportTime: '2026-11-01 10:00:00',
    folders: [{ folderId: '40', name: 'Marketing' }, { folderId: '41', name: 'Analytics' }],
    triggers: [
      customEvent(10, 'CE - cookie_consent_marketing', 'cookie_consent_marketing', { folder: 40 }),
      customEvent(11, 'CE - cookie_consent_analytics', 'cookie_consent_analytics', { folder: 41 }),
      trigger(12, 'Form submit - contact', 'FORM_SUBMISSION', { filter: [cond('CONTAINS', '{{Page Path}}', '/contact')] }),
      trigger(13, 'Consent Analytics Trigger', 'PAGEVIEW'),
      trigger(14, 'Old landing page', 'PAGEVIEW', { filter: [cond('EQUALS', '{{Page Path}}', '/spring-offer')] }),
      customEvent(15, 'CE - generate_lead', 'generate_lead', { folder: 41 }),
    ],
    variables: [
      variable(30, 'Meta Pixel ID', 'c', [tpl('value', '1234567890')]),
      variable(31, 'DLV - unused', 'v', [tpl('name', 'unused_key')]),
      variable(32, 'GA4 ID', 'c', [tpl('value', 'G-SAMPLE123')]),
    ],
    templates: [
      template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*', 'https://cdn.jsdelivr.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] }),
      template(21, 'LinkedIn Insight', { permissions: { inject_script: ['https://snap.licdn.com/*'] }, gallery: ['linkedin', 'linkedin-gtm-community-template'] }),
      template(22, 'Cookiebot CMP', { permissions: { inject_script: ['https://*.cookiebot.com/*'], access_consent: [] }, gallery: ['cybotcorp', 'gtm-templates-cookiebot-cmp'] }),
      template(23, 'Visitor helper', { permissions: { inject_script: ['https://cdn.example-widgets.com/*'] }, gallery: ['example-dev', 'visitor-helper'] }),
      template(24, 'Clay Web Intent', { permissions: { inject_script: ['https://static.claydar.com/*'] }, gallery: ['Jude-Nwachukwu', 'gtm-clay-web-intent-tag'] }),
    ],
    tags: [
      tag(1, 'Cookiebot - CMP', tplType(22), [tpl('cookiebotId', '00000000-0000-4000-8000-000000000000')], { fire: [CONSENT_INIT] }),
      tag(2, 'Google tag', 'googtag', [tpl('tagId', '{{GA4 ID}}')], { fire: [INIT], folder: 41 }),
      tag(3, 'GA4 - generate_lead', 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15], folder: 41 }),
      tag(4, 'GA4 - generate_lead (copy)', 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15], folder: 41 }),
      tag(5, 'Google Ads - contact conversion', 'awct', [tpl('conversionId', '000000000'), tpl('conversionLabel', 'SAMPLElabel')], { fire: [12], folder: 40 }),
      tag(6, 'Conversion Linker', 'gclidw', [], { folder: 40 }),
      tag(7, 'Meta - PageView', tplType(20), [tpl('pixelId', '{{Meta Pixel ID}}'), tpl('eventName', 'standard'), tpl('standardEventName', 'PageView')], { fire: [10], folder: 40 }),
      tag(8, 'Meta - Lead', tplType(20), [tpl('pixelId', '{{Meta Pixel ID}}'), tpl('eventName', 'standard'), tpl('standardEventName', 'Lead')], { fire: [12], folder: 40 }),
      tag(9, 'LinkedIn Insight', tplType(21), [tpl('partnerId', '0000000')], { fire: [13], folder: 40 }),
      tag(10, 'Microsoft Clarity', 'html', [script('https://www.clarity.ms/tag/sample123')], { consent: needed('analytics_storage'), folder: 41 }),
      tag(11, 'Clay - web intent', tplType(24), [], { folder: 40 }),
      tag(12, 'Chat widget', 'html', [tpl('html', '<script>(function(){var s=document.createElement("script");s.src="https://cdn.example-chat.com/widget.js";document.head.appendChild(s)})()</script>')]),
      tag(13, 'HubSpot form listener', 'html', [tpl('html', "<script>window.addEventListener('message',function(e){if(e.data.type==='hsFormCallback'&&e.data.eventName==='onFormSubmitted'){dataLayer.push({event:'generate_lead'})}})</script>")], { fire: [ALL_PAGES] }),
      tag(14, 'Reddit pixel', 'html', [script('https://www.redditstatic.com/ads/pixel.js')], { paused: true, modified: OLD_2023, folder: 40 }),
      tag(15, 'Visitor helper', tplType(23), [], { fire: [11] }),
      tag(16, 'UA - pageview', 'ua', [tpl('trackingId', 'UA-000000-1')], { modified: OLD_2022, folder: 41 }),
    ],
  });
}
