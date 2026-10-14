// CortIQ consent-gated loader. Inlined into the install snippet (see trackingSnippet.ts) with
// the source placeholder replaced by the tracker URL. It requests the tracker only after analytics consent,
// so no request — and no IP address — reaches cortiq.se before the visitor has chosen.
// Reads the CortIQ banner (site_cookie_consent + siteConsentUpdated), Cookiebot and Google Consent Mode.
// Deliberately permissive about the stored record: the tracker itself validates consent strictly.
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
  function stored() {
    try {
      var c = JSON.parse(localStorage.getItem('site_cookie_consent') || 'null');
      if (!c || c.analytics !== true) return false;
      var e = typeof c.expiresAt === 'number' ? c.expiresAt : Date.parse(c.expiresAt);
      return !(e <= Date.now());
    } catch (err) { return false; }
  }
  function cookiebot() { return !!(window.Cookiebot && window.Cookiebot.consent && window.Cookiebot.consent.statistics); }
  function consentMode(entry) {
    return !!(entry && entry[0] === 'consent' && entry[1] === 'update' && entry[2] && entry[2].analytics_storage === 'granted');
  }
  var dl = window.dataLayer = window.dataLayer || [];
  if (stored() || cookiebot() || Array.prototype.some.call(dl, consentMode)) load();
  window.addEventListener('siteConsentUpdated', function (e) { if (e.detail && e.detail.analytics) load(); });
  window.addEventListener('CookiebotOnAccept', function () { if (cookiebot()) load(); });
  var push = dl.push;
  dl.push = function () {
    for (var i = 0; i < arguments.length; i++) if (consentMode(arguments[i])) load();
    return push.apply(dl, arguments);
  };
})();
