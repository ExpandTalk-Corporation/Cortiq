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
