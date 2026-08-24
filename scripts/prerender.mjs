/**
 * Static pre-render script.
 * Run after `vite build` and `vite build --ssr`.
 * Generates dist/[route]/index.html for each marketing page.
 */

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

// Polyfill browser globals required by next-themes and other browser-first packages
const noop = () => {};
const noopStorage = {
  getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null,
};
globalThis.localStorage = noopStorage;
globalThis.sessionStorage = noopStorage;
globalThis.window = globalThis;
globalThis.document = {
  documentElement: { classList: { add: noop, remove: noop, contains: () => false }, getAttribute: () => null },
  addEventListener: noop,
  removeEventListener: noop,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolve = (p) => path.resolve(__dirname, '..', p);

// SEO data — must match src/seo-config.ts
const SEO = {
  '/': {
    title: 'CortIQ — AI Agent Analytics & Cookie-Free Tracking',
    description: 'First-to-market analytics for the Agentic Web. Track ChatGPT Browser, Perplexity & Claude Browser. Cookie-free, GDPR-compliant. Heatmaps, A/B testing, form analytics.',
    canonical: 'https://cortiq.se/',
  },
  '/features': {
    title: 'Features — CortIQ Analytics Platform',
    description: 'Full feature overview: AI agent tracking, click heatmaps, A/B testing, form analytics, session recording, data warehouse export and GDPR-compliant CMP. All in one platform.',
    canonical: 'https://cortiq.se/features',
  },
  '/features/ai': {
    title: 'AI Agent Analytics — CortIQ',
    description: 'Track and analyse traffic from ChatGPT Browser, Perplexity Comet, Claude Browser and other AI agents. Journey funnels, conversion attribution, citation tracking. First on the market.',
    canonical: 'https://cortiq.se/features/ai',
  },
  '/features/analytics': {
    title: 'Web Analytics — CortIQ',
    description: 'Cookie-free server-side analytics, click heatmaps, form analytics, session recording and A/B testing — all GDPR-compliant and without a cookie banner.',
    canonical: 'https://cortiq.se/features/analytics',
  },
  '/features/cyber': {
    title: 'Cyber Security & Bot Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
    canonical: 'https://cortiq.se/features/cyber',
  },
  '/bot-intelligence': {
    title: 'Bot Intelligence — CortIQ',
    description: 'Understand which bots visit your site, what they do, and how they affect your analytics. Training crawlers, citation bots and agentic browsers — all classified and tracked.',
    canonical: 'https://cortiq.se/bot-intelligence',
  },
  '/cmp': {
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'GDPR-compliant cookie consent with smart nudging to increase opt-in rates. Google Consent Mode v2 built in. No cookie banner required for server-side analytics.',
    canonical: 'https://cortiq.se/cmp',
  },
  '/pricing': {
    title: 'Pricing — CortIQ Analytics',
    description: 'Simple, transparent pricing for AI agent analytics, cookie-free tracking and GDPR CMP. Invite-only beta — request access today.',
    canonical: 'https://cortiq.se/pricing',
  },
  '/api': {
    title: 'API Documentation — CortIQ',
    description: 'CortIQ REST API reference. Track events, query analytics, heatmaps, A/B tests and more. OpenAPI-compatible with API key authentication.',
    canonical: 'https://cortiq.se/api',
  },
  '/privacy': {
    title: 'Privacy Policy — CortIQ',
    description: 'CortIQ privacy policy. GDPR-compliant data handling, EU data storage, data retention details and your rights as a data subject.',
    canonical: 'https://cortiq.se/privacy',
  },
  '/contact': {
    title: 'Contact — CortIQ',
    description: 'Get in touch with the CortIQ team. Request an invitation to our analytics platform or ask about AI agent tracking and cookie-free analytics.',
    canonical: 'https://cortiq.se/contact',
  },
};

// Import server bundle built by `vite build --ssr`
const serverBundle = resolve('dist/server/entry-server.js');
if (!fs.existsSync(serverBundle)) {
  console.error('Server bundle not found. Run `vite build --ssr src/entry-server.tsx --outDir dist/server` first.');
  process.exit(1);
}

const { render } = await import(pathToFileURL(serverBundle).href);

// HTML template from the normal client build
const template = fs.readFileSync(resolve('dist/index.html'), 'utf-8');

function injectSEO(html, { title, description, canonical }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${esc(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1${esc(canonical)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/i, `$1${esc(title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${esc(canonical)}$2`);
}

let rendered = 0;
let errors = 0;

for (const [url, seo] of Object.entries(SEO)) {
  try {
    const appHtml = render(url);
    let html = template.replace('<!--app-html-->', appHtml);
    html = injectSEO(html, seo);

    const outPath = url === '/'
      ? resolve('dist/index.html')
      : resolve(`dist${url}/index.html`);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`  ✓ ${url}`);
    rendered++;
  } catch (err) {
    console.error(`  ✗ ${url}: ${err.message}`);
    errors++;
  }
}

console.log(`\nPre-rendered ${rendered} pages${errors ? `, ${errors} errors` : ''}.`);
// Rendering the marketing pages leaves open handles (polyfilled browser globals,
// next-themes, react-query) that keep Node alive, so exit explicitly instead of
// waiting for a natural exit that never comes.
process.exit(errors > 0 ? 1 : 0);
