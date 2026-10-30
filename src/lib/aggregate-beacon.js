// CortIQ aggregate beacon. Runs without consent ONLY when the site owner turned on aggregate
// measurement (window.cortiqConfig.aggregate === true and sites.aggregate_measurement).
// Sends the page path, the referrer, UTM values and form-goal hits to aggregate-hit.
// Writes nothing to the device (no cookies, localStorage or sessionStorage), sets no identifier
// and reads no fingerprint signals. It reads the stored consent record only to honour an explicit
// refusal, and stops on Global Privacy Control.
(function () {
  var cfg = window.cortiqConfig || {};
  if (cfg.aggregate !== true || !cfg.siteId || !cfg.apiKey || window.__cortiqAggregate) return;
  window.__cortiqAggregate = true;
  var endpoint = (cfg.apiUrl || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1') + '/aggregate-hit';
  var refusedLive = null;
  var formGoals = [];
  var lastPath = null;
  var firstView = true;

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

  function pageview() {
    var path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    var body = { kind: 'pageview', url: location.origin + path, referrer: firstView ? (document.referrer || '') : '', utm: utm() };
    firstView = false;
    send(body).then(function (res) {
      if (res && Array.isArray(res.goals)) {
        formGoals = res.goals.filter(function (g) { return g && typeof g.id === 'string' && typeof g.selector === 'string'; });
      }
    });
  }

  function matches(el, selector) {
    try { return !!(el && el.closest && el.closest(selector)); } catch (e) { return false; }
  }

  document.addEventListener('submit', function (e) {
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

  pageview();
})();
