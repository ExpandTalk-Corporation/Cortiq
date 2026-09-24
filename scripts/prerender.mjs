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
    description: 'Analytics for the Agentic Web: classify AI training crawlers, agent fetches and citation crawlers. Consent-first, cookieless visitor analytics, heatmaps, form analytics. EU-hosted. Free during beta.',
    canonical: 'https://cortiq.se/',
  },
  '/features': {
    title: 'Features — CortIQ Analytics Platform',
    description: 'Full feature overview: AI bot classification, server-side bot ingestion, click and scroll heatmaps, form analytics, conversion attribution, an MCP server and a built-in consent banner (CMP).',
    canonical: 'https://cortiq.se/features',
  },
  '/features/ai': {
    title: 'AI Agent Analytics — CortIQ',
    description: 'Classify AI traffic into training crawlers, agentic fetches and citation crawlers — GPTBot, ClaudeBot, ChatGPT-User, PerplexityBot and more. JS tag and server-side log ingestion.',
    canonical: 'https://cortiq.se/features/ai',
  },
  '/features/analytics': {
    title: 'Web Analytics — CortIQ',
    description: 'Consent-first web analytics: cookieless mode, click and scroll heatmaps, form analytics, link click counts and conversion attribution. EU-hosted and built for GDPR.',
    canonical: 'https://cortiq.se/features/analytics',
  },
  '/features/cyber': {
    title: 'Cyber Security & Bot Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
    canonical: 'https://cortiq.se/features/cyber',
  },
  '/bot-intelligence': {
    title: 'AI Bot Intelligence — CortIQ',
    description: 'Not all AI traffic is equal. CortIQ classifies training crawlers, agentic fetches, and citation crawlers — so you know which bots are valuable and which are just infrastructure cost.',
    canonical: 'https://cortiq.se/bot-intelligence',
  },
  '/cmp': {
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'Built-in consent banner with Google Consent Mode v2. Visitor analytics and GA4 start only after analytics consent, valid for 12 months. EU-hosted, privacy by design.',
    canonical: 'https://cortiq.se/cmp',
  },
  '/pricing': {
    title: 'Pricing — CortIQ Analytics',
    description: 'CortIQ is free during beta: AI agent analytics, cookie-free tracking and a built-in consent banner. Create a free account, or contact us about Enterprise.',
    canonical: 'https://cortiq.se/pricing',
  },
  '/api': {
    title: 'API Documentation — CortIQ',
    description: 'CortIQ read-only REST API: sessions, page views, referrers, AI agent sessions, conversions and heatmaps as JSON or CSV. OpenAPI spec, API key authentication.',
    canonical: 'https://cortiq.se/api',
  },
  '/privacy': {
    title: 'Privacy Policy — CortIQ',
    description: 'CortIQ privacy policy: what is processed without consent (security and bot detection), what requires analytics or marketing consent, EU data storage, retention periods and your rights.',
    canonical: 'https://cortiq.se/privacy',
  },
  '/contact': {
    title: 'Contact — CortIQ',
    description: 'Get in touch with the CortIQ team. CortIQ is free during beta — ask about AI agent tracking, cookie-free analytics or Enterprise onboarding.',
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
