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
  const click = (selector) => {
    const el = document.querySelector(selector);
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
  let ec = false;
  for (const entry of (window.dataLayer || [])) {
    if (!entry || typeof entry !== 'object' || typeof entry.length !== 'number') continue;   // gtag pushes Arguments objects
    const a = Array.prototype.slice.call(entry);
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
  const out = { state, method: state === 'none' ? 'not_needed' : 'not_automated', requests: [], cookies: [], storageKeys: [], cspViolations: [], consentCommands: [], enhancedConversions: false, challenge: false, error: null };
  let cmp = null;
  let html = '';
  const userData = /[?&;]em=|"em"\s*:|user_data/;
  const cookieKey = (c) => `${c.name}|${c.domain}|${c.value}`;
  p.on('request', (r) => {
    const url = r.url();
    if (out.requests.length >= 2000 || !/^https?:/.test(url)) return;
    if (userData.test(url) || userData.test(r.postData() || '')) out.enhancedConversions = true;
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
    const text = await p.evaluate(() => document.title + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : ''));
    if ([403, 429, 503].includes(status) && /just a moment|attention required|captcha|verify you are human/i.test(text)) {
      out.challenge = true;
      return { out, cmp, html };
    }
    cmp = await p.evaluate(() => window.__tc.detect());
    const cdp = await p.createCDPSession();
    let before = new Set();
    let beforeKeys = new Set();
    if (state !== 'none') {
      before = new Set((await cdp.send('Network.getAllCookies')).cookies.map(cookieKey));
      beforeKeys = new Set((await p.evaluate(() => window.__tc.collect(false))).storageKeys);
      let done = cmp ? await p.evaluate((c, a) => window.__tc.apply(c, a), cmp, state) : false;
      if (done) out.method = 'adapter';
      else if (state === 'accept' || state === 'reject') {
        const idx = await p.evaluate((a) => window.__tc.pick(window.__tc.candidates(), a), state);
        if (idx !== null && await p.evaluate((i) => window.__tc.click(i), idx)) { done = true; out.method = 'text'; }
        else if (!cmp && !(await p.evaluate(() => window.__tc.bannerVisible()))) out.method = 'not_needed';
      }
      if (done) {
        await p.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 }).catch(() => {});
        out.requests.length = 0;   // observe the next page view after the choice
        out.enhancedConversions = false;
        await p.reload({ waitUntil: 'load', timeout: 30000 });
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
  const inPage = `window.__tc = { detect: ${inPageDetectCmp}, apply: ${inPageApplyAdapter}, candidates: ${inPageCandidates}, click: ${inPageClickCandidate}, bannerVisible: ${inPageBannerVisible}, pick: ${pickConsentButton}, collect: ${inPageCollect} };`;
  return [
    `const IN_PAGE = ${JSON.stringify(inPage)};`,
    observeState.toString(),
    probeMain.toString(),
    'export default async function ({ page, context }) { return probeMain({ page, context, inPageSource: IN_PAGE }); }',
  ].join('\n');
}
