// CortIQ consent-gated loader. Inlined into the install snippet (see trackingSnippet.ts) with
// the source placeholder replaced by the tracker URL. It requests the tracker only after analytics consent,
// so no request — and no IP address — reaches cortiq.se before the visitor has chosen.
// Reads the CortIQ banner (site_cookie_consent + siteConsentUpdated), Cookiebot and Google Consent Mode.
// Deliberately permissive about the stored record: the tracker itself validates consent strictly.
// With the CortIQ banner on the page, a stored choice counts only for its data-policy-version: after a
// bump the banner asks again and the tracker waits for the new answer.
(function () {
  var done = false;
  function load() {
    if (done) return;
    done = true;
    var s = document.createElement('script');
    s.src = '__CORTIQ_SRC__';
    s.defer = true;
    document.head.appendChild(s);
  }
  function bannerVersion() {
    var b = document.querySelector && document.querySelector('script[src*="consent-banner"]');
    return b ? String(b.getAttribute('data-policy-version') || '1').slice(0, 20) : null;
  }
  function stored() {
    try {
      var c = JSON.parse(localStorage.getItem('site_cookie_consent') || 'null');
      if (!c || c.analytics !== true) return false;
      var v = bannerVersion();
      if (v !== null && String(c.policyVersion) !== v) return false;
      var e = typeof c.expiresAt === 'number' ? c.expiresAt : Date.parse(c.expiresAt);
      return !(e <= Date.now());
    } catch (err) { return false; }
  }
  function cookiebot() { return !!(window.Cookiebot && window.Cookiebot.consent && window.Cookiebot.consent.statistics); }
  // Only an explicit update grant counts. A default 'granted' is often the site's rule for non-EU
  // regions, and the loader cannot tell which region applies to this visitor.
  function consentMode(entry) {
    return !!(entry && entry[0] === 'consent' && entry[1] === 'update' && entry[2] && entry[2].analytics_storage === 'granted');
  }
  // Google's own consent state, also set by GTM CMP templates that never touch the dataLayer.
  // Not a documented API, so read defensively and only the update value.
  function googleState() {
    try { return window.google_tag_data.ics.entries.analytics_storage.update === true; } catch (err) { return false; }
  }
  var dl = window.dataLayer = window.dataLayer || [];
  if (stored() || cookiebot() || Array.prototype.some.call(dl, consentMode) || googleState()) load();
  window.addEventListener('siteConsentUpdated', function (e) { if (e.detail && e.detail.analytics) load(); });
  window.addEventListener('CookiebotOnAccept', function () { if (cookiebot()) load(); });
  var push = dl.push;
  dl.push = function () {
    for (var i = 0; i < arguments.length; i++) if (consentMode(arguments[i])) load();
    return push.apply(dl, arguments);
  };
  // gtag.js, GTM or a later snippet can replace window.dataLayer or its push, which drops the
  // wrapper. A slow poll over new entries catches what it misses.
  var seen = dl, checked = dl.length;
  var timer = setInterval(function () {
    if (done) return clearInterval(timer);
    var cur = window.dataLayer;
    if (cur && typeof cur.length === 'number') {
      if (cur !== seen || checked > cur.length) { seen = cur; checked = 0; }
      for (; checked < cur.length; checked++) if (consentMode(cur[checked])) return load();
    }
    if (googleState()) load();
  }, 1000);
})();
