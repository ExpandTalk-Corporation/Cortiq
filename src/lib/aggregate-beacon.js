// CortIQ aggregate beacon. Runs without consent ONLY when the site owner turned on aggregate
// measurement (window.cortiqConfig.aggregate === true and sites.aggregate_measurement).
// Sends the page path, the referrer, UTM values and form-goal hits to aggregate-hit.
// Writes nothing to the device (no cookies, localStorage or sessionStorage), sets no identifier
// and reads no fingerprint signals. It reads the stored consent record only to honour an explicit
// refusal, and stops on Global Privacy Control.
// Page views wait for a sign of a person: a first interaction, or the page being visible for
// HUMAN_DWELL_MS. Crawlers that render the page and leave within that time are not counted;
// neither is a visitor who leaves before it.
(function () {
  var cfg = window.cortiqConfig || {};
  if (cfg.aggregate !== true || !cfg.siteId || !cfg.apiKey || window.__cortiqAggregate) return;
  window.__cortiqAggregate = true;
  var endpoint = (cfg.apiUrl || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1') + '/aggregate-hit';
  var refusedLive = null;
  var formGoals = [];
  var lastPath = null;
  var firstView = true;
  var HUMAN_DWELL_MS = 3000;
  var human = false;
  var pending = [];
  var dwellTimer = null;
  var interactions = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
  // Same prefix semantics as spa-tracking.js: comma-separated, trimmed, empty entries ignored.
  var excludePaths = String(cfg.excludePaths || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);

  function isExcludedPath(path) {
    for (var i = 0; i < excludePaths.length; i++) {
      if (path.indexOf(excludePaths[i]) === 0) return true;
    }
    return false;
  }

  function refused() {
    if (refusedLive !== null) return refusedLive;
    if (navigator.globalPrivacyControl === true) return true;
    try {
      var c = JSON.parse(localStorage.getItem('site_cookie_consent') || 'null');
      if (c && c.analytics === false) return true;
    } catch (e) { /* storage unavailable */ }
    var cb = window.Cookiebot;
    if (cb && cb.hasResponse && cb.consent && cb.consent.statistics === false) return true;
    var dl = window.dataLayer;
    if (Array.isArray(dl)) {
      var state = null;
      for (var i = 0; i < dl.length; i++) {
        var en = dl[i];
        if (en && en[0] === 'consent' && en[1] === 'update' && en[2] && en[2].analytics_storage) state = en[2].analytics_storage;
      }
      if (state === 'denied') return true;
    }
    return false;
  }

  function send(body) {
    if (navigator.globalPrivacyControl === true || refused()) return Promise.resolve(null);
    body.siteId = cfg.siteId;
    try {
      return fetch(endpoint, {
        method: 'POST', keepalive: true, credentials: 'omit',
        headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r && r.status === 200 ? r.json() : null; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function utm() {
    var p = new URLSearchParams(location.search);
    var out = {};
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      var v = p.get(k);
      if (v) out[k] = v.slice(0, 100);
    });
    return out;
  }

  function sendPageview(body) {
    send(body).then(function (res) {
      if (res && Array.isArray(res.goals)) {
        formGoals = res.goals.filter(function (g) { return g && typeof g.id === 'string' && typeof g.selector === 'string'; });
      }
    });
  }

  function pageview() {
    var path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    if (isExcludedPath(path)) { firstView = false; return; }
    var body = { kind: 'pageview', url: location.origin + path, referrer: firstView ? (document.referrer || '') : '', utm: utm() };
    firstView = false;
    if (human) sendPageview(body);
    else if (pending.length < 20) pending.push(body);
  }

  function markHuman() {
    if (human) return;
    human = true;
    if (dwellTimer !== null) clearTimeout(dwellTimer);
    interactions.forEach(function (type) { window.removeEventListener(type, markHuman, true); });
    var queued = pending;
    pending = [];
    queued.forEach(sendPageview);
  }

  // Only time the page is actually visible counts (not prerendered or background tabs).
  function onVisibility() {
    if (human) return;
    if (document.visibilityState === 'hidden' || document.visibilityState === 'prerender') {
      if (dwellTimer !== null) { clearTimeout(dwellTimer); dwellTimer = null; }
    } else if (dwellTimer === null) {
      dwellTimer = setTimeout(markHuman, HUMAN_DWELL_MS);
    }
  }

  function matches(el, selector) {
    try { return !!(el && el.closest && el.closest(selector)); } catch (e) { return false; }
  }

  document.addEventListener('submit', function (e) {
    markHuman();
    if (isExcludedPath(location.pathname)) return;
    var target = e.target;
    var url = location.origin + location.pathname;
    var hits = formGoals.filter(function (g) { return matches(target, g.selector); });
    hits.forEach(function (g) { send({ kind: 'goal', url: url, goalId: g.id }); });
    if (hits.length === 0 && target && target.hasAttribute && target.hasAttribute('data-wfa-conversion')) {
      var body = { kind: 'goal', url: url, formId: target.id || '', contentId: target.getAttribute('data-wfa-content-id') || location.pathname };
      var value = parseFloat(target.getAttribute('data-wfa-value') || '0');
      if (value > 0) body.value = value;
      send(body);
    }
  }, true);

  window.addEventListener('siteConsentUpdated', function (e) {
    if (e && e.detail && typeof e.detail.analytics === 'boolean') refusedLive = !e.detail.analytics;
  });

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () {
      var result = original.apply(this, arguments);
      pageview();
      return result;
    };
  });
  window.addEventListener('popstate', pageview);
  interactions.forEach(function (type) { window.addEventListener(type, markHuman, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', onVisibility);

  pageview();
  onVisibility();
})();
