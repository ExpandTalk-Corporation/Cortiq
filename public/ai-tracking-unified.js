/**
 * Legacy AI bot tracking script (bot/security layer only).
 *
 * Reports suspected bots and AI crawlers that execute JavaScript to ai-bot-tracker.
 * It sends nothing for normal human visitors, writes nothing to the visitor's device
 * (no cookies, no local/sessionStorage) and does no fingerprinting.
 *
 * Human AI-referral measurement (visitors arriving from ChatGPT, Perplexity, …) is
 * visitor analytics and requires analytics consent. It lives in the main tracker
 * (spa-tracking.js / cortiq.js / WordPress plugin), which also includes this bot
 * layer — new installs should use that instead of this file.
 */

(function() {
  'use strict';

  const scriptTag = document.currentScript || document.querySelector('script[data-site-id]');
  const siteId = scriptTag?.getAttribute('data-site-id') || window.HEATMAP_SITE_ID;
  const supabaseUrl = scriptTag?.getAttribute('data-supabase-url') || window.HEATMAP_SUPABASE_URL || 'https://cxmkdtgfocgbfizawlwa.supabase.co';

  if (!siteId) {
    console.warn('AI Tracking: Missing site ID');
    return;
  }

  const startTime = performance.now();
  // Per page load, in memory only — never persisted.
  const pageContextId = 'page_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);

  function detectBotSignals() {
    const signals = {};
    signals.webdriver = navigator.webdriver === true;
    signals.headless = !window.chrome ||
      navigator.plugins.length === 0 ||
      /HeadlessChrome/.test(navigator.userAgent);
    signals.automationControlled = navigator.webdriver ||
      window.document.documentElement.getAttribute('webdriver') === 'true';
    signals.missingChromeProperties = !window.chrome?.runtime;
    signals.missingWindowProperties = !window.opener && !window.parent;
    signals.permissionsBlocked = !navigator.permissions;
    signals.touchSupport = 'ontouchstart' in window;
    return signals;
  }

  function trackAIBot() {
    const executionTime = Math.round(performance.now() - startTime);
    const signals = detectBotSignals();

    const botScore = Object.values(signals).filter(v => v === true).length;
    const isLikelyBot = botScore >= 2 || /bot|crawler|spider|GPTBot|ClaudeBot|PerplexityBot|GoogleOther|ChatGPT-User|Claude-User|Perplexity-User/i.test(navigator.userAgent);
    if (!isLikelyBot) return;

    const data = {
      siteId,
      url: window.location.href,
      referrer: document.referrer || null,
      userAgent: navigator.userAgent,
      sessionId: pageContextId,
      probeData: {
        jsExecuted: true,
        executionTime,
        signals,
        botScore,
        isLikelyBot,
      }
    };

    navigator.sendBeacon(`${supabaseUrl}/functions/v1/ai-bot-tracker`, JSON.stringify(data));
  }

  if (document.readyState === 'complete') {
    trackAIBot();
  } else {
    window.addEventListener('load', trackAIBot);
  }

})();
