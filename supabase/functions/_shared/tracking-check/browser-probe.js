// Browser probe for Tracking Check. buildProbeSource() returns the ES module sent to
// Browserless /function. In-page helpers (inPage*, pickConsentButton) are serialised with
// toString() and run inside the tested page, so they must not reference anything outside
// their own body. observeState/probeMain run in Browserless' Node context with Puppeteer.

/** in-page: which consent management platform is on the page. */
export function inPageDetectCmp() {
  const w = window;
  if (w.Cookiebot) return 'cookiebot';
  if (w.OneTrust || w.Optanon) return 'onetrust';
  if (w.getCkyConsent || document.querySelector('.cky-consent-container, [data-cky-tag]')) return 'cookieyes';
  if (w.cmplz_set_category || document.querySelector('.cmplz-cookiebanner')) return 'complianz';
  if (document.getElementById('crtq-consent-banner')) return 'cortiq';
  return null;
}

/** in-page: apply a consent choice through a known CMP. Returns true when the choice was made. */
export function inPageApplyAdapter(cmp, action) {
  const w = window;
  // Only visible, enabled elements count: CMPs often keep hidden copies of their buttons.
  const usable = (selector) => Array.from(document.querySelectorAll(selector)).find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.disabled;
  });
  const click = (selector) => {
    const el = usable(selector);
    if (!el) return false;
    el.click();
    return true;
  };
  if (cmp === 'cookiebot' && w.Cookiebot && typeof w.Cookiebot.submitCustomConsent === 'function') {
    const flags = { accept: [true, true, true], reject: [false, false, false], analytics_only: [false, true, false], marketing_only: [false, false, true] }[action];
    w.Cookiebot.submitCustomConsent(flags[0], flags[1], flags[2]);   // preferences, statistics, marketing
    return true;
  }
  if (cmp === 'onetrust' && w.OneTrust) {
    if (action === 'accept' && typeof w.OneTrust.AllowAll === 'function') { w.OneTrust.AllowAll(); return true; }
    if (action === 'reject' && typeof w.OneTrust.RejectAll === 'function') { w.OneTrust.RejectAll(); return true; }
    return false;
  }
  if (cmp === 'cookieyes') {
    if (action === 'accept') return click('.cky-btn-accept');
    if (action === 'reject') return click('.cky-btn-reject');
    return false;
  }
  if (cmp === 'complianz') {
    if (action === 'accept') return click('.cmplz-accept');
    if (action === 'reject') return click('.cmplz-deny');
    return false;
  }
  if (cmp === 'cortiq') {
    if (action === 'accept') return click('#crtq-cb-accept');
    if (action === 'reject') return click('#crtq-cb-necessary');
    const analytics = document.getElementById('crtq-toggle-analytics');
    const marketing = document.getElementById('crtq-toggle-marketing');
    const preferences = document.getElementById('crtq-toggle-preferences');
    if (!analytics || !marketing || !document.getElementById('crtq-cb-save')) return false;
    if (!usable('#crtq-cb-save')) click('#crtq-cb-settings');   // the save button sits in a collapsed settings panel
    analytics.checked = action === 'analytics_only';
    marketing.checked = action === 'marketing_only';
    if (preferences) preferences.checked = false;
    return click('#crtq-cb-save');
  }
  return false;
}

/** in-page: visible clickable elements and their text. */
export function inPageCandidates() {
  const els = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
  return els.map((el, index) => {
    const r = el.getBoundingClientRect();
    return { index, visible: r.width > 0 && r.height > 0, text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
  }).filter((c) => c.visible && c.text);
}

/** in-page: click the candidate with this index (same element order as inPageCandidates). */
export function inPageClickCandidate(index) {
  const el = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'))[index];
  if (el) el.click();
  return !!el;
}

/** in-page: is anything that looks like a cookie banner visible? */
export function inPageBannerVisible() {
  return Array.from(document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="cmp" i]'))
    .some((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 50 && r.height > 20 && s.display !== 'none' && s.visibility !== 'hidden';
    });
}

/**
 * Signs of a consent platform that inPageBannerVisible cannot see: the TCF API, known CMP
 * globals, shadow DOM hosts and CMP iframes. Self-contained (runs in-page via window.__tc).
 * shadowHosts: "id class" of every element with an open shadowRoot. iframeSrcs: iframe src values.
 */
export function cmpSignal(win, shadowHosts, iframeSrcs) {
  const globals = ['__tcfapi', 'UC_UI', 'usercentrics', '__cmp', '_sp_', 'truste', 'Didomi', 'OneTrust', 'Cookiebot'];
  if (globals.some((g) => win[g] !== undefined && win[g] !== null)) return true;
  if (shadowHosts.some((h) => /cookie|consent|usercentrics|cmp/i.test(h))) return true;
  return iframeSrcs.some((src) => {
    let host = '';
    try { host = new URL(src).hostname; } catch (e) { return false; }
    return /consent|sourcepoint|privacy-mgmt|trustarc|usercentrics|didomi/i.test(host);
  });
}

/** in-page: is a consent platform present even though no banner is visible? */
export function inPageCmpPresent() {
  const hosts = Array.from(document.querySelectorAll('*')).filter((el) => el.shadowRoot)
    .map((el) => `${el.id || ''} ${el.getAttribute('class') || ''}`);
  const srcs = Array.from(document.querySelectorAll('iframe')).map((f) => f.getAttribute('src') || '');
  return window.__tc.cmpSignal(window, hosts, srcs);
}

/**
 * Was a consent choice stored? Self-contained (runs in-page via window.__tc).
 * cookieString: document.cookie; storageKeys: localStorage keys; cookiebotResponded: Cookiebot.hasResponse.
 */
export function consentSignal(cookieString, storageKeys, cookiebotResponded) {
  if (cookiebotResponded) return true;
  const cookies = cookieString.split(';').map((c) => {
    const t = c.trim();
    try { return decodeURIComponent(t); } catch (e) { return t; }
  });
  if (cookies.some((c) => /^OptanonAlertBoxClosed=/.test(c))) return true;
  if (cookies.some((c) => /^cookieyes-consent=/.test(c) && /[=,]action:yes(,|$)/.test(c))) return true;
  if (cookies.some((c) => /^cmplz_/.test(c))) return true;
  return storageKeys.includes('site_cookie_consent');   // CortIQ consent banner
}

/** in-page: does the page show a stored consent choice? */
export function inPageConsentSignal() {
  const keys = [];
  try { for (let i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i)); } catch (e) { /* storage blocked */ }
  const cb = window.Cookiebot;
  return window.__tc.consentSignal(document.cookie || '', keys, !!(cb && cb.hasResponse));
}

/** Text-based fallback: index of the best matching consent button, or null. Self-contained (runs in-page). */
export function pickConsentButton(candidates, action) {
  const labels = {
    reject: [
      /^(neka|avvisa|avböj|avslå)( alla)?( cookies| kakor)?$/i,
      /^(reject|decline|deny|refuse)( all)?( cookies)?$/i,
      /^(endast|bara|tillåt endast|acceptera endast|godkänn endast) nödvändiga( cookies| kakor)?$/i,
      /^(only|use|allow|accept) (necessary|essential)( cookies)?( only)?$/i,
      /^necessary (cookies )?only$/i,
    ],
    accept: [
      /^(acceptera|godkänn|tillåt)( alla)?( cookies| kakor)?$/i,
      /^jag (godkänner|accepterar)$/i,
      /^(accept|allow|agree to)( all)?( cookies)?$/i,
      /^i (agree|accept)$/i,
    ],
  };
  for (const re of labels[action] || []) {
    const hit = candidates.find((c) => re.test(c.text));
    if (hit) return hit.index;
  }
  return null;
}

/** in-page: storage keys, gtag consent commands, Enhanced Conversions config, CSP violations, optional HTML. */
export function inPageCollect(withHtml) {
  const keys = [];
  // window.* everywhere so the function also runs in Node tests with a stubbed window.
  try { for (let i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i)); } catch (e) { /* storage blocked */ }
  try { for (let i = 0; i < window.sessionStorage.length; i++) keys.push(window.sessionStorage.key(i)); } catch (e) { /* storage blocked */ }
  const consentCommands = [];
  // The Google tag's own consent state also covers defaults set by a CMP template in GTM,
  // which never reach window.dataLayer. Prefer it when present.
  const entries = window.google_tag_data && window.google_tag_data.ics && window.google_tag_data.ics.entries;
  const icsDefault = {};
  if (entries && typeof entries === 'object') {
    for (const k of Object.keys(entries)) {
      const d = entries[k] && entries[k].default;
      if (d === true || d === 'granted') icsDefault[k] = 'granted';
      else if (d === false || d === 'denied') icsDefault[k] = 'denied';
    }
  }
  const fromIcs = Object.keys(icsDefault).length > 0;
  if (fromIcs) consentCommands.push({ kind: 'default', params: icsDefault });
  let ec = false;
  for (const entry of (window.dataLayer || [])) {
    if (!entry || typeof entry !== 'object' || typeof entry.length !== 'number') continue;   // gtag pushes Arguments objects
    const a = Array.prototype.slice.call(entry);
    if (fromIcs && a[0] === 'consent' && a[1] === 'default') continue;
    if (a[0] === 'consent' && (a[1] === 'default' || a[1] === 'update') && a[2] && typeof a[2] === 'object') {
      const params = {};
      for (const k of Object.keys(a[2])) params[k] = String(a[2][k]);
      consentCommands.push({ kind: a[1], params });
    }
    if ((a[0] === 'config' && a[2] && a[2].allow_enhanced_conversions) || (a[0] === 'set' && a[1] === 'user_data')) ec = true;
  }
  return {
    storageKeys: keys,
    consentCommands,
    ec,
    csp: (window.__tcCsp || []).slice(0, 500),
    html: withHtml ? window.document.documentElement.outerHTML.slice(0, 1000000) : '',
  };
}

async function observeState(browser, state, context, inPageSource) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const p = await ctx.newPage();
  const out = { state, method: state === 'none' ? 'not_needed' : 'not_automated', status: 0, requests: [], cookies: [], storageKeys: [], cspViolations: [], consentCommands: [], enhancedConversions: false, challenge: false, error: null };
  let cmp = null;
  let html = '';
  const userData = /[?&;]em=|"em"\s*:|user_data/;
  // Enhanced Conversions data only counts on requests to Google (inlined: this function is serialised).
  const googleHost = /(^|\.)(google\.([a-z]{2,3}|com?\.[a-z]{2})|doubleclick\.net|googlesyndication\.com|googleadservices\.com|google-analytics\.com|googletagmanager\.com)$/;
  const cookieKey = (c) => `${c.name}|${c.domain}|${c.value}`;
  p.on('request', (r) => {
    const url = r.url();
    if (out.requests.length >= 2000 || !/^https?:/.test(url)) return;
    let host = '';
    try { host = new URL(url).hostname; } catch (e) { /* not a URL */ }
    if (googleHost.test(host) && (userData.test(url) || userData.test(r.postData() || ''))) out.enhancedConversions = true;
    out.requests.push({ url, type: r.resourceType() });
  });
  try {
    if (context.basicAuth) await p.authenticate(context.basicAuth);
    await p.setViewport({ width: 1366, height: 900 });
    await p.evaluateOnNewDocument(() => {
      window.__tcCsp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__tcCsp.push({ blockedUrl: e.blockedURI, directive: e.effectiveDirective }));
    });
    const res = await p.goto(context.url, { waitUntil: 'load', timeout: 30000 });
    await p.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 }).catch(() => {});
    await p.evaluate(inPageSource);
    const status = res ? res.status() : 0;
    out.status = status;
    const text = await p.evaluate(() => document.title + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : ''));
    if ([403, 429, 503].includes(status) && /just a moment|attention required|captcha|verify you are human/i.test(text)) {
      out.challenge = true;
      return { out, cmp, html };
    }
    cmp = await p.evaluate(() => window.__tc.detect());
    const cdp = await p.createCDPSession();
    let before = new Set();
    let beforeKeys = new Set();
    let done = false;
    if (state !== 'none') {
      before = new Set((await cdp.send('Network.getAllCookies')).cookies.map(cookieKey));
      beforeKeys = new Set((await p.evaluate(() => window.__tc.collect(false))).storageKeys);
      done = cmp ? await p.evaluate((c, a) => window.__tc.apply(c, a), cmp, state) : false;
      if (done) out.method = 'adapter';
      else if (state === 'accept' || state === 'reject') {
        const idx = await p.evaluate((a) => window.__tc.pick(window.__tc.candidates(), a), state);
        if (idx !== null && await p.evaluate((i) => window.__tc.click(i), idx)) { done = true; out.method = 'text'; }
        else if (!cmp && !(await p.evaluate(() => window.__tc.bannerVisible())) && !(await p.evaluate(() => window.__tc.cmpPresent()))) out.method = 'not_needed';
      }
      if (done) {
        await p.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 }).catch(() => {});
        out.requests.length = 0;   // observe the next page view after the choice
        out.enhancedConversions = false;
        const reloaded = await p.reload({ waitUntil: 'load', timeout: 30000 });
        out.status = reloaded ? reloaded.status() : 0;
        await p.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 }).catch(() => {});
        await p.evaluate(inPageSource);
      }
    }
    const cookies = (await cdp.send('Network.getAllCookies')).cookies;
    const collected = await p.evaluate((h) => window.__tc.collect(h), state === 'accept' || (state === 'none' && !context.states.includes('accept')));
    out.cookies = cookies.filter((c) => !before.has(cookieKey(c))).map((c) => ({ name: c.name, domain: c.domain }));
    out.storageKeys = collected.storageKeys.filter((k) => !beforeKeys.has(k));
    out.cspViolations = collected.csp;
    out.consentCommands = collected.consentCommands;
    out.enhancedConversions = out.enhancedConversions || collected.ec;
    html = collected.html;
    if (done) {
      // A click or API call is not proof: keep the state only if the choice visibly took effect.
      const bannerGone = !(await p.evaluate(() => window.__tc.bannerVisible()));
      const stored = bannerGone || await p.evaluate(() => window.__tc.storedConsent());
      if (!stored && !out.cookies.length && !out.storageKeys.length) out.method = 'not_automated';
    }
  } catch (e) {
    out.error = (e && e.message) || String(e);
  } finally {
    await ctx.close().catch(() => {});
  }
  return { out, cmp, html };
}

async function probeMain({ page, context, inPageSource }) {
  const browser = page.browser();
  const results = await Promise.all(context.states.map((s) => observeState(browser, s, context, inPageSource)));
  return {
    data: {
      url: context.url,
      cmp: results.map((r) => r.cmp).find(Boolean) || null,
      states: results.map((r) => r.out),
      html: results.map((r) => r.html).find(Boolean) || '',
    },
    type: 'application/json',
  };
}

export function buildProbeSource() {
  const inPage = `window.__tc = { detect: ${inPageDetectCmp}, apply: ${inPageApplyAdapter}, candidates: ${inPageCandidates}, click: ${inPageClickCandidate}, bannerVisible: ${inPageBannerVisible}, pick: ${pickConsentButton}, collect: ${inPageCollect}, cmpSignal: ${cmpSignal}, cmpPresent: ${inPageCmpPresent}, consentSignal: ${consentSignal}, storedConsent: ${inPageConsentSignal} };`;
  return [
    `const IN_PAGE = ${JSON.stringify(inPage)};`,
    observeState.toString(),
    probeMain.toString(),
    'export default async function ({ page, context }) { return probeMain({ page, context, inPageSource: IN_PAGE }); }',
  ].join('\n');
}
