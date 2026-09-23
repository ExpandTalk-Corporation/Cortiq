/**
 * CortIQ Advanced Tracking Script
 * Unified visitor profiling with AI agent detection
 * Version: 5.4.1 (shared with the WordPress plugin — see src/lib/plugin-version.ts)
 *
 * Usage:
 * <script>
 *   window.cortiqConfig = {
 *     siteId: 'your-site-uuid',
 *     apiUrl: 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1'
 *   };
 * </script>
 * <script src="/spa-tracking.js"></script>
 */

(function() {
  'use strict';

  // Keep in sync with wordpress-plugin/cortiq-analytics.php (CORTIQ_VERSION).
  const CORTIQ_VERSION = '5.4.1';

  // Configuration
  const config = window.cortiqConfig || window.wfaConfig || {};
  const API_URL = config.apiUrl || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
  const SITE_ID = config.siteId || config.companyId;
  const API_KEY = config.apiKey;
  const CONTENT_TYPE = config.contentType || 'page';
  const PLATFORM = config.platform || 'web';
  // Cookieless controls identity/storage, not legal permission. This client script
  // requires analytics consent in either mode. Server-only measurement is separate.
  const COOKIELESS = config.cookieless === true;
  // Optional scoping / parity config (all opt-in via window.cortiqConfig).
  const EXCLUDE_IFRAMES = config.excludeIframes === true;
  const EXCLUDE_PATHS = (config.excludePaths || '').split(',').map(s => s.trim()).filter(Boolean);
  const AUTH_PATH = config.authPath || '/admin';
  const TENANT_ID = config.tenantId || null;

  if (!SITE_ID) {
    console.error('CortIQ Tracking: Missing siteId in window.cortiqConfig');
    return;
  }

  // Global state
  let VISITOR_ID = null;
  let VISITOR_PROFILE = null;
  let IDENTIFICATION_COMPLETE = false;
  let MEMORY_SESSION_ID = null; // in-memory session id used in cookieless mode
  let SESSION_ID = null;
  let consentOverride = null;
  let consentGeneration = 0;
  let analyticsStarted = false;
  let listenersInstalled = false;
  let securityStarted = false;
  let aiReferralTracked = false;

  // Security/bot-detection session id. In-memory only, never written to the
  // visitor's device and never cross-visit — this identifies a single page
  // context for grouping strictly-necessary security beacons, nothing more.
  const SECURITY_SESSION_ID = (function () {
    try { return 'sess_' + crypto.randomUUID(); }
    catch (_) { return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  })();

  // Stable per-session identifier. Deliberately NOT a device fingerprint — a
  // random UUID persisted only after analytics consent.
  function getOrCreateSessionId() {
    if (!hasStoredAnalyticsConsent()) return null;
    // Cookieless mode: keep the id in memory only — no sessionStorage, nothing written
    // to the visitor's device — so it never persists beyond the current page context.
    if (COOKIELESS) {
      if (!MEMORY_SESSION_ID) {
        try { MEMORY_SESSION_ID = 'sess_' + crypto.randomUUID(); }
        catch (_) { MEMORY_SESSION_ID = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
      }
      return MEMORY_SESSION_ID;
    }
    try {
      const existing = sessionStorage.getItem('cortiq_session_id');
      if (existing) return existing;
    } catch (_) { /* Storage or browser capability unavailable. */ }
    let id;
    try {
      id = 'sess_' + crypto.randomUUID();
    } catch (_) {
      id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    try { sessionStorage.setItem('cortiq_session_id', id); } catch (_) { /* Storage or browser capability unavailable. */ }
    return id;
  }

  // Get canvas fingerprint
  function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('CortIQ', 2, 15);
      return canvas.toDataURL();
    } catch (e) {
      return null;
    }
  }

  // Get WebGL fingerprint
  function getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return null;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return null;

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    } catch (e) {
      return null;
    }
  }

  // Extract UTM parameters from URL
  function getUTMParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      utmSource: urlParams.get('utm_source'),
      utmMedium: urlParams.get('utm_medium'),
      utmCampaign: urlParams.get('utm_campaign')
    };
  }

  // A stored choice counts only until its expiresAt. WordPress plugin < 5.4.0 saved
  // { timestamp, consentId, policyVersion } without expiresAt; honour those for the
  // plugin's default 365-day cooldown so installed sites keep working until they update.
  const LEGACY_CONSENT_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  function consentUnexpired(saved) {
    if (saved.expiresAt != null) return Date.parse(saved.expiresAt) > Date.now();
    const legacy = typeof saved.timestamp === 'number' && saved.timestamp <= Date.now() &&
      typeof saved.consentId === 'string' && saved.policyVersion != null;
    return legacy && saved.timestamp + LEGACY_CONSENT_MAX_AGE > Date.now();
  }

  // Check if visitor has given marketing/advertising consent
  function hasMarketingConsent() {
    if (COOKIELESS) return false;
    if (consentOverride) return consentOverride.marketing === true;
    if (window.Cookiebot) return window.Cookiebot.consent?.marketing === true;
    try {
      const stored = localStorage.getItem('site_cookie_consent');
      const saved = stored ? JSON.parse(stored) : null;
      if (saved?.marketing === true && consentUnexpired(saved)) return true;
    } catch (_) { /* Storage or browser capability unavailable. */ }
    return false;
  }

  // Extract ad click IDs — only called when marketing consent is given
  // GDPR: click IDs are pseudonymous identifiers tied to paid ad sessions.
  // They require marketing consent under ePrivacy / GDPR Art. 6.1.a.
  function getClickIds() {
    if (!hasMarketingConsent()) return null;
    const p = new URLSearchParams(window.location.search);
    const ids = {
      gclid: p.get('gclid'),
      fbclid: p.get('fbclid'),
      msclkid: p.get('msclkid'),
      ttclid: p.get('ttclid'),
      li_fat_id: p.get('li_fat_id')
    };
    // Only return object if at least one click ID is present
    const hasAny = Object.values(ids).some(Boolean);
    if (!hasAny) return null;
    // Persist in sessionStorage for use in conversion events later
    try { sessionStorage.setItem('cortiq_click_ids', JSON.stringify(ids)); } catch (_) { /* Storage or browser capability unavailable. */ }
    return ids;
  }

  // Retrieve previously stored click IDs (for conversion events on later pages)
  function getStoredClickIds() {
    if (!hasMarketingConsent()) return null;
    try {
      const stored = sessionStorage.getItem('cortiq_click_ids');
      return stored ? JSON.parse(stored) : null;
    } catch (_) { return null; }
  }

  // Get device type
  function getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  // Identify visitor (called once on page load)
  async function identifyVisitor() {
    if (COOKIELESS || !hasStoredAnalyticsConsent()) return null;
    if (!SESSION_ID) SESSION_ID = getOrCreateSessionId();
    const generation = consentGeneration;
    try {
      const utm = getUTMParams();
      const fingerprintAllowed = config.fingerprintConsent === true && hasMarketingConsent();
      const webgl = fingerprintAllowed ? getWebGLFingerprint() : null;

      const clickIds = getClickIds();
      const payload = {
        siteId: SITE_ID,
        sessionId: SESSION_ID,
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: new Date().getTimezoneOffset(),
        language: navigator.language,
        platform: navigator.platform,
        referrer: document.referrer,
        currentUrl: window.location.href,
        utmSource: utm.utmSource,
        utmMedium: utm.utmMedium,
        utmCampaign: utm.utmCampaign,
        // Ad click IDs — only included when marketing consent is given
        ...(clickIds && {
          gclid: clickIds.gclid,
          fbclid: clickIds.fbclid,
          msclkid: clickIds.msclkid,
          ttclid: clickIds.ttclid,
          li_fat_id: clickIds.li_fat_id,
          clickIdConsentGiven: true
        }),
        // Canvas/WebGL fingerprinting requires BOTH operator opt-in (config flag)
        // AND the visitor's explicit marketing consent under GDPR / ePrivacy.
        canvasFingerprint: (config.fingerprintConsent === true && hasMarketingConsent()) ? getCanvasFingerprint() : null,
        webglFingerprint: (config.fingerprintConsent === true && hasMarketingConsent() && webgl) ? JSON.stringify(webgl) : null
      };

      const response = await fetch(`${API_URL}/visitor-identification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        if (generation !== consentGeneration || !hasStoredAnalyticsConsent()) return null;
        if (result.success) {
          VISITOR_ID = result.visitor.visitorId;
          VISITOR_PROFILE = result.visitor;
          IDENTIFICATION_COMPLETE = true;

          console.log('CortIQ Visitor identified:', {
            id: VISITOR_ID,
            type: result.visitor.visitorType,
            isNew: result.visitor.isNewVisitor,
            segments: result.visitor.segments
          });

          // Fire custom event for other scripts to listen to
          window.dispatchEvent(new CustomEvent('cortiq:visitor-identified', {
            detail: result.visitor
          }));

          return result.visitor;
        }
      } else {
        console.warn('CortIQ Visitor identification failed:', await response.text());
      }
    } catch (error) {
      console.error('CortIQ Visitor identification error:', error);
    }

    if (generation === consentGeneration) IDENTIFICATION_COMPLETE = true;
    return null;
  }

  // Wait for visitor identification before tracking
  async function waitForIdentification() {
    if (IDENTIFICATION_COMPLETE) return;

    // Wait max 3 seconds for identification
    const timeout = 3000;
    const start = Date.now();

    while (!IDENTIFICATION_COMPLETE && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Track event
  async function trackEvent(eventType, contentId, additionalMetadata = {}) {
    if (!hasStoredAnalyticsConsent()) return;
    const generation = consentGeneration;
    try {
      // Wait for visitor identification
      await waitForIdentification();
      if (generation !== consentGeneration || !hasStoredAnalyticsConsent()) return;
      if (!SESSION_ID) SESSION_ID = getOrCreateSessionId();

      const storedClickIds = getStoredClickIds();
      const metadata = {
        user_agent: navigator.userAgent,
        referrer: document.referrer,
        device_type: getDeviceType(),
        url: window.location.href,
        visitor_id: VISITOR_ID,
        visitor_type: VISITOR_PROFILE?.visitorType,
        traffic_segment: getTrafficSegment(),
        // Include click IDs in all events so conversion events carry attribution context
        ...(storedClickIds && { click_ids: storedClickIds }),
        ...(TENANT_ID && { tenant_id: TENANT_ID }),
        ...additionalMetadata
      };

      const payload = {
        company_id: SITE_ID, // Support old config
        site_id: SITE_ID,
        content_type: CONTENT_TYPE,
        content_id: contentId || window.location.pathname,
        event_type: eventType,
        platform: PLATFORM,
        session_id: SESSION_ID,
        visitor_id: VISITOR_ID,
        metadata: metadata,
        timestamp: Date.now()
      };

      const response = await fetch(`${API_URL}/track-event`, {
        method: 'POST',
        headers: API_KEY ? {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        } : {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('CortIQ Tracking error:', error);
      } else {
        const result = await response.json();
        console.log('CortIQ Event tracked:', eventType, result.event_id);
      }
    } catch (error) {
      console.error('CortIQ Tracking failed:', error);
    }
  }

  // Track page view
  function trackPageView() {
    trackEvent('view', window.location.pathname);
  }

  // Track clicks on specific elements
  function setupClickTracking() {
    // Click tracking is behavioural — requires analytics consent even in cookieless mode.
    if (!hasInteractionConsent()) {
      deferUntilInteractionConsent(setupClickTracking);
      return;
    }
    document.addEventListener('click', function(e) {
      if (!hasInteractionConsent()) return;
      const target = e.target.closest('[data-wfa-track]');
      if (target) {
        const contentId = target.getAttribute('data-wfa-content-id') || window.location.pathname;
        const eventType = target.getAttribute('data-wfa-event') || 'click';
        trackEvent(eventType, contentId, {
          element: target.tagName.toLowerCase(),
          text: target.textContent.substring(0, 100)
        });
      }
    });
  }

  // SHA-256 hex digest, computed in the browser. Used to hash a submitted email
  // before it ever leaves the page — the raw email is never sent to CortIQ.
  async function sha256Hex(value) {
    const data = new TextEncoder().encode(value.toLowerCase().trim());
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Record a first-party conversion: writes a conversion_events row (via the site
  // model) with the visitor's paid-click context. Sends only a hashed email.
  async function recordConversion(form, contentId) {
    // Conversion events require analytics consent; email matching additionally
    // requires marketing consent. Cookieless mode does not capture identity.
    if (!hasInteractionConsent()) return;
    if (COOKIELESS) return;
    const generation = consentGeneration;
    try {
      let hashedEmail = null;
      const emailInput = hasMarketingConsent() && form.querySelector('input[type="email"], input[name*="email" i]');
      if (emailInput && emailInput.value) {
        hashedEmail = await sha256Hex(emailInput.value);
      }
      if (generation !== consentGeneration || !hasInteractionConsent()) return;
      if (!hasMarketingConsent()) hashedEmail = null;
      const valueAttr = form.getAttribute('data-wfa-value');
      await fetch(`${API_URL}/record-conversion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: SITE_ID,
          sessionId: SESSION_ID,
          // The unified visitor UUID is the reliable key for looking up captured
          // click IDs (gclid) — pass it so the conversion can be attributed.
          visitorId: VISITOR_ID,
          hashedEmail,
          eventName: form.getAttribute('data-wfa-conversion') || 'Conversion',
          eventValue: valueAttr ? Number(valueAttr) : undefined,
          contentId,
        }),
        keepalive: true,
      });
    } catch (err) {
      console.error('CortIQ conversion recording failed:', err);
    }
  }

  // Track conversions
  function setupConversionTracking() {
    // Conversion interactions require analytics consent at capture time.
    if (!hasInteractionConsent()) {
      deferUntilInteractionConsent(setupConversionTracking);
      return;
    }
    document.addEventListener('submit', function(e) {
      if (!hasInteractionConsent()) return;
      const form = e.target;
      if (form.hasAttribute('data-wfa-conversion')) {
        const contentId = form.getAttribute('data-wfa-content-id') || window.location.pathname;
        const value = parseFloat(form.getAttribute('data-wfa-value') || '0');
        const currency = form.getAttribute('data-wfa-currency') || 'SEK';
        // Behavioral event (tracking_events)…
        trackEvent('conversion', contentId, {
          form_id: form.id || 'unknown',
          ...(value > 0 && { value: value, currency: currency })
        });
        // …and the attributable conversion row (conversion_events + Enhanced Conversions).
        recordConversion(form, contentId);
        // …and an e-commerce purchase when a monetary value is declared.
        if (value > 0) trackEcommercePurchase(contentId, value, currency);
      }
    });
  }

  // Shared core: is there a real, stored analytics-consent record?
  function hasStoredAnalyticsConsent() {
    if (consentOverride) return consentOverride.analytics === true;
    if (window.Cookiebot) return window.Cookiebot.consent?.statistics === true;
    try {
      const stored = localStorage.getItem('site_cookie_consent');
      const saved = stored ? JSON.parse(stored) : null;
      if (saved?.analytics === true && consentUnexpired(saved)) return true;
    } catch (_) { /* Storage or browser capability unavailable. */ }
    return false;
  }

  // Neither cookieless nor an operator flag substitutes for the visitor's choice.
  function hasAnalyticsConsent() {
    return hasStoredAnalyticsConsent();
  }

  // All client-side interaction tracking requires the visitor's analytics choice.
  function hasInteractionConsent() {
    return hasStoredAnalyticsConsent();
  }

  // Attach a one-shot listener that re-runs `setupFn` once analytics consent arrives.
  // Reuses the site-wide `siteConsentUpdated` event emitted by the consent banner.
  function deferUntilInteractionConsent(setupFn) {
    window.addEventListener('siteConsentUpdated', function handler(e) {
      if (e.detail?.analytics) {
        window.removeEventListener('siteConsentUpdated', handler);
        setupFn();
      }
    });
  }

  // Track scroll depth milestones (25%, 50%, 75%, 100%)
  function setupScrollTracking() {
    // Scroll tracking is gated both at setup and when each event is captured.
    if (!hasInteractionConsent()) {
      deferUntilInteractionConsent(setupScrollTracking);
      return;
    }

    const milestones = [25, 50, 75, 100];
    const reached = new Set();

    function getScrollDepth() {
      const scrolled = window.scrollY + window.innerHeight;
      const total = Math.max(document.documentElement.scrollHeight, 1);
      return Math.round((scrolled / total) * 100);
    }

    function onScroll() {
      if (!hasInteractionConsent()) return;
      const depth = getScrollDepth();
      for (const m of milestones) {
        if (depth >= m && !reached.has(m)) {
          reached.add(m);
          const siteId = SITE_ID;
          const apiKey = API_KEY || SITE_ID;
          fetch(`${API_URL}/track-event`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: siteId,
              site_id: siteId,
              session_id: SESSION_ID,
              event_type: 'heatmap',
              content_type: 'page',
              content_id: window.location.pathname,
              platform: PLATFORM,
              metadata: {
                url: window.location.href,
                device_type: getDeviceType(),
                interaction_type: 'scroll',
                scroll_depth: m,
                x_coordinate: 0,
                y_coordinate: m,
                grid_x: 0,
                grid_y: m,
                viewport_width: window.innerWidth,
                viewport_height: window.innerHeight,
              },
              timestamp: Date.now(),
            }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    }

    // Reset milestones on SPA navigation
    window.addEventListener('cortiq:pageview', () => reached.clear());

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => { onScroll(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });

    // Check on load in case the page is already scrolled
    onScroll();
  }

  // Handle SPA navigation (for frameworks like React, Vue, etc.)
  let lastPath = window.location.pathname;
  function checkPathChange() {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      trackPageView();
    }
  }

  // Monitor for route changes (works with History API)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    checkPathChange();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    checkPathChange();
  };

  window.addEventListener('popstate', checkPathChange);

  // Public API
  window.CortIQ = window.WFATracker = {
    version: CORTIQ_VERSION,
    track: trackEvent,
    trackView: trackPageView,
    trackClick: (contentId, metadata) => trackEvent('click', contentId, metadata),
    trackConversion: (contentId, metadata) => trackEvent('conversion', contentId, metadata),
    getSessionId: () => SESSION_ID,
    getVisitorId: () => VISITOR_ID,
    getVisitorProfile: () => VISITOR_PROFILE,
    identify: identifyVisitor
  };

  // Aggregate per-link counter. No identity is sent, but consent is still required
  // for this client-side interaction measurement. Query/hash are stripped.
  function linkDestination(anchor) {
    try {
      const u = new URL(anchor.href, window.location.origin);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return (u.host + u.pathname).slice(0, 200);
    } catch (_) { return ''; }
  }

  function setupAggregateLinkCounter() {
    document.addEventListener('click', function (e) {
      if (!hasInteractionConsent()) return;
      if (e.target.closest && e.target.closest('#crtq-consent-banner, #crtq-consent-settings')) return;
      const el = e.target.closest && e.target.closest('a[href], button, [role="button"]');
      if (!el) return;
      const isAnchor = el.tagName === 'A' && el.getAttribute('href');
      const label = (el.textContent || '').trim().slice(0, 200);
      const linkKind = isAnchor ? 'link' : 'button';
      const linkKey = isAnchor ? linkDestination(el) : label;
      if (!linkKey) return;

      const payload = {
        siteId: SITE_ID,
        pagePath: window.location.pathname, // no search, no hash
        linkKind: linkKind,
        linkKey: linkKey,
        linkLabel: label,
        deviceType: getDeviceType()
      };

      try {
        const apiKey = API_KEY || SITE_ID;
        fetch(API_URL + '/link-click-counter', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true // survive the navigation the click may trigger
        }).catch(function () {});
      } catch (_) { /* Storage or browser capability unavailable. */ }
    }, true); // capture phase: fire before navigation
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Consent-gated analytics features (require the visitor's analytics choice)
  // ─────────────────────────────────────────────────────────────────────────

  // 'authenticated' vs 'public' segment, based on the operator's authPath.
  function getTrafficSegment() {
    return window.location.pathname.startsWith(AUTH_PATH) ? 'authenticated' : 'public';
  }

  // Click heatmap — x/y coordinates + grid position. Behavioural: consent-gated.
  function setupClickHeatmap() {
    if (!hasInteractionConsent()) { deferUntilInteractionConsent(setupClickHeatmap); return; }
    let last = 0;
    document.addEventListener('click', function (e) {
      if (!hasInteractionConsent()) return;
      const now = Date.now();
      if (now - last < 100) return;
      last = now;
      const t = e.target;
      if (t && t.closest && t.closest('#crtq-consent-banner, #crtq-consent-settings, [data-cortiq-banner], [id*="cookie"], [id*="consent"]')) return;
      const apiKey = API_KEY || SITE_ID;
      const vw = window.innerWidth, vh = window.innerHeight;
      const x = Math.round(e.pageX), y = Math.round(e.pageY);
      try {
        fetch(API_URL + '/track-event', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: SITE_ID, site_id: SITE_ID, content_type: 'page',
            content_id: window.location.pathname, event_type: 'heatmap', platform: PLATFORM,
            session_id: SESSION_ID,
            metadata: {
              url: window.location.href, device_type: getDeviceType(),
              x_coordinate: x, y_coordinate: y, viewport_width: vw, viewport_height: vh,
              grid_x: Math.round(x / Math.max(document.documentElement.scrollWidth, vw) * 100),
              grid_y: Math.round(y / Math.max(document.documentElement.scrollHeight, vh) * 100),
              interaction_type: 'click', is_touch_device: 'ontouchstart' in window,
              user_agent: navigator.userAgent,
            },
            timestamp: Date.now(),
          }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) { /* Storage or browser capability unavailable. */ }
    }, { passive: true });
  }

  // General interaction classification (nav / button / link / element clicks).
  function setupInteractionTracking() {
    if (!hasInteractionConsent()) { deferUntilInteractionConsent(setupInteractionTracking); return; }
    let lastKey = '', lastTime = 0;
    document.addEventListener('click', function (e) {
      if (!hasInteractionConsent()) return;
      const el = e.target && e.target.closest && e.target.closest('a, button, [role="button"], nav *, [data-wfa-track], input[type="submit"], input[type="button"]');
      if (!el) return;
      const key = (el.id || el.className || el.tagName) + (el.textContent || '').trim().slice(0, 30);
      const now = Date.now();
      if (key === lastKey && now - lastTime < 500) return;
      lastKey = key; lastTime = now;
      const inNav = !!(el.closest && el.closest('nav, header, [role="navigation"], .menu, .nav, #menu, #nav, .navbar, .navigation'));
      const isBtn = el.tagName === 'BUTTON' || el.type === 'submit' || el.type === 'button';
      const type = inNav ? 'nav_navigation' : isBtn ? 'button_click' : el.tagName === 'A' ? 'link_click' : 'element_click';
      trackEvent('interaction', window.location.pathname, {
        interaction_type: type,
        element_text: (el.textContent || el.value || '').trim().slice(0, 100),
        element_id: el.id || null,
        element_class: (typeof el.className === 'string' ? el.className : '').slice(0, 100) || null,
        element_tag: el.tagName.toLowerCase(),
        href: el.href || null,
      });
    }, { passive: true });
  }

  // Form journey analytics — per-field focus time, error counts, completion vs
  // abandonment. Field values are never read here. Behavioural: consent-gated.
  function setupFormAnalytics() {
    if (!hasInteractionConsent()) { deferUntilInteractionConsent(setupFormAnalytics); return; }
    function formKey(form) {
      const s = (form.action || '') + (form.id || '') + Array.from(document.forms).indexOf(form);
      return 'form_' + Math.abs(s.split('').reduce(function (a, c) { return Math.imul(31, a) + c.charCodeAt(0) | 0; }, 0)).toString(36);
    }
    function formType(form) {
      return form.classList.contains('wpcf7-form') ? 'contact_form_7'
        : form.id && form.id.includes('gform') ? 'gravity_forms'
        : form.classList.contains('checkout') || form.classList.contains('woocommerce-checkout') ? 'woocommerce_checkout'
        : form.getAttribute('data-cortiq-form-type') || 'custom';
    }
    const sessions = new Map();
    function send(id, s, status) {
      const dur = Math.round((Date.now() - s.startTime) / 1000);
      const fields = Array.from(s.fields.entries()).map(function (e) {
        return { field_name: e[0], field_label: e[1].label, focus_time_ms: e[1].focusTotal, errors: e[1].errors };
      });
      const apiKey = API_KEY || SITE_ID;
      try {
        fetch(API_URL + '/track-event', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: SITE_ID, site_id: SITE_ID, session_id: SESSION_ID,
            event_type: 'form_session', content_type: 'form', content_id: id,
            metadata: { form_id: id, form_name: s.formName, form_type: s.formType, status: status,
              duration_seconds: dur, fields_completed: s.fields.size, total_fields: s.totalFields, field_data: fields },
            timestamp: Date.now(),
          }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) { /* Storage or browser capability unavailable. */ }
    }
    function attach(form) {
      const id = formKey(form);
      const name = form.getAttribute('data-cortiq-form-name') || form.id || (form.className || '').split(' ')[0] || 'form';
      const type = formType(form);
      const inputs = Array.from(form.elements).filter(function (el) {
        return el.name && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button';
      });
      inputs.forEach(function (input) {
        input.addEventListener('focus', function () {
          if (!sessions.has(id)) sessions.set(id, { startTime: Date.now(), formName: name, formType: type, fields: new Map(), totalFields: inputs.length });
          const sess = sessions.get(id);
          if (sess.fields.has(input.name)) { sess.fields.get(input.name).focusStart = Date.now(); }
          else {
            const label = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
            sess.fields.set(input.name, { focusStart: Date.now(), focusTotal: 0, errors: 0, label: (label ? label.textContent : input.name || '').slice(0, 60) });
          }
        });
        input.addEventListener('blur', function () {
          const sess = sessions.get(id);
          if (sess) { const f = sess.fields.get(input.name); if (f && f.focusStart) { f.focusTotal += Date.now() - f.focusStart; f.focusStart = null; } }
        });
        input.addEventListener('invalid', function () {
          const sess = sessions.get(id);
          if (sess && sess.fields.has(input.name)) sess.fields.get(input.name).errors++;
        });
      });
      form.addEventListener('submit', function () {
        const sess = sessions.get(id);
        if (sess) { send(id, sess, 'completed'); sessions.delete(id); }
      });
    }
    Array.from(document.forms || []).forEach(attach);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1) {
              const forms = n.tagName === 'FORM' ? [n] : Array.from(n.querySelectorAll('form'));
              forms.forEach(function (f) { if (!sessions.has(formKey(f))) attach(f); });
            }
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    function abandon() { sessions.forEach(function (s, id) { send(id, s, 'abandoned'); }); sessions.clear(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) abandon(); });
    window.addEventListener('pagehide', abandon);
  }

  // Conversions signalled from embedded widgets/iframes via postMessage.
  function setupPostMessageConversions() {
    if (!hasInteractionConsent()) { deferUntilInteractionConsent(setupPostMessageConversions); return; }
    window.addEventListener('message', function (e) {
      if (!hasInteractionConsent()) return;
      if (!e.data || typeof e.data !== 'object') return;
      const type = (e.data.type || e.data.event || '').replace(/^cortiq:/, '');
      const tenant = e.data.tenantId || e.data.companyId || TENANT_ID || null;
      const formIdVal = e.data.formId || e.data.form_id || null;
      if (type === 'formSubmit') trackEvent('conversion', window.location.pathname, { conversion_type: 'form_submit', ...(formIdVal && { form_id: formIdVal }), ...(tenant && { tenant_id: tenant }) });
      else if (type === 'login') trackEvent('conversion', window.location.pathname, { conversion_type: 'login', ...(tenant && { tenant_id: tenant }) });
      else if (type === 'leadCreated') trackEvent('conversion', window.location.pathname, { conversion_type: 'lead_created', ...(tenant && { tenant_id: tenant }) });
    });
  }

  // E-commerce purchase — fired from data-wfa-value conversions.
  function trackEcommercePurchase(id, value, currency) {
    try {
      fetch(API_URL + '/ecommerce-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: SITE_ID, sessionId: SESSION_ID, eventType: 'purchase',
          orderId: 'order_' + Date.now(), currency: currency || 'SEK', total: value,
          items: [{ id: id, name: id, price: value, quantity: 1 }],
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (_) { /* Storage or browser capability unavailable. */ }
  }

  // Click-based conversions (non-form elements marked data-wfa-conversion).
  // Form-submit conversions are handled in setupConversionTracking.
  function setupClickConversions() {
    if (!hasInteractionConsent()) { deferUntilInteractionConsent(setupClickConversions); return; }
    document.addEventListener('click', function (e) {
      if (!hasInteractionConsent()) return;
      const el = e.target && e.target.closest && e.target.closest('[data-wfa-conversion]');
      if (el && el.tagName !== 'FORM') {
        const contentId = el.getAttribute('data-wfa-content-id') || window.location.pathname;
        const value = parseFloat(el.getAttribute('data-wfa-value') || '0');
        const currency = el.getAttribute('data-wfa-currency') || 'SEK';
        trackEvent('conversion', contentId, { ...(value > 0 && { value: value, currency: currency }) });
        if (value > 0) trackEcommercePurchase(contentId, value, currency);
      }
    });
  }

  // Session duration on tab-hide / page-hide. Behavioural: consent-gated.
  function setupSessionEndTracking() {
    if (!hasInteractionConsent()) { deferUntilInteractionConsent(setupSessionEndTracking); return; }
    const startedAt = Date.now();
    let sent = false;
    function endSession() {
      if (sent) return;
      sent = true;
      const dur = Math.round((Date.now() - startedAt) / 1000);
      if (dur < 1) return;
      const apiKey = API_KEY || SITE_ID;
      try {
        fetch(API_URL + '/track-event', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: SITE_ID, site_id: SITE_ID, session_id: SESSION_ID,
            event_type: 'session_end', content_type: 'page', content_id: window.location.pathname,
            metadata: { duration_seconds: dur }, timestamp: Date.now(),
          }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) { /* Storage or browser capability unavailable. */ }
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) endSession(); else sent = false; });
    window.addEventListener('pagehide', endSession);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Security / bot-detection layer. Treated as strictly necessary (ePrivacy
  // Art. 5.3) — runs without analytics consent, subject to the operator's own
  // legal assessment. Sends bot signatures and coarse capability signals for a
  // single page context (SECURITY_SESSION_ID, in-memory). No cross-visit
  // identity is written to the visitor's device.
  // trackAISearch/trackAICitation below measure human AI referrals and are NOT part
  // of this layer: startAnalytics() calls them only after analytics consent.
  // ─────────────────────────────────────────────────────────────────────────

  const AI_BOT_UA = {
    GPTBot: 'openai_gptbot', 'ChatGPT-User': 'openai_chatgpt_user', 'OAI-SearchBot': 'openai_searchbot',
    ClaudeBot: 'anthropic_claudebot', 'Claude-User': 'anthropic_claude_user', 'anthropic-ai': 'anthropic_ai',
    PerplexityBot: 'perplexity_bot', 'Perplexity-User': 'perplexity_user',
    Googlebot: 'google_googlebot', GoogleOther: 'google_other', 'Google-Extended': 'google_extended',
    bingbot: 'microsoft_bingbot', BingPreview: 'microsoft_bingpreview', adidxbot: 'microsoft_adidxbot',
    FacebookBot: 'meta_facebookbot', DuckDuckBot: 'duckduckgo', YandexBot: 'yandex', Bytespider: 'bytedance',
    AhrefsBot: 'ahrefs', SemrushBot: 'semrush', HeadlessChrome: 'headless_chrome', Playwright: 'playwright',
    Puppeteer: 'puppeteer', PhantomJS: 'phantomjs', Selenium: 'selenium',
  };
  function detectKnownAgent(ua) { for (const k in AI_BOT_UA) if (ua.indexOf(k) !== -1) return AI_BOT_UA[k]; return null; }

  const AI_REFERRER = {
    'chat.openai.com': 'chatgpt', 'chatgpt.com': 'chatgpt', 'perplexity.ai': 'perplexity',
    'www.perplexity.ai': 'perplexity', 'claude.ai': 'claude', 'anthropic.com': 'claude',
    'gemini.google.com': 'gemini', 'bard.google.com': 'gemini', 'copilot.microsoft.com': 'copilot',
    'you.com': 'you', 'phind.com': 'phind',
  };
  function detectAIReferrer() {
    const ref = document.referrer;
    if (ref) { try { const h = new URL(ref).hostname.toLowerCase(); for (const k in AI_REFERRER) if (h.indexOf(k) !== -1) return AI_REFERRER[k]; } catch (_) {} }
    const src = (new URLSearchParams(window.location.search).get('utm_source') || '').toLowerCase();
    return ['chatgpt', 'perplexity', 'claude', 'gemini', 'ai'].some(function (k) { return src.indexOf(k) !== -1; }) ? 'other_ai' : null;
  }

  function getBotSignals() {
    const ua = navigator.userAgent;
    return {
      webdriver: !!navigator.webdriver,
      headless: /HeadlessChrome|HeadlessFirefox/.test(ua),
      noPlugins: navigator.plugins.length === 0,
      noChromeRuntime: !window.chrome || !window.chrome.runtime,
      noNotifications: typeof Notification === 'undefined',
      noSpeech: typeof SpeechSynthesis === 'undefined',
      singleLanguage: !navigator.languages || navigator.languages.length <= 1,
      noDeviceMemory: navigator.deviceMemory === undefined,
      lowCores: navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 2,
      zeroScreen: screen.width === 0 || screen.height === 0,
      defaultScreen: screen.width === 800 && screen.height === 600,
      noColorDepth: screen.colorDepth < 24,
    };
  }

  // Coarse agent signature for bot classification only (UA/hardware/screen/lang).
  // Not a canvas/WebGL fingerprint and not persisted — a security signal, not identity.
  function getAgentFingerprint() {
    const parts = [navigator.userAgent, navigator.hardwareConcurrency || 'n/a', navigator.platform || 'unknown',
      screen.width + 'x' + screen.height + '@' + screen.colorDepth, (navigator.languages || []).join(',') || 'none',
      navigator.plugins ? navigator.plugins.length : 'n/a', navigator.webdriver ? '1' : '0'].join('|');
    let h = 0;
    for (let i = 0; i < parts.length; i++) { h = (h << 5) - h + parts.charCodeAt(i); h = h & h; }
    return 'agfp_' + Math.abs(h).toString(36);
  }

  function trackAISearch() {
    const platform = detectAIReferrer();
    if (!platform) return false;
    const p = new URLSearchParams(window.location.search);
    try {
      fetch(API_URL + '/ai-search-tracker', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: SITE_ID, sessionId: SECURITY_SESSION_ID, userHash: SECURITY_SESSION_ID, aiPlatform: platform,
          referrer: document.referrer, userAgent: navigator.userAgent, url: window.location.href,
          pageTitle: document.title, deviceType: getDeviceType(), landedAt: new Date().toISOString(),
          utm_source: p.get('utm_source'), utm_medium: p.get('utm_medium'), utm_campaign: p.get('utm_campaign'),
          utm_term: p.get('utm_term'), utm_content: p.get('utm_content'),
        }), keepalive: true,
      }).catch(function () {});
    } catch (_) { /* Storage or browser capability unavailable. */ }
    const start = Date.now();
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      if (!hasAnalyticsConsent()) return;
      const secs = Math.round((Date.now() - start) / 1000);
      try {
        fetch(API_URL + '/ai-search-tracker', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: SITE_ID, sessionId: SECURITY_SESSION_ID, update: { sessionDuration: secs, engaged: secs > 10, bounce: secs < 10 } }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) { /* Storage or browser capability unavailable. */ }
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) finish(); });
    window.addEventListener('pagehide', finish);
    return true;
  }

  function trackAICitation() {
    const p = new URLSearchParams(window.location.search);
    const src = p.get('utm_source') || '';
    const ref = document.referrer.toLowerCase();
    if (!['chatgpt', 'perplexity', 'claude', 'gemini', 'ai'].some(function (k) { return src.includes(k) || ref.includes(k); })) return;
    const payload = JSON.stringify({ siteId: SITE_ID, url: window.location.href, referrer: document.referrer, userAgent: navigator.userAgent, sessionId: SECURITY_SESSION_ID, citationData: { url: window.location.href, utm_source: src, utm_medium: p.get('utm_medium'), utm_campaign: p.get('utm_campaign') } });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(API_URL + '/ai-bot-tracker', payload);
      else fetch(API_URL + '/ai-bot-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    } catch (_) { /* Storage or browser capability unavailable. */ }
  }

  function runBotProbe() {
    const ua = navigator.userAgent;
    const known = detectKnownAgent(ua);
    const signals = getBotSignals();
    const capScore = Object.values(signals).filter(Boolean).length;
    if (!known && capScore < 3) return; // looks like a real browser — no probe
    const fp = getAgentFingerprint();
    let depth = 1;
    try { depth = parseInt(sessionStorage.getItem('_ciq_adp') || '0') + 1; sessionStorage.setItem('_ciq_adp', depth); } catch (_) {}
    const t0 = performance.now();
    const payload = JSON.stringify({
      siteId: SITE_ID, url: window.location.href, referrer: document.referrer || null, userAgent: ua,
      sessionId: SECURITY_SESSION_ID, agentFingerprint: fp, agentType: known || 'unknown_agent', pageDepth: depth,
      probeData: { jsExecuted: true, signals: signals, capScore: capScore, isLikelyBot: true, knownAgent: known !== null, renderMs: Math.round(performance.now() - t0) },
    });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(API_URL + '/ai-bot-tracker', payload);
      else fetch(API_URL + '/ai-bot-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    } catch (_) { /* Storage or browser capability unavailable. */ }
    setTimeout(function () {
      const rms = Math.round(performance.now() - t0);
      if (rms < 200 && navigator.sendBeacon) navigator.sendBeacon(API_URL + '/ai-bot-tracker', JSON.stringify({ siteId: SITE_ID, sessionId: SECURITY_SESSION_ID, agentFingerprint: fp, update: { renderMs: rms, fastRender: true } }));
    }, 500);
  }

  function reportHoneypot(trigger) {
    try {
      const payload = JSON.stringify({ siteId: SITE_ID, url: window.location.href, referrer: document.referrer || null, userAgent: navigator.userAgent, sessionId: SECURITY_SESSION_ID, probeData: { jsExecuted: true, signals: { honeypotTriggered: true, honeypotTrigger: trigger, webdriver: navigator.webdriver === true, headless: /HeadlessChrome/.test(navigator.userAgent) } } });
      if (navigator.sendBeacon) navigator.sendBeacon(API_URL + '/ai-bot-tracker', payload);
      else fetch(API_URL + '/ai-bot-tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    } catch (_) { /* Storage or browser capability unavailable. */ }
  }

  function setupHoneypot() {
    if (!document.body || document.getElementById('_ciq_trap')) return;
    const box = document.createElement('div');
    box.id = '_ciq_trap'; box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
    const a = document.createElement('a');
    a.href = '#'; a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); a.textContent = 'Contact us';
    a.addEventListener('click', function (e) { e.preventDefault(); reportHoneypot('honeypot_click'); });
    a.addEventListener('focus', function () { reportHoneypot('honeypot_focus'); });
    box.appendChild(a); document.body.appendChild(box);
  }

  function canaryToken() {
    const ts = Math.floor(Date.now() / 1000).toString(36);
    const rnd = Math.random().toString(36).substring(2, 10);
    const raw = SITE_ID.substring(0, 8) + ':' + ts + ':' + rnd;
    return btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function setupCanary() {
    if (!document.body) return;
    const token = canaryToken();
    const img = document.createElement('img');
    img.src = API_URL + '/canary-tracker/' + token + '?v=px&s=' + encodeURIComponent(SITE_ID);
    img.width = 1; img.height = 1; img.alt = ''; img.setAttribute('aria-hidden', 'true');
    img.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
    document.body.appendChild(img);
    const a = document.createElement('a');
    a.href = API_URL + '/canary-tracker/' + token + '?v=lk&s=' + encodeURIComponent(SITE_ID);
    a.tabIndex = -1; a.setAttribute('aria-hidden', 'true');
    a.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
    a.textContent = 'Site resources';
    document.body.appendChild(a);
  }

  function startSecurityLayer() {
    if (securityStarted) return;
    if (EXCLUDE_IFRAMES && window.self !== window.top) return;
    if (EXCLUDE_PATHS.length > 0) {
      const p = window.location.pathname;
      if (EXCLUDE_PATHS.some(function (x) { return p.startsWith(x); })) return;
    }
    securityStarted = true;
    try { runBotProbe(); } catch (_) {}
    try { setupCanary(); } catch (_) {}
    try { setupHoneypot(); } catch (_) {}
  }

  // Run the analytics pipeline (visitor identification, pageview, interaction
  // tracking). Only called once analytics consent is present.
  async function startAnalytics() {
    if (analyticsStarted || !hasAnalyticsConsent()) return;
    analyticsStarted = true;
    const generation = consentGeneration;
    SESSION_ID = getOrCreateSessionId();
    // Cookieless skips visitor identification; it does not bypass consent.
    if (!COOKIELESS) {
      await identifyVisitor();
    } else {
      IDENTIFICATION_COMPLETE = true;
    }
    if (generation !== consentGeneration || !hasAnalyticsConsent()) return;
    trackPageView();
    // AI-referral measurement (a human arriving from ChatGPT/Perplexity/…) is visitor
    // analytics, not security: it only runs after consent, once per page load.
    if (!aiReferralTracked) {
      aiReferralTracked = true;
      try { trackAISearch(); } catch (_) {}
      try { trackAICitation(); } catch (_) {}
    }
    if (!listenersInstalled) {
      listenersInstalled = true;
      setupAggregateLinkCounter();
      setupClickTracking();
      setupConversionTracking();
      setupScrollTracking();
      setupClickHeatmap();
      setupInteractionTracking();
      setupFormAnalytics();
      setupPostMessageConversions();
      setupClickConversions();
      setupSessionEndTracking();
    }
  }

  function updateConsent(choice) {
    // A revocation must win over any stale stored/CMP choice, including while an
    // identification request or email hash is pending.
    consentOverride = { analytics: choice?.analytics === true, marketing: choice?.marketing === true };
    if (!consentOverride.marketing || !consentOverride.analytics) {
      try { sessionStorage.removeItem('cortiq_click_ids'); } catch (_) { /* Storage or browser capability unavailable. */ }
    }
    if (!consentOverride.analytics) {
      consentGeneration++;
      analyticsStarted = false;
      SESSION_ID = null;
      MEMORY_SESSION_ID = null;
      VISITOR_ID = null;
      VISITOR_PROFILE = null;
      IDENTIFICATION_COMPLETE = false;
      try { sessionStorage.removeItem('cortiq_session_id'); } catch (_) { /* Storage or browser capability unavailable. */ }
      return;
    }
    startAnalytics();
  }

  // Keep listening after the first grant so revocation and re-grant work too.
  async function initialize() {
    // Security / bot-detection layer runs independently of analytics consent
    // (strictly necessary), subject to the operator's own legal assessment.
    startSecurityLayer();
    window.addEventListener('siteConsentUpdated', e => updateConsent(e.detail));
    const updateCookiebot = () => updateConsent({
      analytics: window.Cookiebot?.consent?.statistics,
      marketing: window.Cookiebot?.consent?.marketing,
    });
    window.addEventListener('CookiebotOnConsentReady', updateCookiebot);
    window.addEventListener('CookiebotOnAccept', updateCookiebot);
    window.addEventListener('CookiebotOnDecline', updateCookiebot);
    if (hasAnalyticsConsent()) startAnalytics();
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
