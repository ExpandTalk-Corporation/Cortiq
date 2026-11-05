/**
 * CortIQ Consent Banner — Standalone embeddable consent banner
 * Drop-in banner for any website using CortIQ analytics.
 * Fires siteConsentUpdated (consumed by cortiq.js and the install snippet's loader) and
 * stores the choice in localStorage (site_cookie_consent) so the tracker reads it on the
 * next page load. Each choice is also logged server-side via store-consent (Art. 7(1)).
 *
 * Usage:
 *   <script src="https://cortiq.se/consent-banner.js"
 *     data-site-id="<site id or tk_ key>"
 *     data-company="Your Company AB"
 *     data-policy-url="/privacy"
 *     data-lang="sv"
 *     defer></script>
 *
 * Required: data-site-id (proof-of-consent log), data-company (legal name of the controller),
 * data-policy-url. The banner warns in the console when one is missing.
 *
 * Options (data-* attributes):
 *   data-categories="analytics"  Comma list of analytics, marketing, preferences — only the
 *                                purposes your site actually uses (default: analytics)
 *   data-policy-version="1"      Bump it when your privacy policy or categories change;
 *                                visitors are asked again (default: 1)
 *   data-company="Your Co AB"    Controller's legal name in the banner text (fallback: hostname)
 *   data-policy-url="/privacy"   Privacy policy link
 *   data-tracking-mode="cookieless" | "standard" — picks the statistics text (default: read
 *                                from window.cortiqConfig.cookieless)
 *   data-lang="sv"               sv | en | de | fr | pt — recommended (default: <html lang>,
 *                                then browser)
 *   data-position="bottom"       | "top"   (default: bottom)
 *   data-theme="light"           | "dark"  (default: auto)
 *   data-consent-mode="off"      Do not send Google Consent Mode v2 signals (default: on —
 *                                denied by default, then analytics → analytics_storage,
 *                                marketing → ad_storage/ad_user_data/ad_personalization,
 *                                preferences → functionality/personalization_storage)
 *
 * With Google tags (gtag.js, GTM) on the page, put this tag in <head> above them, without
 * defer, so the Consent Mode default is set before any Google tag fires.
 *
 * List "preferences" only if the site itself has such features and gates them on this choice.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'site_cookie_consent';
  var BANNER_ID   = 'crtq-consent-banner';
  var ALL_CATEGORIES = ['analytics', 'marketing', 'preferences'];

  // ── Skip if another CMP is active ──────────────────────────────────────
  function otherCMPDetected() {
    if (window.Cookiebot || window.OneTrust || window.OnetrustActiveGroups) return true;
    if (typeof window.__tcfapi === 'function') return true;
    return false;
  }

  // ── Config from script tag ─────────────────────────────────────────────
  var _script = document.currentScript ||
    document.querySelector('script[src*="consent-banner"]');

  function attr(name) { return (_script && _script.getAttribute(name)) || null; }

  function parseCategories(value) {
    var picked = String(value || 'analytics').toLowerCase().split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return ALL_CATEGORIES.indexOf(s) !== -1; });
    return picked.length ? picked : ['analytics'];
  }

  function pickLang() {
    var candidates = [attr('data-lang'), document.documentElement && document.documentElement.lang, navigator.language];
    for (var i = 0; i < candidates.length; i++) {
      var code = String(candidates[i] || '').slice(0, 2).toLowerCase();
      if (T[code]) return code;
    }
    return 'en';
  }

  // Texts reviewed by the jurist agent 2026-11-05 (sv/en). de/fr/pt carry the same content and
  // need a native legal read before they are marketed in those countries.
  // analytics = standard mode (recognises returning visits); analyticsLite = cookieless mode.
  var T = {
    sv: {
      title      : 'Får vi mäta ditt besök?',
      titleAds   : 'Får vi mäta ditt besök och våra annonser?',
      body       : ' ansvarar för dina personuppgifter och vill använda cookies och liknande teknik för ändamålen nedan. Du kan ändra eller återkalla ditt val när som helst via knappen ”Cookieinställningar” nere till höger.',
      moreInfo   : 'Läs mer i integritetspolicyn',
      acceptAll  : 'Godkänn alla',
      accept     : 'Godkänn',
      necessary  : 'Endast nödvändiga',
      settings   : 'Välj själv',
      manage     : 'Välj vad du godkänner. Inget utom det nödvändiga är förvalt.',
      save       : 'Spara mina val',
      reopen     : 'Cookieinställningar',
      dialog     : 'Samtycke till cookies',
      storage    : ' Sparas på din enhet bara under besöket. Hur länge webbplatsen sparar uppgifterna står i integritetspolicyn.',
      cats: {
        necessary    : ['Nödvändiga',     'Sparar dina val i den här rutan i 12 månader på din enhet. Valet loggas också hos CortIQ som bevis på samtycket. Alltid på.'],
        analytics    : ['Statistik',      'Mäter hur webbplatsen används: vilka sidor du besöker, klick och var på sidan du klickar, scrollning, hur formulär används (inte vad du skriver) och varifrån besöket kom. För att känna igen återkommande besök används uppgifter om din webbläsare och enhet, till exempel webbläsartyp, skärmstorlek, språk och tidszon. Uppgifterna innehåller inte ditt namn men är personuppgifter. CortIQ behandlar dem på uppdrag av webbplatsen.'],
        analyticsLite: ['Statistik',      'Mäter hur webbplatsen används: vilka sidor du besöker, klick, scrollning och varifrån besöket kom. Inget sparas på din enhet efter besöket och återkommande besök känns inte igen. Uppgifterna innehåller inte ditt namn men är personuppgifter. CortIQ behandlar dem på uppdrag av webbplatsen.'],
        marketing    : ['Marknadsföring', 'Sparar ID:t från annonsen du klickade på (till exempel från Google, Meta, Microsoft, Tiktok eller Linkedin). Om du skickar ett formulär sparas också en hash av din e-postadress – en omräknad kod, inte adressen i klartext. Uppgifterna skickas till Google Ads så att webbplatsen kan mäta vilka annonser som leder till förfrågningar och köp. Google får då tillgång till dem.'],
        preferences  : ['Preferenser',    'Kommer ihåg val som språk och layout.'],
      }
    },
    en: {
      title      : 'May we measure your visit?',
      titleAds   : 'May we measure your visit and our ads?',
      body       : ' is responsible for your personal data and would like to use cookies and similar technologies for the purposes below. You can change or withdraw your choice at any time via the “Cookie settings” button at the bottom right.',
      moreInfo   : 'Read the privacy policy',
      acceptAll  : 'Accept all',
      accept     : 'Accept',
      necessary  : 'Necessary only',
      settings   : 'Let me choose',
      manage     : 'Choose what you accept. Nothing except the necessary is preselected.',
      save       : 'Save my choices',
      reopen     : 'Cookie settings',
      dialog     : 'Cookie consent',
      storage    : ' Kept on your device only during the visit. How long the site keeps the data is stated in the privacy policy.',
      cats: {
        necessary    : ['Necessary',   'Stores your choices in this box on your device for 12 months. The choice is also logged by CortIQ as proof of consent. Always on.'],
        analytics    : ['Statistics',  'Measures how the site is used: pages you visit, clicks and where on the page you click, scrolling, how forms are used (not what you type) and where the visit came from. To recognise returning visits, information about your browser and device is used, such as browser type, screen size, language and time zone. The data does not include your name but is personal data. CortIQ processes it on behalf of the site.'],
        analyticsLite: ['Statistics',  'Measures how the site is used: pages you visit, clicks, scrolling and where the visit came from. Nothing is kept on your device after the visit and returning visits are not recognised. The data does not include your name but is personal data. CortIQ processes it on behalf of the site.'],
        marketing    : ['Marketing',   'Stores the ID of the ad you clicked (for example from Google, Meta, Microsoft, TikTok or LinkedIn). If you submit a form, a hash of your email address is also stored – a derived code, not the address in plain text. The data is sent to Google Ads so the site can measure which ads lead to enquiries and purchases. Google then has access to it.'],
        preferences  : ['Preferences', 'Remembers choices such as language and layout.'],
      }
    },
    de: {
      title      : 'Dürfen wir Ihren Besuch messen?',
      titleAds   : 'Dürfen wir Ihren Besuch und unsere Anzeigen messen?',
      body       : ' ist für Ihre personenbezogenen Daten verantwortlich und möchte Cookies und ähnliche Technologien für die unten genannten Zwecke verwenden. Sie können Ihre Wahl jederzeit über die Schaltfläche „Cookie-Einstellungen“ unten rechts ändern oder widerrufen.',
      moreInfo   : 'Datenschutzerklärung lesen',
      acceptAll  : 'Alle akzeptieren',
      accept     : 'Akzeptieren',
      necessary  : 'Nur notwendige',
      settings   : 'Selbst wählen',
      manage     : 'Wählen Sie, was Sie erlauben. Außer dem Notwendigen ist nichts vorausgewählt.',
      save       : 'Auswahl speichern',
      reopen     : 'Cookie-Einstellungen',
      dialog     : 'Einwilligung zu Cookies',
      storage    : ' Wird auf Ihrem Gerät nur während des Besuchs gespeichert. Wie lange die Website die Daten speichert, steht in der Datenschutzerklärung.',
      cats: {
        necessary    : ['Notwendig',   'Speichert Ihre Auswahl in diesem Fenster für 12 Monate auf Ihrem Gerät. Die Auswahl wird außerdem bei CortIQ als Nachweis der Einwilligung protokolliert. Immer aktiv.'],
        analytics    : ['Statistik',   'Misst, wie die Website genutzt wird: welche Seiten Sie besuchen, Klicks und wohin Sie auf der Seite klicken, Scrollen, wie Formulare genutzt werden (nicht, was Sie eingeben) und woher der Besuch kam. Um wiederkehrende Besuche zu erkennen, werden Angaben zu Ihrem Browser und Gerät verwendet, z. B. Browsertyp, Bildschirmgröße, Sprache und Zeitzone. Die Daten enthalten nicht Ihren Namen, sind aber personenbezogene Daten. CortIQ verarbeitet sie im Auftrag der Website.'],
        analyticsLite: ['Statistik',   'Misst, wie die Website genutzt wird: welche Seiten Sie besuchen, Klicks, Scrollen und woher der Besuch kam. Nach dem Besuch bleibt nichts auf Ihrem Gerät gespeichert, und wiederkehrende Besuche werden nicht erkannt. Die Daten enthalten nicht Ihren Namen, sind aber personenbezogene Daten. CortIQ verarbeitet sie im Auftrag der Website.'],
        marketing    : ['Marketing',   'Speichert die ID der Anzeige, auf die Sie geklickt haben (z. B. von Google, Meta, Microsoft, TikTok oder LinkedIn). Wenn Sie ein Formular absenden, wird außerdem ein Hash Ihrer E-Mail-Adresse gespeichert – ein umgerechneter Code, nicht die Adresse im Klartext. Die Daten werden an Google Ads übermittelt, damit die Website messen kann, welche Anzeigen zu Anfragen und Käufen führen. Google erhält dadurch Zugriff darauf.'],
        preferences  : ['Präferenzen', 'Merkt sich Einstellungen wie Sprache und Layout.'],
      }
    },
    fr: {
      title      : 'Pouvons-nous mesurer votre visite ?',
      titleAds   : 'Pouvons-nous mesurer votre visite et nos publicités ?',
      body       : ' est responsable de vos données personnelles et souhaite utiliser des cookies et des technologies similaires pour les finalités ci-dessous. Vous pouvez modifier ou retirer votre choix à tout moment via le bouton « Paramètres des cookies » en bas à droite.',
      moreInfo   : 'Lire la politique de confidentialité',
      acceptAll  : 'Tout accepter',
      accept     : 'Accepter',
      necessary  : 'Tout refuser',
      settings   : 'Choisir moi-même',
      manage     : 'Choisissez ce que vous acceptez. Rien n’est présélectionné hormis le nécessaire.',
      save       : 'Enregistrer mes choix',
      reopen     : 'Paramètres des cookies',
      dialog     : 'Consentement aux cookies',
      storage    : ' Conservé sur votre appareil uniquement pendant la visite. La durée de conservation des données par le site est indiquée dans la politique de confidentialité.',
      cats: {
        necessary    : ['Nécessaires',  'Enregistre vos choix dans cette fenêtre sur votre appareil pendant 12 mois. Le choix est également journalisé par CortIQ comme preuve du consentement. Toujours actifs.'],
        analytics    : ['Statistiques', 'Mesure l’utilisation du site : pages consultées, clics et endroit où vous cliquez, défilement, utilisation des formulaires (pas ce que vous saisissez) et provenance de la visite. Pour reconnaître les visites répétées, des informations sur votre navigateur et votre appareil sont utilisées, comme le type de navigateur, la taille de l’écran, la langue et le fuseau horaire. Les données ne contiennent pas votre nom mais sont des données personnelles. CortIQ les traite pour le compte du site.'],
        analyticsLite: ['Statistiques', 'Mesure l’utilisation du site : pages consultées, clics, défilement et provenance de la visite. Rien n’est conservé sur votre appareil après la visite et les visites répétées ne sont pas reconnues. Les données ne contiennent pas votre nom mais sont des données personnelles. CortIQ les traite pour le compte du site.'],
        marketing    : ['Marketing',    'Enregistre l’identifiant de l’annonce sur laquelle vous avez cliqué (par exemple Google, Meta, Microsoft, TikTok ou LinkedIn). Si vous envoyez un formulaire, un hachage de votre adresse e-mail est également enregistré – un code dérivé, pas l’adresse en clair. Les données sont transmises à Google Ads afin que le site puisse mesurer quelles annonces mènent à des demandes et à des achats. Google y a alors accès.'],
        preferences  : ['Préférences',  'Mémorise vos choix comme la langue et la mise en page.'],
      }
    },
    pt: {
      title      : 'Podemos medir a sua visita?',
      titleAds   : 'Podemos medir a sua visita e os nossos anúncios?',
      body       : ' é responsável pelos seus dados pessoais e gostaria de usar cookies e tecnologias semelhantes para as finalidades abaixo. Pode alterar ou retirar a sua escolha a qualquer momento através do botão “Definições de cookies” no canto inferior direito.',
      moreInfo   : 'Ler a política de privacidade',
      acceptAll  : 'Aceitar tudo',
      accept     : 'Aceitar',
      necessary  : 'Apenas necessários',
      settings   : 'Escolher',
      manage     : 'Escolha o que aceita. Nada está pré-selecionado além do necessário.',
      save       : 'Guardar as minhas escolhas',
      reopen     : 'Definições de cookies',
      dialog     : 'Consentimento de cookies',
      storage    : ' Guardado no seu dispositivo apenas durante a visita. O tempo durante o qual o site guarda os dados consta da política de privacidade.',
      cats: {
        necessary    : ['Necessários',  'Guarda as suas escolhas nesta janela no seu dispositivo durante 12 meses. A escolha é também registada pela CortIQ como prova do consentimento. Sempre ativos.'],
        analytics    : ['Estatísticas', 'Mede como o site é usado: páginas que visita, cliques e onde clica na página, deslocamento, como os formulários são usados (não o que escreve) e a origem da visita. Para reconhecer visitas repetidas, são usadas informações sobre o seu navegador e dispositivo, como tipo de navegador, tamanho do ecrã, idioma e fuso horário. Os dados não incluem o seu nome, mas são dados pessoais. A CortIQ trata-os em nome do site.'],
        analyticsLite: ['Estatísticas', 'Mede como o site é usado: páginas que visita, cliques, deslocamento e a origem da visita. Nada fica guardado no seu dispositivo após a visita e as visitas repetidas não são reconhecidas. Os dados não incluem o seu nome, mas são dados pessoais. A CortIQ trata-os em nome do site.'],
        marketing    : ['Marketing',    'Guarda o ID do anúncio em que clicou (por exemplo do Google, Meta, Microsoft, TikTok ou LinkedIn). Se enviar um formulário, é também guardado um hash do seu endereço de e-mail – um código derivado, não o endereço em texto simples. Os dados são enviados para o Google Ads para que o site possa medir que anúncios levam a pedidos e compras. A Google tem então acesso a eles.'],
        preferences  : ['Preferências', 'Memoriza escolhas como idioma e esquema.'],
      }
    }
  };

  var cfg = {
    position      : attr('data-position') || 'bottom',
    theme         : attr('data-theme') || 'auto',
    company       : attr('data-company') || String(location.hostname || '').replace(/^www\./, ''),
    policyUrl     : attr('data-policy-url'),
    policyVersion : String(attr('data-policy-version') || '1').slice(0, 20),
    categories    : parseCategories(attr('data-categories')),
    lang          : pickLang(),
    siteId        : attr('data-site-id'),
    apiUrl        : attr('data-api-url') || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1',
  };

  function t() { return T[cfg.lang] || T.en; }

  // Without these the banner cannot name the controller, link the policy or log proof (Art. 7(1)).
  if (!attr('data-company'))     warn('data-company is missing — set it to your legal company name.');
  if (!cfg.policyUrl)            warn('data-policy-url is missing — link your privacy policy.');
  if (!cfg.siteId)               warn('data-site-id is missing — choices are not logged as proof of consent.');
  function warn(msg) { try { console.warn('[CortIQ consent banner] ' + msg); } catch (e) {} }

  // Cookieless tracking keeps nothing after the visit and does not recognise returning
  // visitors, so it gets the shorter statistics text. data-tracking-mode overrides.
  function isCookieless() {
    var mode = attr('data-tracking-mode');
    if (mode) return mode === 'cookieless';
    var trackingConfig = window.cortiqConfig || window.wfaConfig || {};
    return trackingConfig.cookieless === true;
  }

  function categoryText(key) {
    var cats = t().cats;
    var entry = key === 'analytics' && isCookieless() ? cats.analyticsLite : cats[key];
    var desc = entry[1] + (key === 'analytics' || key === 'marketing' ? t().storage : '');
    return [entry[0], desc];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ── Skip if a valid choice for this policy version is stored ──────────
  // A new data-policy-version (changed policy or categories) asks the visitor again.
  function consentAlreadyGiven() {
    var saved = readStored();
    return !!saved && Date.parse(saved.expiresAt) > Date.now() &&
      String(saved.policyVersion) === cfg.policyVersion &&
      ALL_CATEGORIES.every(function (key) { return typeof saved[key] === 'boolean'; });
  }

  function newConsentId() {
    try { return crypto.randomUUID(); }
    catch (e) { return 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }

  // Reuse the same session id the tracking script uses, so the server-side consent
  // record can be joined to the visitor/conversion for this session.
  function getSessionId(types) {
    try {
      var existing = sessionStorage.getItem('cortiq_session_id');
      if (existing) return existing;
    } catch (e) {}
    var id;
    try { id = 'sess_' + crypto.randomUUID(); }
    catch (e) { id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
    var trackingConfig = window.cortiqConfig || window.wfaConfig || {};
    if (types.analytics === true && trackingConfig.cookieless !== true) {
      try { sessionStorage.setItem('cortiq_session_id', id); } catch (e) {}
    }
    return id;
  }

  // Persist demonstrable proof of consent server-side (GDPR Art. 7(1)). localStorage
  // alone is not proof — the store-consent row is the authoritative ledger. Its id
  // replaces the local consentId so the visitor's record points at the ledger row.
  function postConsent(types, payload) {
    if (!cfg.siteId) return;
    try {
      var body = {
        session_id: getSessionId(types),
        consent_types: {
          necessary: true,
          analytics: !!types.analytics,
          marketing: !!types.marketing,
          preferences: !!types.preferences
        },
        gpc_signal: (navigator.globalPrivacyControl === true),
        source: 'consent_banner',
        policy_version: cfg.policyVersion
      };
      if (/^tk_/.test(cfg.siteId)) body.tracking_id = cfg.siteId;
      else body.site_id = cfg.siteId;
      fetch(cfg.apiUrl + '/store-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).then(function (res) { return res.json(); }).then(function (json) {
        if (!json || typeof json.consent_id !== 'string') return;
        var saved = readStored();
        if (!saved || saved.consentId !== payload.consentId) return; // a newer choice was made
        saved.consentId = json.consent_id;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }

  // ── Detect preferred color scheme ─────────────────────────────────────
  function isDark() {
    if (cfg.theme === 'dark') return true;
    if (cfg.theme === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ── Dispatch consent event ─────────────────────────────────────────────
  function dispatchConsent(types) {
    try {
      window.dispatchEvent(new CustomEvent('siteConsentUpdated', {
        detail: {
          necessary   : true,
          analytics   : types.analytics,
          marketing   : types.marketing,
          preferences : types.preferences,
          ecommerce   : types.marketing,
          timestamp   : Date.now()
        }
      }));
    } catch (e) {}
    try {
      sessionStorage.setItem('user_consent', JSON.stringify({
        analytics   : types.analytics,
        marketing   : types.marketing,
        preferences : types.preferences,
        ecommerce   : types.marketing,
        granted     : true,
        timestamp   : Date.now()
      }));
    } catch (e) {}
  }

  // ── Save consent to localStorage + cookie ─────────────────────────────
  // Categories the site does not use are always stored as false.
  function saveConsent(chosen) {
    var types = {};
    ALL_CATEGORIES.forEach(function (key) {
      types[key] = cfg.categories.indexOf(key) !== -1 && chosen[key] === true;
    });
    var now = Date.now();
    var payload = {
      necessary     : true,
      analytics     : types.analytics,
      marketing     : types.marketing,
      preferences   : types.preferences,
      consentId     : newConsentId(),
      policyVersion : cfg.policyVersion,
      timestamp     : now,
      expiresAt     : new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
    // localStorage only: no server code reads a consent cookie, so none is set.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    postConsent(types, payload);
    pushConsentMode('update', types);
    dispatchConsent(types);
    removeBanner();
  }

  // ── Remove banner from DOM ─────────────────────────────────────────────
  function removeBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = cfg.position === 'top' ? 'translateY(-100%)' : 'translateY(100%)';
      setTimeout(function () { el && el.parentNode && el.parentNode.removeChild(el); }, 350);
    }
  }

  // ── Build and inject banner ────────────────────────────────────────────
  function buildBanner() {
    if (document.getElementById(BANNER_ID)) return;
    var dark = isDark();
    var saved = readStored() || {};

    // Colours
    var bg      = dark ? '#1a1a2e'  : '#ffffff';
    var text    = dark ? '#e2e8f0'  : '#1a202c';
    var muted   = dark ? '#94a3b8'  : '#4b5563';
    var border  = dark ? '#2d3748'  : '#e2e8f0';
    var accent  = '#4f46e5';                      // indigo — matches CortIQ brand
    var neutral = dark ? '#475569' : '#475569';   // slate — equal weight to accent
    var btnFg   = '#ffffff';

    var posStyle = cfg.position === 'top'
      ? 'top:0;left:0;right:0;padding-top:12px;padding-bottom:12px;'
      : 'bottom:0;left:0;right:0;padding-top:12px;padding-bottom:12px;';

    var wrapper = document.createElement('div');
    wrapper.id = BANNER_ID;
    wrapper.setAttribute('role', 'dialog');
    wrapper.setAttribute('aria-label', t().dialog);
    wrapper.setAttribute('aria-live', 'polite');
    wrapper.style.cssText = [
      'position:fixed', posStyle,
      'background:' + bg,
      'border-' + (cfg.position === 'top' ? 'bottom' : 'top') + ':1px solid ' + border,
      'box-shadow:0 -4px 24px rgba(0,0,0,0.12)',
      'z-index:2147483647',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:14px',
      'line-height:1.5',
      'color:' + text,
      'transition:transform 0.4s ease,opacity 0.4s ease',
      'contain:layout style'
    ].join(';');

    var tx = t();

    var policyLink = cfg.policyUrl
      ? ' <a href="' + escapeHtml(cfg.policyUrl) + '" style="color:' + (dark ? '#a5b4fc' : accent) + ';text-decoration:underline;" target="_blank" rel="noopener">' + tx.moreInfo + '</a>'
      : '';

    // Purposes are shown in the first layer, so "Accept all" is informed (Art. 4(11)).
    // The settings panel repeats only the names, as toggles.
    var shown = ['necessary'].concat(cfg.categories);
    var purposes = shown.map(function (key) {
      var c = key === 'necessary' ? tx.cats.necessary : categoryText(key);
      return '<li style="margin:2px 0;"><strong style="color:' + text + ';">' + c[0] + ':</strong> ' + c[1] + '</li>';
    }).join('');
    var rows = shown.map(function (key) {
      var label = (key === 'necessary' ? tx.cats.necessary : categoryText(key))[0];
      return row(key, label, '', key === 'necessary', key === 'necessary' || saved[key] === true, dark, muted);
    });
    var single = cfg.categories.length === 1;
    var title = cfg.categories.indexOf('marketing') !== -1 ? tx.titleAds : tx.title;

    wrapper.innerHTML = [
      '<div style="max-width:960px;margin:0 auto;padding:0 16px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;">',
        '<div style="flex:1;min-width:220px;">',
          '<strong id="crtq-cb-title" tabindex="-1" style="display:block;margin-bottom:4px;font-size:15px;outline:none;">' + title + '</strong>',
          '<span style="color:' + muted + ';">',
            escapeHtml(cfg.company) + tx.body,
            policyLink,
          '</span>',
          '<ul style="margin:6px 0 0;padding-left:18px;color:' + muted + ';font-size:12px;max-height:40vh;overflow-y:auto;">' + purposes + '</ul>',
        '</div>',
        '<div id="crtq-cb-actions" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">',
          // Accept and reject: same size, same font-weight, same border-radius — only color differs
          '<button id="crtq-cb-accept" type="button" style="background:' + accent + ';color:' + btnFg + ';border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">',
            single ? tx.accept : tx.acceptAll,
          '</button>',
          '<button id="crtq-cb-necessary" type="button" style="background:' + neutral + ';color:' + btnFg + ';border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">',
            tx.necessary,
          '</button>',
          '<button id="crtq-cb-settings" type="button" style="background:transparent;color:' + muted + ';border:none;padding:9px 4px;font-size:13px;cursor:pointer;text-decoration:underline;white-space:nowrap;">',
            tx.settings,
          '</button>',
        '</div>',
      '</div>',
      // Settings panel (hidden by default)
      '<div id="crtq-cb-settings-panel" style="display:none;max-width:960px;margin:12px auto 0;padding:0 16px 4px;">',
        '<div style="background:' + (dark ? '#2d3748' : '#f8fafc') + ';border:1px solid ' + border + ';border-radius:8px;padding:16px;">',
          '<p style="margin:0 0 12px;color:' + muted + ';font-size:13px;">' + tx.manage + '</p>',
          '<div style="display:flex;flex-direction:column;gap:10px;">',
            rows.join(''),
          '</div>',
          '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">',
            '<button id="crtq-cb-save" type="button" style="background:' + accent + ';color:' + btnFg + ';border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;">',
              tx.save,
            '</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(wrapper);

    // Button handlers
    document.getElementById('crtq-cb-accept').addEventListener('click', function () {
      saveConsent({ analytics: true, marketing: true, preferences: true });
    });
    document.getElementById('crtq-cb-necessary').addEventListener('click', function () {
      saveConsent({ analytics: false, marketing: false, preferences: false });
    });
    document.getElementById('crtq-cb-settings').addEventListener('click', function () {
      var panel = document.getElementById('crtq-cb-settings-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('crtq-cb-save').addEventListener('click', function () {
      var chosen = {};
      cfg.categories.forEach(function (key) {
        chosen[key] = document.getElementById('crtq-toggle-' + key).checked;
      });
      saveConsent(chosen);
    });
  }

  // ── Toggle row helper ──────────────────────────────────────────────────
  function row(id, label, desc, disabled, checked, dark, muted) {
    var accent   = '#4f46e5';
    var offBg    = dark ? '#4a5568' : '#cbd5e0';
    var inputId  = 'crtq-toggle-' + id;
    return [
      '<label style="display:flex;align-items:flex-start;gap:12px;cursor:' + (disabled ? 'default' : 'pointer') + ';">',
        // Toggle switch
        '<span style="position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;margin-top:1px;">',
          '<input type="checkbox" id="' + inputId + '"',
            checked ? ' checked' : '',
            disabled ? ' disabled' : '',
            ' style="opacity:0;width:0;height:0;position:absolute;"',
          '>',
          '<span class="crtq-track" data-id="' + id + '" style="',
            'position:absolute;top:0;left:0;right:0;bottom:0;',
            'background:' + (disabled ? '#94a3b8' : (checked ? accent : offBg)) + ';',
            'border-radius:22px;transition:background 0.2s;cursor:' + (disabled ? 'default' : 'pointer') + ';',
          '"></span>',
          '<span class="crtq-thumb" data-id="' + id + '" style="',
            'position:absolute;top:3px;left:3px;',
            'width:16px;height:16px;',
            'background:#fff;border-radius:50%;',
            'transition:transform 0.2s;pointer-events:none;',
            (checked ? 'transform:translateX(18px);' : ''),
          '"></span>',
        '</span>',
        '<span>',
          '<strong style="display:block;font-size:14px;">' + label + '</strong>',
          desc ? '<span style="color:' + muted + ';font-size:12px;">' + desc + '</span>' : '',
        '</span>',
      '</label>'
    ].join('');
  }

  // ── Wire up toggle visual state ────────────────────────────────────────
  function wireToggles() {
    var inputs = document.querySelectorAll('[id^="crtq-toggle-"]:not([disabled])');
    var accent = '#4f46e5';
    var offBg  = isDark() ? '#4a5568' : '#cbd5e0';
    Array.prototype.forEach.call(inputs, function (inp) {
      inp.addEventListener('change', function () {
        var id    = inp.id.replace('crtq-toggle-', '');
        var track = document.querySelector('.crtq-track[data-id="' + id + '"]');
        var thumb = document.querySelector('.crtq-thumb[data-id="' + id + '"]');
        if (track) track.style.background = inp.checked ? accent : offBg;
        if (thumb) thumb.style.transform  = inp.checked ? 'translateX(18px)' : '';
      });
    });
  }

  // ── Google Consent Mode v2 ─────────────────────────────────────────────
  // Google tags (gtag.js, GTM) on the page follow the visitor's choice: everything denied
  // until they choose, then an update per category. gtag commands must be pushed as an
  // arguments object, not an array. data-consent-mode="off" leaves Consent Mode to the site.
  function consentModeState(types) {
    function g(on) { return on ? 'granted' : 'denied'; }
    return {
      analytics_storage       : g(types.analytics),
      ad_storage              : g(types.marketing),
      ad_user_data            : g(types.marketing),
      ad_personalization      : g(types.marketing),
      functionality_storage   : g(types.preferences),
      personalization_storage : g(types.preferences),
      security_storage        : 'granted'
    };
  }

  function pushConsentMode(command, types, extra) {
    if (attr('data-consent-mode') === 'off') return;
    var state = consentModeState(types);
    for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) state[key] = extra[key];
    try {
      var dl = window.dataLayer = window.dataLayer || [];
      (function () { dl.push(arguments); })('consent', command, state);
    } catch (e) {}
  }

  // ── Entry point ────────────────────────────────────────────────────────
  function init() {
    if (otherCMPDetected())    return;
    // Keep a visible way to revisit the choice after the banner has closed.
    // Merely remembering consent must never remove the withdrawal control.
    if (!document.getElementById('crtq-consent-settings')) {
      var settingsButton = document.createElement('button');
      settingsButton.id = 'crtq-consent-settings';
      settingsButton.type = 'button';
      settingsButton.textContent = t().reopen;
      settingsButton.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9998;padding:8px 12px;border:1px solid #64748b;border-radius:6px;background:#fff;color:#0f172a;cursor:pointer;font:14px system-ui;';
      settingsButton.addEventListener('click', function () {
        buildBanner();
        wireToggles();
        // Reopened to change a choice: show the current toggles and focus the heading,
        // not "Accept all".
        var panel = document.getElementById('crtq-cb-settings-panel');
        if (panel) panel.style.display = 'block';
        var heading = document.getElementById('crtq-cb-title');
        if (heading) heading.focus();
      });
      document.body.appendChild(settingsButton);
    }
    if (consentAlreadyGiven()) return;

    // Small delay avoids flash on fast-loading pages
    setTimeout(function () {
      if (otherCMPDetected())    return;
      if (consentAlreadyGiven()) return;
      buildBanner();
      wireToggles();
    }, 800);
  }

  // The default runs as soon as this file executes: Google tags must see it before they fire,
  // so on pages with Google tags the banner tag belongs in <head>, above them.
  if (!otherCMPDetected()) {
    pushConsentMode('default', {}, { wait_for_update: 500 });
    if (consentAlreadyGiven()) pushConsentMode('update', readStored());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
