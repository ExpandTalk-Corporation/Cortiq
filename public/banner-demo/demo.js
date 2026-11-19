// Loads the real consent banner for the homepage example. No site id attribute is set, so no
// consent is logged; the homepage frames this page with sandbox="allow-scripts", so nothing is
// stored either.
(function () {
  var LANGS = ['sv', 'en', 'de', 'fr', 'pt'];
  var match = /[?&]lang=([^&]*)/.exec(location.search);
  var lang = match && LANGS.indexOf(match[1]) !== -1 ? match[1] : 'en';
  document.documentElement.lang = lang;
  var script = document.createElement('script');
  script.src = '/consent-banner.js';
  script.setAttribute('data-lang', lang);
  script.setAttribute('data-company', 'Example Company AB');
  script.setAttribute('data-policy-url', '/privacy/');
  script.setAttribute('data-theme', 'light');
  document.body.appendChild(script);
})();
