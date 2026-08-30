/**
 * CortIQ Advanced Tracking Script
 * Unified visitor profiling with AI agent detection
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

  // Configuration
  const config = window.cortiqConfig || window.wfaConfig || {};
  const API_URL = config.apiUrl || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
  const SITE_ID = config.siteId || config.companyId;
  const API_KEY = config.apiKey;
  const CONTENT_TYPE = config.contentType || 'page';
  const PLATFORM = config.platform || 'web';
  // Cookieless / consent-exempt mode (CNIL audience-measurement exemption): no device
  // fingerprint, no cross-visit identity, no client-side storage — runs without consent.
  const COOKIELESS = config.cookieless === true;

  if (!SITE_ID) {
    console.error('CortIQ Tracking: Missing siteId in window.cortiqConfig');
    return;
  }

  // Global state
  let VISITOR_ID = null;
  let VISITOR_PROFILE = null;
  let IDENTIFICATION_COMPLETE = false;
  let MEMORY_SESSION_ID = null; // in-memory session id used in cookieless mode

  // Stable per-session identifier. Deliberately NOT a device fingerprint — a
  // random UUID persisted for the tab session. This runs before any consent, so
  // it must not fingerprint. The canvas/WebGL fingerprint is computed only later,
  // and only with explicit consent (see identifyVisitor).
  function getOrCreateSessionId() {
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
    } catch (_) {}
    let id;
    try {
      id = 'sess_' + crypto.randomUUID();
    } catch (_) {
      id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    try { sessionStorage.setItem('cortiq_session_id', id); } catch (_) {}
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

  // Check if visitor has given marketing/advertising consent
  function hasMarketingConsent() {
    try {
      const stored = localStorage.getItem('site_cookie_consent');
      if (stored && JSON.parse(stored).marketing === true) return true;
    } catch (_) {}
    try {
      if (window.Cookiebot?.consent?.marketing === true) return true;
    } catch (_) {}
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
    try { sessionStorage.setItem('cortiq_click_ids', JSON.stringify(ids)); } catch (_) {}
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

  const SESSION_ID = getOrCreateSessionId();

  // Get device type
  function getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  // Identify visitor (called once on page load)
  async function identifyVisitor() {
    try {
      const utm = getUTMParams();
      const webgl = getWebGLFingerprint();

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

    IDENTIFICATION_COMPLETE = true;
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
    try {
      // Wait for visitor identification
      await waitForIdentification();

      const storedClickIds = getStoredClickIds();
      const metadata = {
        user_agent: navigator.userAgent,
        referrer: document.referrer,
        device_type: getDeviceType(),
        url: window.location.href,
        visitor_id: VISITOR_ID,
        visitor_type: VISITOR_PROFILE?.visitorType,
        // Include click IDs in all events so conversion events carry attribution context
        ...(storedClickIds && { click_ids: storedClickIds }),
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
    // A hashed email is pseudonymous personal data — never capture it without a real
    // analytics-consent record, even in cookieless mode. (Defense-in-depth: the submit
    // listener is only attached once consent is present.)
    if (!hasInteractionConsent()) return;
    try {
      let hashedEmail = null;
      const emailInput = form.querySelector('input[type="email"], input[name*="email" i]');
      if (emailInput && emailInput.value) {
        hashedEmail = await sha256Hex(emailInput.value);
      }
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
    // Conversion capture sends a hashed email (pseudonymous personal data) — requires
    // analytics consent even in cookieless mode; not exemption-eligible.
    if (!hasInteractionConsent()) {
      deferUntilInteractionConsent(setupConversionTracking);
      return;
    }
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.hasAttribute('data-wfa-conversion')) {
        const contentId = form.getAttribute('data-wfa-content-id') || window.location.pathname;
        // Behavioral event (tracking_events)…
        trackEvent('conversion', contentId, {
          form_id: form.id || 'unknown'
        });
        // …and the attributable conversion row (conversion_events + Enhanced Conversions).
        recordConversion(form, contentId);
      }
    });
  }

  // Shared core: is there a real, stored analytics-consent record?
  function hasStoredAnalyticsConsent() {
    try {
      const stored = localStorage.getItem('site_cookie_consent');
      if (stored && JSON.parse(stored).analytics === true) return true;
    } catch (_) {}
    try {
      if (window.Cookiebot?.consent?.statistics === true) return true;
    } catch (_) {}
    return false;
  }

  // Consent for AGGREGATE audience measurement (pageview counts + referrer). Cookieless
  // mode is exemption-eligible here (ePrivacy Art. 5.3 + CNIL/EDPB audience-measurement
  // exemption: no device storage, no cross-visit profile), so it is permitted banner-free.
  function hasAnalyticsConsent() {
    if (COOKIELESS) return true;
    return hasStoredAnalyticsConsent();
  }

  // Consent for BEHAVIOURAL tracking (clicks, scroll/heatmaps, conversions). These fall
  // OUTSIDE the audience-measurement exemption, so they require a real analytics-consent
  // record even in cookieless mode — cookieless does NOT grant blanket consent to these.
  function hasInteractionConsent() {
    // An operator explicitly asserting their own lawful basis (config.requireConsent=false)
    // opts in for everything; cookieless mode ALONE does not grant this.
    if (config.requireConsent === false) return true;
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
    // Scroll depth is behavioural, session-linked data — requires analytics consent
    // (GDPR Art. 6.1.a) even in cookieless mode; it is not exemption-eligible.
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
    track: trackEvent,
    trackView: trackPageView,
    trackClick: (contentId, metadata) => trackEvent('click', contentId, metadata),
    trackConversion: (contentId, metadata) => trackEvent('conversion', contentId, metadata),
    getSessionId: () => SESSION_ID,
    getVisitorId: () => VISITOR_ID,
    getVisitorProfile: () => VISITOR_PROFILE,
    identify: identifyVisitor
  };

  // Anonymous aggregate per-link counter. Runs under analytics consent (unconditional in
  // cookieless) — deliberately NOT behind hasInteractionConsent(). Sends no session id,
  // no visitor id, no coordinates: only page path + link + device, so it stays within the
  // audience-measurement exemption. Query/hash are stripped before sending.
  function linkDestination(anchor) {
    try {
      const u = new URL(anchor.href, window.location.origin);
      return (u.host + u.pathname).slice(0, 200);
    } catch (_) { return ''; }
  }

  function setupAggregateLinkCounter() {
    document.addEventListener('click', function (e) {
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
        fetch(API_URL + '/link-click-counter', {
          method: 'POST',
          headers: API_KEY
            ? { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true // survive the navigation the click may trigger
        }).catch(function () {});
      } catch (_) {}
    }, true); // capture phase: fire before navigation
  }

  // Run the analytics pipeline (visitor identification, pageview, interaction
  // tracking). Only called once analytics consent is present.
  async function startAnalytics() {
    // Cookieless mode skips visitor identification entirely — no device fingerprint and
    // no cross-visit profile, which is exactly what keeps it consent-exempt.
    if (!COOKIELESS) {
      await identifyVisitor();
    }
    trackPageView();
    setupAggregateLinkCounter(); // anonymous per-link tallies — runs in cookieless too
    setupClickTracking();
    setupConversionTracking();
    setupScrollTracking();
  }

  // Initialize. GDPR: visitor identification + pageview tracking require analytics
  // consent, so nothing runs until it's granted. Operators with a lawful basis for
  // consent-free first-party analytics can opt out with config.requireConsent=false.
  async function initialize() {
    const consentNotRequired = config.requireConsent === false;
    if (consentNotRequired || hasAnalyticsConsent()) {
      startAnalytics();
      return;
    }
    // Defer until the visitor grants analytics consent.
    window.addEventListener('siteConsentUpdated', function handler(e) {
      if (e.detail?.analytics) {
        window.removeEventListener('siteConsentUpdated', handler);
        startAnalytics();
      }
    });
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
