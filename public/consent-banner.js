/**
 * CortIQ Consent Banner — Standalone embeddable CMP
 * Drop-in cookie banner for any website using CortIQ analytics.
 * Fires siteConsentUpdated (consumed by cortiq.js) and stores
 * consent in localStorage so the tracking script reads it on next load.
 *
 * Usage:
 *   <script src="https://cortiq.se/consent-banner.js"
 *     data-site-id="tk_..."
 *     defer></script>
 *
 * Options (data-* attributes):
 *   data-position="bottom"      | "top"   (default: bottom)
 *   data-theme="light"          | "dark"  (default: auto)
 *   data-company="Your Brand"   (shown in banner text)
 *   data-policy-url="/privacy"  (link in "More info" text)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'site_cookie_consent';
  var BANNER_ID   = 'crtq-consent-banner';

  // ── Skip if another CMP is active ──────────────────────────────────────
  function otherCMPDetected() {
    if (window.Cookiebot || window.OneTrust || window.OnetrustActiveGroups) return true;
    if (typeof window.__tcfapi === 'function') return true;
    return false;
  }

  // ── Skip if consent already stored ────────────────────────────────────
  function consentAlreadyGiven() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var saved = raw ? JSON.parse(raw) : null;
      return !!saved && Date.parse(saved.expiresAt) > Date.now() &&
        ['analytics', 'marketing', 'preferences'].every(function (key) { return typeof saved[key] === 'boolean'; });
    } catch (e) { return false; }
  }

  // ── Config from script tag ─────────────────────────────────────────────
  var _script = document.currentScript ||
    document.querySelector('script[src*="consent-banner"]');

  var cfg = {
    position  : (_script && _script.getAttribute('data-position'))   || 'bottom',
    theme     : (_script && _script.getAttribute('data-theme'))       || 'auto',
    company   : (_script && _script.getAttribute('data-company'))     || 'CortIQ',
    policyUrl : (_script && _script.getAttribute('data-policy-url'))  || null,
    lang      : (_script && _script.getAttribute('data-lang'))        || (navigator.language || '').slice(0, 2) || 'en',
    siteId    : (_script && _script.getAttribute('data-site-id'))     || null,
    apiUrl    : (_script && _script.getAttribute('data-api-url'))     || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1',
  };

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
  // alone is not proof — the store-consent row is the authoritative ledger.
  function postConsent(types) {
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
        policy_version: '1.0'
      };
      if (/^tk_/.test(cfg.siteId)) body.tracking_id = cfg.siteId;
      else body.site_id = cfg.siteId;
      fetch(cfg.apiUrl + '/store-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  var T = {
    sv: {
      title      : 'Vi använder cookies',
      body       : ' använder analyticscookies för att förbättra upplevelsen.',
      moreInfo   : 'Mer information',
      acceptAll  : 'Acceptera alla',
      necessary  : 'Endast nödvändiga',
      settings   : 'Inställningar',
      manage     : 'Välj vilka cookies du tillåter.',
      save       : 'Spara inställningar',
      cats: {
        necessary  : ['Nödvändiga',    'Krävs för att webbplatsen ska fungera. Kan inte avaktiveras.'],
        analytics  : ['Analys',        'Hjälper oss förstå hur besökare använder sajten (anonymt).'],
        marketing  : ['Marknadsföring','Används för relevanta annonser och e-handelsspårning.'],
        preferences: ['Preferenser',   'Kommer ihåg dina inställningar och personaliseringsval.'],
      }
    },
    en: {
      title      : 'We use cookies',
      body       : ' uses analytics cookies to improve the experience.',
      moreInfo   : 'More info',
      acceptAll  : 'Accept all',
      necessary  : 'Necessary only',
      settings   : 'Settings',
      manage     : 'Manage which cookies you allow.',
      save       : 'Save settings',
      cats: {
        necessary  : ['Necessary',   'Required for the site to work. Cannot be disabled.'],
        analytics  : ['Analytics',   'Helps understand how visitors use the site (anonymous).'],
        marketing  : ['Marketing',   'Used for relevant ads and e-commerce tracking.'],
        preferences: ['Preferences', 'Remembers your settings and personalisation choices.'],
      }
    }
  };

  function t() { return T[cfg.lang] || T.en; }

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
  function saveConsent(types) {
    var payload = {
      necessary   : true,
      analytics   : types.analytics,
      marketing   : types.marketing,
      preferences : types.preferences,
      expiresAt   : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    try {
      var exp = new Date();
      exp.setFullYear(exp.getFullYear() + 1);
      document.cookie = 'site_consent=' + JSON.stringify(payload) +
        '; expires=' + exp.toUTCString() + '; path=/; samesite=strict';
    } catch (e) {}
    postConsent(types);
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

    // Colours
    var bg      = dark ? '#1a1a2e'  : '#ffffff';
    var text    = dark ? '#e2e8f0'  : '#1a202c';
    var muted   = dark ? '#94a3b8'  : '#6b7280';
    var border  = dark ? '#2d3748'  : '#e2e8f0';
    var accent  = '#6366f1';                      // indigo — matches CortIQ brand
    var neutral = dark ? '#475569' : '#64748b';   // slate — equal weight to accent
    var btnFg   = '#ffffff';

    var posStyle = cfg.position === 'top'
      ? 'top:0;left:0;right:0;padding-top:12px;padding-bottom:12px;'
      : 'bottom:0;left:0;right:0;padding-top:12px;padding-bottom:12px;';

    var wrapper = document.createElement('div');
    wrapper.id = BANNER_ID;
    wrapper.setAttribute('role', 'dialog');
    wrapper.setAttribute('aria-label', 'Cookie consent');
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

    var policyLink = cfg.policyUrl
      ? ' <a href="' + cfg.policyUrl + '" style="color:' + accent + ';text-decoration:underline;" target="_blank" rel="noopener">' + t().moreInfo + '</a>'
      : '';

    var tx = t();

    wrapper.innerHTML = [
      '<div style="max-width:960px;margin:0 auto;padding:0 16px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;">',
        '<div style="flex:1;min-width:220px;">',
          '<strong style="display:block;margin-bottom:4px;font-size:15px;">' + tx.title + '</strong>',
          '<span style="color:' + muted + ';">',
            cfg.company + tx.body,
            policyLink,
          '</span>',
        '</div>',
        '<div id="crtq-cb-actions" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">',
          // Both buttons: same size, same font-weight, same border-radius — only color differs
          '<button id="crtq-cb-accept" style="background:' + accent + ';color:' + btnFg + ';border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">',
            tx.acceptAll,
          '</button>',
          '<button id="crtq-cb-necessary" style="background:' + neutral + ';color:' + btnFg + ';border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">',
            tx.necessary,
          '</button>',
          '<button id="crtq-cb-settings" style="background:transparent;color:' + muted + ';border:none;padding:9px 4px;font-size:13px;cursor:pointer;text-decoration:underline;white-space:nowrap;">',
            tx.settings,
          '</button>',
        '</div>',
      '</div>',
      // Settings panel (hidden by default)
      '<div id="crtq-cb-settings-panel" style="display:none;max-width:960px;margin:12px auto 0;padding:0 16px 4px;">',
        '<div style="background:' + (dark ? '#2d3748' : '#f8fafc') + ';border:1px solid ' + border + ';border-radius:8px;padding:16px;">',
          '<p style="margin:0 0 12px;color:' + muted + ';font-size:13px;">' + tx.manage + '</p>',
          '<div style="display:flex;flex-direction:column;gap:10px;">',
            row('necessary',   tx.cats.necessary[0],   tx.cats.necessary[1],   true,  dark, text, muted, border, accent),
            row('analytics',   tx.cats.analytics[0],   tx.cats.analytics[1],   false, dark, text, muted, border, accent),
            row('marketing',   tx.cats.marketing[0],   tx.cats.marketing[1],   false, dark, text, muted, border, accent),
            row('preferences', tx.cats.preferences[0], tx.cats.preferences[1], false, dark, text, muted, border, accent),
          '</div>',
          '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">',
            '<button id="crtq-cb-save" style="background:' + accent + ';color:' + btnFg + ';border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer;">',
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
      saveConsent({
        analytics   : document.getElementById('crtq-toggle-analytics').checked,
        marketing   : document.getElementById('crtq-toggle-marketing').checked,
        preferences : document.getElementById('crtq-toggle-preferences').checked
      });
    });
  }

  // ── Toggle row helper ──────────────────────────────────────────────────
  function row(id, label, desc, disabled, dark, text, muted, border, accent) {
    var trackBg  = disabled ? '#94a3b8' : accent;
    var inputId  = 'crtq-toggle-' + id;
    return [
      '<label style="display:flex;align-items:flex-start;gap:12px;cursor:' + (disabled ? 'default' : 'pointer') + ';">',
        // Toggle switch
        '<span style="position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;margin-top:1px;">',
          '<input type="checkbox" id="' + inputId + '"',
            disabled ? ' checked disabled' : '',
            ' style="opacity:0;width:0;height:0;position:absolute;"',
          '>',
          '<span class="crtq-track" data-id="' + id + '" style="',
            'position:absolute;top:0;left:0;right:0;bottom:0;',
            'background:' + (disabled ? '#94a3b8' : (dark ? '#4a5568' : '#cbd5e0')) + ';',
            'border-radius:22px;transition:background 0.2s;cursor:' + (disabled ? 'default' : 'pointer') + ';',
          '"></span>',
          '<span class="crtq-thumb" data-id="' + id + '" style="',
            'position:absolute;top:3px;left:3px;',
            'width:16px;height:16px;',
            'background:#fff;border-radius:50%;',
            'transition:transform 0.2s;pointer-events:none;',
            (disabled ? 'transform:translateX(18px);' : ''),
          '"></span>',
        '</span>',
        '<span>',
          '<strong style="display:block;font-size:14px;">' + label + '</strong>',
          '<span style="color:' + muted + ';font-size:12px;">' + desc + '</span>',
        '</span>',
      '</label>'
    ].join('');
  }

  // ── Wire up toggle visual state ────────────────────────────────────────
  function wireToggles() {
    var inputs = document.querySelectorAll('[id^="crtq-toggle-"]:not([disabled])');
    var accent = '#6366f1';
    var offBg  = isDark() ? '#4a5568' : '#cbd5e0';
    inputs.forEach(function (inp) {
      inp.addEventListener('change', function () {
        var id    = inp.id.replace('crtq-toggle-', '');
        var track = document.querySelector('.crtq-track[data-id="' + id + '"]');
        var thumb = document.querySelector('.crtq-thumb[data-id="' + id + '"]');
        if (track) track.style.background = inp.checked ? accent : offBg;
        if (thumb) thumb.style.transform  = inp.checked ? 'translateX(18px)' : '';
      });
    });
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
      settingsButton.textContent = cfg.lang === 'sv' ? 'Cookieinställningar' : 'Cookie settings';
      settingsButton.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9998;padding:8px 12px;border:1px solid #64748b;border-radius:6px;background:#fff;color:#0f172a;cursor:pointer;font:14px system-ui;';
      settingsButton.addEventListener('click', function () {
        buildBanner();
        wireToggles();
        var accept = document.getElementById('crtq-cb-accept');
        if (accept) accept.focus();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
