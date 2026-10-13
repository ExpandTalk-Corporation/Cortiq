// Builders for Tracking Check observations used by the assess tests.
export const req = (url, type = 'script') => ({ url, type });

export const fetchOk = (path, extra = {}) => ({
  requestedUrl: `https://new.example${path}?gclid=TC_GCLID_TEST`,
  hops: [{ url: `https://new.example${path}?gclid=TC_GCLID_TEST`, status: 200 }],
  finalUrl: `https://new.example${path}?gclid=TC_GCLID_TEST`,
  finalStatus: 200, paramsLost: [], csp: null, challenge: false, error: null, ...extra,
});

export const st = (state, extra = {}) => ({
  state, method: state === 'none' ? 'not_needed' : 'adapter', status: 200,
  requests: [], cookies: [], storageKeys: [], cspViolations: [], consentCommands: [],
  enhancedConversions: false, challenge: false, error: null, bannerSeen: true, ...extra,
});

/** opts.states: array of st(...) (default none/reject/accept with no activity); null = no browser observation. */
export const page = (path, { fetch, states, forms = [], legacy = false, failed = null, cmp = 'cookieyes' } = {}) => ({
  path, legacy, failed,
  fetch: fetch === undefined ? fetchOk(path) : fetch,
  browser: states === null || legacy ? null : { url: `https://new.example${path}`, cmp, states: states ?? [st('none'), st('reject'), st('accept')], forms },
});

export const site = (role, pages) => ({ role, origin: role === 'baseline' ? 'https://old.example' : 'https://new.example', pages });

export const POLICY = {
  noGoogleBeforeConsent: true, consentDefaultsDenied: true, ga4RequiresAnalytics: true, adsRequiresMarketing: true,
  enhancedConversionsOff: true, noUnknownVendorsAfterReject: true, expectedIds: [], manualItems: [],
};
