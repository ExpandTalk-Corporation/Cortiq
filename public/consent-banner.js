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
 *   data-reprompt-reject-days="180"  Days a necessary-only choice is kept before the banner
 *                                asks again (1–400, default 180). An accepted choice is kept 365 days.
 *   data-company="Your Co AB"    Controller's legal name in the banner text (fallback: hostname)
 *   data-policy-url="/privacy"   Privacy policy link
 *   data-tracking-mode="cookieless" | "standard" — picks the statistics text (default: read
 *                                from window.cortiqConfig.cookieless)
 *   data-lang="sv"               sv | en | de | fr | pt — recommended (default: <html lang>,
 *                                then browser)
 *   data-position="bottom"       | "top"   (default: bottom)
 *   data-theme="light"           | "dark"  (default: auto)
 *   data-geo-url="false"         Send the consent record directly to CortIQ instead of through
 *                                CortIQ's geo edge (default: through the edge unless
 *                                data-api-url points elsewhere; direct if the edge fails)
 *   data-consent-mode="google"   Opt in to Google Consent Mode v2 signals (default: off) —
 *                                denied by default, then analytics → analytics_storage,
 *                                marketing → ad_storage/ad_user_data/ad_personalization,
 *                                preferences → functionality/personalization_storage.
 *                                With it on, put this tag in <head> above the Google tags
 *                                (gtag.js, GTM), without defer, so the default is set before
 *                                any Google tag fires.
 *
 * List "preferences" only if the site itself has such features and gates them on this choice.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'site_cookie_consent';
  var BANNER_ID   = 'crtq-consent-banner';
  var ALL_CATEGORIES = ['analytics', 'marketing', 'preferences'];

  // Global Privacy Control (spec 2026-11-18 AC6): marketing/sale/sharing stays refused while the
  // browser sends GPC. No checkbox can override it in this version.
  // Read once at load on purpose: navigator.globalPrivacyControl is a static browser/extension
  // setting for the session, not something that changes mid-page.
  var GPC = (function () { try { return navigator.globalPrivacyControl === true; } catch (e) { return false; } })();
  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

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
  function clampDays(value, fallback) {
    var n = parseInt(value, 10);
    return n >= 1 && n <= 400 ? n : fallback;
  }

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
      code = LANG_ALIAS[code] || code;
      if (T[code]) return code;
    }
    return FALLBACK_LANG;
  }

  // Texts reviewed by the jurist agent 2026-11-05 (sv/en). The other languages carry the same content
  // and need a native legal read before they are marketed in those countries.
  // Each language is one block that starts at `    xx: {`: scripts/banner-languages.mjs cuts them
  // into consent-banner.<lang>.js, so keep that layout.
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
      gpc        : 'Din webbläsare skickar Global Privacy Control (GPC). Därför är marknadsföring avstängd här.',
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
      gpc        : 'Your browser sends Global Privacy Control (GPC), so marketing is turned off here.',
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
      gpc        : 'Ihr Browser sendet Global Privacy Control (GPC). Marketing ist deshalb hier deaktiviert.',
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
      gpc        : 'Votre navigateur envoie le signal Global Privacy Control (GPC) : le marketing est donc désactivé ici.',
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
      gpc        : 'O seu navegador envia o sinal Global Privacy Control (GPC), por isso o marketing está desativado aqui.',
      cats: {
        necessary    : ['Necessários',  'Guarda as suas escolhas nesta janela no seu dispositivo durante 12 meses. A escolha é também registada pela CortIQ como prova do consentimento. Sempre ativos.'],
        analytics    : ['Estatísticas', 'Mede como o site é usado: páginas que visita, cliques e onde clica na página, deslocamento, como os formulários são usados (não o que escreve) e a origem da visita. Para reconhecer visitas repetidas, são usadas informações sobre o seu navegador e dispositivo, como tipo de navegador, tamanho do ecrã, idioma e fuso horário. Os dados não incluem o seu nome, mas são dados pessoais. A CortIQ trata-os em nome do site.'],
        analyticsLite: ['Estatísticas', 'Mede como o site é usado: páginas que visita, cliques, deslocamento e a origem da visita. Nada fica guardado no seu dispositivo após a visita e as visitas repetidas não são reconhecidas. Os dados não incluem o seu nome, mas são dados pessoais. A CortIQ trata-os em nome do site.'],
        marketing    : ['Marketing',    'Guarda o ID do anúncio em que clicou (por exemplo do Google, Meta, Microsoft, TikTok ou LinkedIn). Se enviar um formulário, é também guardado um hash do seu endereço de e-mail – um código derivado, não o endereço em texto simples. Os dados são enviados para o Google Ads para que o site possa medir que anúncios levam a pedidos e compras. A Google tem então acesso a eles.'],
        preferences  : ['Preferências', 'Memoriza escolhas como idioma e esquema.'],
      }
    },
    nl: {
      title      : 'Mogen we je bezoek meten?',
      titleAds   : 'Mogen we je bezoek en onze advertenties meten?',
      body       : ' is verantwoordelijk voor je persoonsgegevens en wil cookies en vergelijkbare technieken gebruiken voor de onderstaande doeleinden. Je kunt je keuze op elk moment wijzigen of intrekken via de knop ‘Cookie-instellingen’ rechtsonder.',
      moreInfo   : 'Lees de privacyverklaring',
      acceptAll  : 'Alles accepteren',
      accept     : 'Accepteren',
      necessary  : 'Alleen noodzakelijke',
      settings   : 'Zelf kiezen',
      manage     : 'Kies wat je accepteert. Alleen het noodzakelijke is vooraf geselecteerd.',
      save       : 'Mijn keuzes opslaan',
      reopen     : 'Cookie-instellingen',
      dialog     : 'Toestemming voor cookies',
      storage    : ' Alleen tijdens het bezoek op je apparaat bewaard. Hoe lang de website de gegevens bewaart, staat in de privacyverklaring.',
      gpc        : 'Je browser verstuurt Global Privacy Control (GPC). Daarom is marketing hier uitgeschakeld.',
      cats: {
        necessary    : ['Noodzakelijk',  'Bewaart je keuzes in dit venster 12 maanden op je apparaat. De keuze wordt ook door CortIQ vastgelegd als bewijs van toestemming. Altijd aan.'],
        analytics    : ['Statistieken',  'Meet hoe de website wordt gebruikt: welke pagina’s je bezoekt, klikken en waar op de pagina je klikt, scrollen, hoe formulieren worden gebruikt (niet wat je invult) en waar het bezoek vandaan kwam. Om terugkerende bezoeken te herkennen worden gegevens over je browser en apparaat gebruikt, zoals browsertype, schermgrootte, taal en tijdzone. De gegevens bevatten je naam niet, maar zijn wel persoonsgegevens. CortIQ verwerkt ze namens de website.'],
        analyticsLite: ['Statistieken',  'Meet hoe de website wordt gebruikt: welke pagina’s je bezoekt, klikken, scrollen en waar het bezoek vandaan kwam. Na het bezoek blijft er niets op je apparaat bewaard en terugkerende bezoeken worden niet herkend. De gegevens bevatten je naam niet, maar zijn wel persoonsgegevens. CortIQ verwerkt ze namens de website.'],
        marketing    : ['Marketing',     'Bewaart de ID van de advertentie waarop je hebt geklikt (bijvoorbeeld van Google, Meta, Microsoft, TikTok of LinkedIn). Als je een formulier verstuurt, wordt ook een hash van je e-mailadres bewaard – een afgeleide code, niet het adres in leesbare tekst. De gegevens worden naar Google Ads gestuurd, zodat de website kan meten welke advertenties tot aanvragen en aankopen leiden. Google krijgt daardoor toegang tot de gegevens.'],
        preferences  : ['Voorkeuren',    'Onthoudt keuzes zoals taal en indeling.'],
      }
    },
    nb: {
      title      : 'Kan vi måle besøket ditt?',
      titleAds   : 'Kan vi måle besøket ditt og annonsene våre?',
      body       : ' er ansvarlig for personopplysningene dine og ønsker å bruke informasjonskapsler (cookies) og lignende teknologi til formålene nedenfor. Du kan når som helst endre eller trekke tilbake valget ditt via knappen «Cookie-innstillinger» nederst til høyre.',
      moreInfo   : 'Les personvernerklæringen',
      acceptAll  : 'Godta alle',
      accept     : 'Godta',
      necessary  : 'Bare nødvendige',
      settings   : 'Velg selv',
      manage     : 'Velg hva du godtar. Ingenting utenom det nødvendige er forhåndsvalgt.',
      save       : 'Lagre valgene mine',
      reopen     : 'Cookie-innstillinger',
      dialog     : 'Samtykke til informasjonskapsler',
      storage    : ' Lagres på enheten din bare under besøket. Hvor lenge nettstedet lagrer opplysningene, står i personvernerklæringen.',
      gpc        : 'Nettleseren din sender Global Privacy Control (GPC). Derfor er markedsføring slått av her.',
      cats: {
        necessary    : ['Nødvendige',    'Lagrer valgene dine i denne boksen i 12 måneder på enheten din. Valget logges også hos CortIQ som bevis på samtykket. Alltid på.'],
        analytics    : ['Statistikk',    'Måler hvordan nettstedet brukes: hvilke sider du besøker, klikk og hvor på siden du klikker, rulling, hvordan skjemaer brukes (ikke hva du skriver) og hvor besøket kom fra. For å kjenne igjen gjentatte besøk brukes opplysninger om nettleseren og enheten din, for eksempel nettlesertype, skjermstørrelse, språk og tidssone. Opplysningene inneholder ikke navnet ditt, men er personopplysninger. CortIQ behandler dem på vegne av nettstedet.'],
        analyticsLite: ['Statistikk',    'Måler hvordan nettstedet brukes: hvilke sider du besøker, klikk, rulling og hvor besøket kom fra. Ingenting lagres på enheten din etter besøket, og gjentatte besøk gjenkjennes ikke. Opplysningene inneholder ikke navnet ditt, men er personopplysninger. CortIQ behandler dem på vegne av nettstedet.'],
        marketing    : ['Markedsføring', 'Lagrer ID-en til annonsen du klikket på (for eksempel fra Google, Meta, Microsoft, TikTok eller LinkedIn). Hvis du sender inn et skjema, lagres også en hash av e-postadressen din – en omregnet kode, ikke adressen i klartekst. Opplysningene sendes til Google Ads slik at nettstedet kan måle hvilke annonser som fører til henvendelser og kjøp. Google får da tilgang til dem.'],
        preferences  : ['Preferanser',   'Husker valg som språk og oppsett.'],
      }
    },
    da: {
      title      : 'Må vi måle dit besøg?',
      titleAds   : 'Må vi måle dit besøg og vores annoncer?',
      body       : ' er ansvarlig for dine personoplysninger og vil gerne bruge cookies og lignende teknologier til formålene nedenfor. Du kan til enhver tid ændre eller trække dit valg tilbage via knappen »Cookieindstillinger« nederst til højre.',
      moreInfo   : 'Læs privatlivspolitikken',
      acceptAll  : 'Accepter alle',
      accept     : 'Accepter',
      necessary  : 'Kun nødvendige',
      settings   : 'Vælg selv',
      manage     : 'Vælg, hvad du accepterer. Intet ud over det nødvendige er forvalgt.',
      save       : 'Gem mine valg',
      reopen     : 'Cookieindstillinger',
      dialog     : 'Samtykke til cookies',
      storage    : ' Gemmes kun på din enhed under besøget. Hvor længe hjemmesiden gemmer oplysningerne, står i privatlivspolitikken.',
      gpc        : 'Din browser sender Global Privacy Control (GPC). Derfor er markedsføring slået fra her.',
      cats: {
        necessary    : ['Nødvendige',    'Gemmer dine valg i denne boks i 12 måneder på din enhed. Valget logges også hos CortIQ som bevis på samtykket. Altid slået til.'],
        analytics    : ['Statistik',     'Måler, hvordan hjemmesiden bruges: hvilke sider du besøger, klik og hvor på siden du klikker, scrolling, hvordan formularer bruges (ikke hvad du skriver), og hvor besøget kom fra. For at genkende gentagne besøg bruges oplysninger om din browser og enhed, fx browsertype, skærmstørrelse, sprog og tidszone. Oplysningerne indeholder ikke dit navn, men er personoplysninger. CortIQ behandler dem på vegne af hjemmesiden.'],
        analyticsLite: ['Statistik',     'Måler, hvordan hjemmesiden bruges: hvilke sider du besøger, klik, scrolling, og hvor besøget kom fra. Intet gemmes på din enhed efter besøget, og gentagne besøg genkendes ikke. Oplysningerne indeholder ikke dit navn, men er personoplysninger. CortIQ behandler dem på vegne af hjemmesiden.'],
        marketing    : ['Markedsføring', 'Gemmer ID’et fra den annonce, du klikkede på (fx fra Google, Meta, Microsoft, TikTok eller LinkedIn). Hvis du sender en formular, gemmes også en hash af din e-mailadresse – en omregnet kode, ikke adressen i klartekst. Oplysningerne sendes til Google Ads, så hjemmesiden kan måle, hvilke annoncer der fører til henvendelser og køb. Google får dermed adgang til dem.'],
        preferences  : ['Præferencer',   'Husker valg som sprog og layout.'],
      }
    },
    fi: {
      title      : 'Saammeko mitata käyntiäsi?',
      titleAds   : 'Saammeko mitata käyntiäsi ja mainoksiamme?',
      body       : ' vastaa henkilötiedoistasi ja haluaa käyttää evästeitä ja vastaavia tekniikoita alla mainittuihin tarkoituksiin. Voit muuttaa tai peruuttaa valintasi milloin tahansa oikean alakulman ”Evästeasetukset”-painikkeesta.',
      moreInfo   : 'Lue tietosuojaseloste',
      acceptAll  : 'Hyväksy kaikki',
      accept     : 'Hyväksy',
      necessary  : 'Vain välttämättömät',
      settings   : 'Valitse itse',
      manage     : 'Valitse, mitä hyväksyt. Mitään muuta kuin välttämätöntä ei ole valittu valmiiksi.',
      save       : 'Tallenna valintani',
      reopen     : 'Evästeasetukset',
      dialog     : 'Suostumus evästeisiin',
      storage    : ' Tallennetaan laitteellesi vain käynnin ajaksi. Kuinka kauan sivusto säilyttää tietoja, kerrotaan tietosuojaselosteessa.',
      gpc        : 'Selaimesi lähettää Global Privacy Control (GPC) -signaalin, joten markkinointi on tässä pois päältä.',
      cats: {
        necessary    : ['Välttämättömät', 'Tallentaa tämän ikkunan valintasi laitteellesi 12 kuukaudeksi. CortIQ kirjaa valinnan myös todisteeksi suostumuksesta. Aina käytössä.'],
        analytics    : ['Tilastot',       'Mittaa, miten sivustoa käytetään: millä sivuilla käyt, klikkaukset ja mihin kohtaan sivua klikkaat, vieritys, miten lomakkeita käytetään (ei sitä, mitä kirjoitat) ja mistä käynti tuli. Toistuvien käyntien tunnistamiseen käytetään tietoja selaimestasi ja laitteestasi, kuten selaimen tyyppiä, näytön kokoa, kieltä ja aikavyöhykettä. Tiedot eivät sisällä nimeäsi, mutta ne ovat henkilötietoja. CortIQ käsittelee niitä sivuston puolesta.'],
        analyticsLite: ['Tilastot',       'Mittaa, miten sivustoa käytetään: millä sivuilla käyt, klikkaukset, vieritys ja mistä käynti tuli. Laitteellesi ei jää käynnin jälkeen mitään, eikä toistuvia käyntejä tunnisteta. Tiedot eivät sisällä nimeäsi, mutta ne ovat henkilötietoja. CortIQ käsittelee niitä sivuston puolesta.'],
        marketing    : ['Markkinointi',   'Tallentaa klikkaamasi mainoksen tunnisteen (esimerkiksi Googlelta, Metalta, Microsoftilta, TikTokilta tai LinkedIniltä). Jos lähetät lomakkeen, tallennetaan myös sähköpostiosoitteesi tiiviste – siitä laskettu koodi, ei osoitetta selkokielisenä. Tiedot lähetetään Google Adsiin, jotta sivusto voi mitata, mitkä mainokset johtavat yhteydenottoihin ja ostoihin. Google saa näin pääsyn niihin.'],
        preferences  : ['Mieltymykset',   'Muistaa valinnat, kuten kielen ja asettelun.'],
      }
    },
    pl: {
      title      : 'Czy możemy mierzyć Twoją wizytę?',
      titleAds   : 'Czy możemy mierzyć Twoją wizytę i nasze reklamy?',
      body       : ' jest administratorem Twoich danych osobowych i chce używać plików cookie oraz podobnych technologii w celach opisanych poniżej. Możesz w każdej chwili zmienić lub wycofać swój wybór za pomocą przycisku „Ustawienia cookie” w prawym dolnym rogu.',
      moreInfo   : 'Przeczytaj politykę prywatności',
      acceptAll  : 'Akceptuj wszystkie',
      accept     : 'Akceptuj',
      necessary  : 'Tylko niezbędne',
      settings   : 'Wybierz samodzielnie',
      manage     : 'Wybierz, na co się zgadzasz. Poza niezbędnymi nic nie jest zaznaczone domyślnie.',
      save       : 'Zapisz moje wybory',
      reopen     : 'Ustawienia cookie',
      dialog     : 'Zgoda na pliki cookie',
      storage    : ' Przechowywane na Twoim urządzeniu tylko podczas wizyty. Jak długo witryna przechowuje dane, podano w polityce prywatności.',
      gpc        : 'Twoja przeglądarka wysyła sygnał Global Privacy Control (GPC), dlatego marketing jest tu wyłączony.',
      cats: {
        necessary    : ['Niezbędne',   'Zapisuje Twoje wybory w tym oknie na Twoim urządzeniu na 12 miesięcy. Wybór jest też rejestrowany przez CortIQ jako dowód zgody. Zawsze włączone.'],
        analytics    : ['Statystyki',  'Mierzy, jak używana jest witryna: które strony odwiedzasz, kliknięcia i miejsca, w które klikasz, przewijanie, sposób korzystania z formularzy (nie to, co wpisujesz) oraz skąd pochodzi wizyta. Aby rozpoznać powracające wizyty, wykorzystywane są informacje o Twojej przeglądarce i urządzeniu, np. typ przeglądarki, rozmiar ekranu, język i strefa czasowa. Dane nie zawierają Twojego imienia i nazwiska, ale są danymi osobowymi. CortIQ przetwarza je w imieniu witryny.'],
        analyticsLite: ['Statystyki',  'Mierzy, jak używana jest witryna: które strony odwiedzasz, kliknięcia, przewijanie oraz skąd pochodzi wizyta. Po wizycie nic nie pozostaje na Twoim urządzeniu, a powracające wizyty nie są rozpoznawane. Dane nie zawierają Twojego imienia i nazwiska, ale są danymi osobowymi. CortIQ przetwarza je w imieniu witryny.'],
        marketing    : ['Marketing',   'Zapisuje identyfikator reklamy, którą kliknięto (na przykład z Google, Meta, Microsoft, TikTok lub LinkedIn). Jeśli wyślesz formularz, zapisywany jest też skrót (hash) Twojego adresu e-mail – wyliczony kod, a nie adres w postaci jawnej. Dane są przesyłane do Google Ads, aby witryna mogła mierzyć, które reklamy prowadzą do zapytań i zakupów. Google uzyskuje wtedy do nich dostęp.'],
        preferences  : ['Preferencje', 'Zapamiętuje wybory, takie jak język i układ.'],
      }
    },
    it: {
      title      : 'Possiamo misurare la tua visita?',
      titleAds   : 'Possiamo misurare la tua visita e i nostri annunci?',
      body       : ' è titolare del trattamento dei tuoi dati personali e vorrebbe usare cookie e tecnologie simili per le finalità indicate di seguito. Puoi modificare o revocare la tua scelta in qualsiasi momento tramite il pulsante «Impostazioni cookie» in basso a destra.',
      moreInfo   : 'Leggi l’informativa sulla privacy',
      acceptAll  : 'Accetta tutti',
      accept     : 'Accetta',
      necessary  : 'Solo necessari',
      settings   : 'Scegli tu',
      manage     : 'Scegli cosa accetti. Nulla è preselezionato tranne ciò che è necessario.',
      save       : 'Salva le mie scelte',
      reopen     : 'Impostazioni cookie',
      dialog     : 'Consenso ai cookie',
      storage    : ' Conservato sul tuo dispositivo solo durante la visita. Per quanto tempo il sito conserva i dati è indicato nell’informativa sulla privacy.',
      gpc        : 'Il tuo browser invia il segnale Global Privacy Control (GPC), quindi il marketing qui è disattivato.',
      cats: {
        necessary    : ['Necessari',   'Salva le tue scelte in questa finestra sul tuo dispositivo per 12 mesi. La scelta viene inoltre registrata da CortIQ come prova del consenso. Sempre attivi.'],
        analytics    : ['Statistiche', 'Misura come viene usato il sito: pagine visitate, clic e punto della pagina in cui fai clic, scorrimento, uso dei moduli (non ciò che scrivi) e provenienza della visita. Per riconoscere le visite ripetute vengono usate informazioni sul tuo browser e dispositivo, come tipo di browser, dimensioni dello schermo, lingua e fuso orario. I dati non contengono il tuo nome, ma sono dati personali. CortIQ li tratta per conto del sito.'],
        analyticsLite: ['Statistiche', 'Misura come viene usato il sito: pagine visitate, clic, scorrimento e provenienza della visita. Dopo la visita non resta nulla sul tuo dispositivo e le visite ripetute non vengono riconosciute. I dati non contengono il tuo nome, ma sono dati personali. CortIQ li tratta per conto del sito.'],
        marketing    : ['Marketing',   'Salva l’ID dell’annuncio su cui hai fatto clic (ad esempio di Google, Meta, Microsoft, TikTok o LinkedIn). Se invii un modulo, viene salvato anche un hash del tuo indirizzo e-mail – un codice derivato, non l’indirizzo in chiaro. I dati vengono inviati a Google Ads affinché il sito possa misurare quali annunci portano a richieste e acquisti. Google vi ha quindi accesso.'],
        preferences  : ['Preferenze',  'Ricorda scelte come la lingua e il layout.'],
      }
    },
    es: {
      title      : '¿Podemos medir tu visita?',
      titleAds   : '¿Podemos medir tu visita y nuestros anuncios?',
      body       : ' es responsable de tus datos personales y quiere usar cookies y tecnologías similares para las finalidades indicadas a continuación. Puedes cambiar o retirar tu elección en cualquier momento con el botón «Configuración de cookies» abajo a la derecha.',
      moreInfo   : 'Leer la política de privacidad',
      acceptAll  : 'Aceptar todas',
      accept     : 'Aceptar',
      necessary  : 'Solo necesarias',
      settings   : 'Elegir',
      manage     : 'Elige qué aceptas. Solo lo necesario está preseleccionado.',
      save       : 'Guardar mis opciones',
      reopen     : 'Configuración de cookies',
      dialog     : 'Consentimiento de cookies',
      storage    : ' Se guarda en tu dispositivo solo durante la visita. El tiempo que el sitio conserva los datos se indica en la política de privacidad.',
      gpc        : 'Tu navegador envía la señal Global Privacy Control (GPC), por lo que el marketing está desactivado aquí.',
      cats: {
        necessary    : ['Necesarias',   'Guarda tus elecciones en esta ventana en tu dispositivo durante 12 meses. CortIQ también registra la elección como prueba del consentimiento. Siempre activas.'],
        analytics    : ['Estadísticas', 'Mide cómo se usa el sitio: las páginas que visitas, los clics y dónde haces clic en la página, el desplazamiento, cómo se usan los formularios (no lo que escribes) y de dónde vino la visita. Para reconocer las visitas repetidas se usan datos de tu navegador y dispositivo, como el tipo de navegador, el tamaño de pantalla, el idioma y la zona horaria. Los datos no incluyen tu nombre, pero son datos personales. CortIQ los trata por cuenta del sitio.'],
        analyticsLite: ['Estadísticas', 'Mide cómo se usa el sitio: las páginas que visitas, los clics, el desplazamiento y de dónde vino la visita. No queda nada guardado en tu dispositivo después de la visita y las visitas repetidas no se reconocen. Los datos no incluyen tu nombre, pero son datos personales. CortIQ los trata por cuenta del sitio.'],
        marketing    : ['Marketing',    'Guarda el ID del anuncio en el que hiciste clic (por ejemplo de Google, Meta, Microsoft, TikTok o LinkedIn). Si envías un formulario, también se guarda un hash de tu dirección de correo electrónico – un código derivado, no la dirección en texto claro. Los datos se envían a Google Ads para que el sitio pueda medir qué anuncios generan consultas y compras. Google tiene entonces acceso a ellos.'],
        preferences  : ['Preferencias', 'Recuerda elecciones como el idioma y el diseño.'],
      }
    },
    is: {
      title      : 'Megum við mæla heimsókn þína?',
      titleAds   : 'Megum við mæla heimsókn þína og auglýsingar okkar?',
      body       : ' ber ábyrgð á persónuupplýsingum þínum og vill nota vafrakökur og sambærilega tækni í þeim tilgangi sem lýst er hér að neðan. Þú getur breytt eða afturkallað val þitt hvenær sem er með hnappnum „Vafrakökustillingar“ neðst til hægri.',
      moreInfo   : 'Lesa persónuverndarstefnuna',
      acceptAll  : 'Samþykkja allt',
      accept     : 'Samþykkja',
      necessary  : 'Aðeins nauðsynlegar',
      settings   : 'Sérsníða',
      manage     : 'Veldu hvað þú samþykkir. Ekkert er forvalið nema það sem er nauðsynlegt.',
      save       : 'Vista valið mitt',
      reopen     : 'Vafrakökustillingar',
      dialog     : 'Samþykki fyrir vafrakökum',
      storage    : ' Geymt í tækinu þínu aðeins meðan á heimsókninni stendur. Hve lengi vefurinn geymir gögnin kemur fram í persónuverndarstefnunni.',
      gpc        : 'Vafrinn þinn sendir Global Privacy Control (GPC) og því er slökkt á markaðssetningu hér.',
      cats: {
        necessary    : ['Nauðsynlegar',   'Vistar val þitt í þessum glugga í tækinu þínu í 12 mánuði. CortIQ skráir valið einnig sem sönnun á samþykki. Alltaf virkt.'],
        analytics    : ['Tölfræði',       'Mælir hvernig vefurinn er notaður: hvaða síður þú heimsækir, smelli og hvar á síðunni þú smellir, skrun, hvernig eyðublöð eru notuð (ekki hvað þú skrifar) og hvaðan heimsóknin kom. Til að þekkja endurteknar heimsóknir eru notaðar upplýsingar um vafrann þinn og tækið, svo sem tegund vafra, skjástærð, tungumál og tímabelti. Gögnin innihalda ekki nafn þitt en eru persónuupplýsingar. CortIQ vinnur þau fyrir hönd vefsins.'],
        analyticsLite: ['Tölfræði',       'Mælir hvernig vefurinn er notaður: hvaða síður þú heimsækir, smelli, skrun og hvaðan heimsóknin kom. Ekkert er geymt í tækinu þínu eftir heimsóknina og endurteknar heimsóknir eru ekki þekktar. Gögnin innihalda ekki nafn þitt en eru persónuupplýsingar. CortIQ vinnur þau fyrir hönd vefsins.'],
        marketing    : ['Markaðssetning', 'Vistar auðkenni auglýsingarinnar sem þú smelltir á (til dæmis frá Google, Meta, Microsoft, TikTok eða LinkedIn). Ef þú sendir inn eyðublað er einnig vistað tætigildi (hash) netfangsins þíns – reiknaður kóði, ekki netfangið í læsilegu formi. Gögnin eru send til Google Ads svo vefurinn geti mælt hvaða auglýsingar leiða til fyrirspurna og kaupa. Google fær þá aðgang að þeim.'],
        preferences  : ['Kjörstillingar', 'Man val eins og tungumál og útlit.'],
      }
    }
  };

  // Norwegian arrives as nb, nn or no; all read the bokmål text. A single-language build
  // (consent-banner.<lang>.js, scripts/banner-languages.mjs) has no en, so it falls back to its own.
  var LANG_ALIAS = { no: 'nb', nn: 'nb' };
  var FALLBACK_LANG = T.en ? 'en' : Object.keys(T)[0];

  var DIRECT_URL = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
  var GEO_URL = 'https://cortiq-geo.cortiq.workers.dev';

  var cfg = {
    position      : attr('data-position') || 'bottom',
    theme         : attr('data-theme') || 'auto',
    company       : attr('data-company') || String(location.hostname || '').replace(/^www\./, ''),
    policyUrl     : attr('data-policy-url'),
    policyVersion : String(attr('data-policy-version') || '1').slice(0, 20),
    rejectDays    : clampDays(attr('data-reprompt-reject-days'), 180),
    categories    : parseCategories(attr('data-categories')),
    lang          : pickLang(),
    siteId        : attr('data-site-id'),
    apiUrl        : attr('data-api-url') || DIRECT_URL,
    geoUrl        : attr('data-geo-url') === 'false' ? false : (attr('data-geo-url') || null),
  };

  function t() { return T[cfg.lang] || T[FALLBACK_LANG]; }

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

  // GPC wins over whatever was stored before this visit (saved pre-5.5.15, or before the
  // browser turned GPC on): every reader of a stored choice — consentAlreadyGiven, the
  // reopened settings panel, the initial render, the startup Consent Mode replay — gets
  // marketing already forced false. localStorage is not rewritten here; the next write (a new
  // choice, or postConsent saving the ledger id) stores the forced value.
  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var saved = raw ? JSON.parse(raw) : null;
      if (saved && GPC) saved.marketing = false;
      return saved;
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
      // The tracker (5.5.12+) stores when the session times out; an expired id belongs to
      // a past visit, so the consent record gets a fresh one that the tracker then adopts.
      var expires = Number(sessionStorage.getItem('cortiq_session_expires'));
      if (existing && !(expires > 0 && Date.now() > expires)) return existing;
      if (existing) {
        sessionStorage.removeItem('cortiq_session_id');
        sessionStorage.removeItem('cortiq_session_expires');
      }
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
        gpc_signal: GPC,
        time_zone: timeZone(),
        source: 'consent_banner',
        policy_version: cfg.policyVersion,
        banner_lang: cfg.lang
      };
      if (/^tk_/.test(cfg.siteId)) body.tracking_id = cfg.siteId;
      else body.site_id = cfg.siteId;
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'omit'
      };
      // Through the CortIQ geo Worker (signed country) unless the site has its own apiUrl or
      // data-geo-url="false"; if the Worker fails, the same post goes directly once.
      var primary = cfg.geoUrl === false ? cfg.apiUrl : (cfg.geoUrl || (cfg.apiUrl === DIRECT_URL ? GEO_URL : cfg.apiUrl));
      var direct = function () { return fetch(cfg.apiUrl + '/store-consent', opts); };
      (primary === cfg.apiUrl ? direct() : fetch(primary + '/store-consent', opts).then(function (res) {
        return res.headers.get('x-cortiq-geo-proxy') === 'error' ? direct() : res;
      }, direct)).then(function (res) { return res.json(); }).then(function (json) {
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
      types[key] = cfg.categories.indexOf(key) !== -1 && chosen[key] === true && !(GPC && key === 'marketing');
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
      // A necessary-only choice is asked again sooner than an accepted one; never on every visit.
      expiresAt     : new Date(now + (ALL_CATEGORIES.some(function (key) { return types[key]; }) ? 365 : cfg.rejectDays) * 24 * 60 * 60 * 1000).toISOString()
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
      var locked = key === 'necessary' || (GPC && key === 'marketing');
      var on = key === 'necessary' || (saved[key] === true && !(GPC && key === 'marketing'));
      return row(key, label, '', locked, on, dark, muted);
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
          (GPC && cfg.categories.indexOf('marketing') !== -1 ? '<p style="margin:6px 0 0;color:' + muted + ';font-size:12px;">' + tx.gpc + '</p>' : ''),
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
  // arguments object, not an array. Opt-in (data-consent-mode="google"): many sites run no Google
  // tags or set Consent Mode themselves.
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
    if (attr('data-consent-mode') !== 'google') return;
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
