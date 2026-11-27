/**
 * Agent ontology — the master for bot categories and visitor types.
 *
 * Who or what generates web traffic, as a class hierarchy. Everything that stores a bot class or
 * a visitor type takes its values from here:
 *   - bot_catalog rows and its category CHECK      (generated: scripts/gen-ontology-sql.mjs)
 *   - unified_visitors / cloudflare_traffic CHECKs (generated, from VISITOR_TYPES)
 *   - cloudflare-ingest visitor classification     (classifyAgent / visitorTypeFor)
 *   - src/ontology/agents.ts                       (dashboard + public ontology)
 *
 * AI bots come from AI_BOT_REGISTRY (never list them here); non-AI bots live in OTHER_BOTS.
 * After a change run `node scripts/gen-ontology-sql.mjs` — the build fails until the generated
 * migration matches (tests/foundation/ontology-sql.test.mjs).
 *
 *   web_agent
 *   ├── human_visitor
 *   └── automated_agent
 *       ├── ai_agent
 *       │   ├── training_crawler   (registry category training)
 *       │   ├── agentic_agent      (registry category agentic)
 *       │   └── citation_crawler   (registry category citation)
 *       ├── search_crawler
 *       ├── seo_tool
 *       ├── archive_crawler
 *       ├── monitoring
 *       └── generic_bot
 */
import { AI_BOT_REGISTRY, GENERIC_BOT_PATTERN, type BotCategory, type BotSignature } from './ai-bot-registry.ts';

export interface AgentClass {
  id: string;
  label: string;
  description: string;
  parent?: string;
}

const cls = (id: string, label: string, description: string, parent?: string): AgentClass =>
  ({ id, label, description, ...(parent ? { parent } : {}) });

export const AGENT_CLASSES: Readonly<Record<string, AgentClass>> = Object.fromEntries([
  cls('web_agent', 'Web Agent', 'Any entity that generates an HTTP request to a tracked site.'),
  cls('human_visitor', 'Human Visitor', 'A person browsing with a regular browser.', 'web_agent'),
  cls('automated_agent', 'Automated Agent', 'Software that requests pages without a human driving each request.', 'web_agent'),
  cls('ai_agent', 'AI Agent', 'Crawlers and fetchers operated by AI vendors, classified into training, agentic and citation.', 'automated_agent'),
  cls('training_crawler', 'Training Crawlers', 'Crawl content to build or refresh model corpora. Infrastructure cost, no referral value.', 'ai_agent'),
  cls('agentic_agent', 'Agentic Fetches', 'An AI assistant fetching a page on behalf of a real user. Real intent — treat like a visitor.', 'ai_agent'),
  cls('citation_crawler', 'Citation & Search Crawlers', 'Index content for AI-powered and traditional search answers. Visibility signal.', 'ai_agent'),
  cls('search_crawler', 'Search Crawlers', 'Search engine spiders and preview fetchers outside the AI registry.', 'automated_agent'),
  cls('seo_tool', 'SEO Tools', 'Commercial SEO crawlers building backlink and keyword indexes.', 'automated_agent'),
  cls('archive_crawler', 'Archive Crawlers', 'Web archives taking snapshots of pages.', 'automated_agent'),
  cls('monitoring', 'Monitoring', 'Uptime, performance and health checks.', 'automated_agent'),
  cls('generic_bot', 'Generic Bots', 'HTTP libraries, scripts and unnamed crawlers.', 'automated_agent'),
].map((c) => [c.id, c]));

/** Registry category → ontology class. */
export const CATEGORY_CLASS: Readonly<Record<BotCategory, string>> = {
  training: 'training_crawler',
  agentic: 'agentic_agent',
  citation: 'citation_crawler',
};

/** Leaf classes under automated_agent: the allowed values of bot_catalog.category. */
export const BOT_CLASSES: readonly string[] = Object.values(AGENT_CLASSES)
  .filter((c) => isA(c.id, 'automated_agent') && !Object.values(AGENT_CLASSES).some((o) => o.parent === c.id))
  .map((c) => c.id);

export function ancestors(id: string): string[] {
  const out: string[] = [];
  for (let c = AGENT_CLASSES[id]; c?.parent; c = AGENT_CLASSES[c.parent]) out.push(c.parent);
  return out;
}

export function isA(id: string, ancestor: string): boolean {
  return id === ancestor || ancestors(id).includes(ancestor);
}

/** Registry `type` → vendor display name. */
export const BOT_VENDORS: Readonly<Record<string, string>> = {
  chatgpt: 'OpenAI',
  claude: 'Anthropic',
  perplexity: 'Perplexity',
  gemini: 'Google',
  bingbot: 'Microsoft',
  meta: 'Meta',
  apple: 'Apple',
  amazon: 'Amazon',
  mistral: 'Mistral AI',
  kimi: 'Moonshot AI',
  elevenlabs: 'ElevenLabs',
  sbintuitions: 'SB Intuitions',
  youdotcom: 'You.com',
  duckduckgo: 'DuckDuckGo',
  exa: 'Exa',
  naget: 'Naget',
  grok: 'xAI',
  bytedance: 'ByteDance',
  commoncrawl: 'Common Crawl',
  diffbot: 'Diffbot',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  ai2: 'Allen Institute for AI',
  qwen: 'Alibaba',
  zhipu: 'Zhipu AI',
  tencent: 'Tencent',
  '01ai': '01.AI',
  reflection: 'Reflection AI',
  cotoyogi: 'ROIS',
  nict: 'NICT',
  timpi: 'Timpi',
  velen: 'Velen',
  imagesift: 'ImageSift',
  webzio: 'Webz.io',
};

export const vendorOf = (sig: BotSignature): string => BOT_VENDORS[sig.type] ?? sig.type;

/** One bot_catalog row. `uaPatterns` are case-insensitive substrings of the User-Agent. */
export interface CatalogBot {
  slug: string;
  name: string;
  category: string;
  uaPatterns: string[];
  vendor: string | null;
  description: string;
}

const bot = (slug: string, name: string, category: string, uaPatterns: string[], vendor: string | null, description: string): CatalogBot =>
  ({ slug, name, category, uaPatterns, vendor, description });

/** Named non-AI bots. Matched after the AI registry, in this order. */
export const OTHER_BOTS: readonly CatalogBot[] = [
  bot('google-inspectiontool', 'Google-InspectionTool', 'search_crawler', ['Google-InspectionTool'], 'Google', 'Search Console URL inspection and rich result tests.'),
  bot('adidxbot', 'AdIdxBot', 'search_crawler', ['adidxbot'], 'Microsoft', 'Bing Ads crawler checking ad landing pages.'),
  bot('microsoft-preview', 'MicrosoftPreview', 'search_crawler', ['MicrosoftPreview'], 'Microsoft', 'Page snapshots for Microsoft products (Teams and Outlook link previews).'),
  bot('bing-video-preview', 'BingVideoPreview', 'search_crawler', ['BingVideoPreview'], 'Microsoft', 'Video previews for Bing search results.'),
  bot('duckduckbot', 'DuckDuckBot', 'search_crawler', ['DuckDuckBot'], 'DuckDuckGo', 'DuckDuckGo search crawler.'),
  bot('yandexbot', 'YandexBot', 'search_crawler', ['YandexBot'], 'Yandex', 'Yandex search crawler.'),
  bot('baiduspider', 'Baiduspider', 'search_crawler', ['Baiduspider'], 'Baidu', 'Baidu search crawler.'),
  bot('sogou', 'Sogou', 'search_crawler', ['Sogou'], 'Sogou', 'Sogou search crawler.'),
  bot('seznambot', 'SeznamBot', 'search_crawler', ['SeznamBot'], 'Seznam', 'Seznam search crawler.'),
  bot('exabot', 'Exabot', 'search_crawler', ['Exabot'], 'Exalead', 'Exalead search crawler.'),
  bot('ahrefsbot', 'AhrefsBot', 'seo_tool', ['AhrefsBot'], 'Ahrefs', 'Ahrefs backlink crawler.'),
  bot('semrushbot', 'SemrushBot', 'seo_tool', ['SemrushBot'], 'Semrush', 'Semrush SEO crawler.'),
  bot('mj12bot', 'MJ12bot', 'seo_tool', ['MJ12bot'], 'Majestic', 'Majestic backlink crawler.'),
  bot('dotbot', 'DotBot', 'seo_tool', ['DotBot'], 'Moz', 'Moz link index crawler.'),
  bot('dataforseobot', 'DataForSeoBot', 'seo_tool', ['DataForSeoBot'], 'DataForSEO', 'DataForSEO backlink crawler.'),
  bot('ia-archiver', 'Internet Archive', 'archive_crawler', ['ia_archiver', 'archive.org_bot'], 'Internet Archive', 'Wayback Machine snapshots.'),
  bot('cortiq-uptime', 'CortIQ-Uptime', 'monitoring', ['CortIQ-Uptime'], 'CortIQ', 'CortIQ uptime and snippet check.'),
  bot('uptimerobot', 'UptimeRobot', 'monitoring', ['UptimeRobot'], 'UptimeRobot', 'Uptime monitoring.'),
  bot('pingdom', 'Pingdom', 'monitoring', ['Pingdom'], 'SolarWinds', 'Uptime and performance monitoring.'),
  bot('gtmetrix', 'GTmetrix', 'monitoring', ['GTmetrix'], 'GTmetrix', 'Page speed testing.'),
  bot('statuscake', 'StatusCake', 'monitoring', ['StatusCake'], 'StatusCake', 'Uptime monitoring.'),
  bot('site24x7', 'Site24x7', 'monitoring', ['Site24x7'], 'Zoho', 'Uptime monitoring.'),
  bot('uptime-com', 'Uptime.com', 'monitoring', ['Uptime.com'], 'Uptime.com', 'Uptime monitoring.'),
  bot('newrelic', 'New Relic', 'monitoring', ['NewRelic'], 'New Relic', 'Synthetic monitoring.'),
  bot('datadog', 'Datadog', 'monitoring', ['Datadog'], 'Datadog', 'Synthetic monitoring.'),
  bot('python-http', 'Python HTTP client', 'generic_bot', ['python-requests', 'Python-urllib', 'python/', 'aiohttp'], null, 'Scripted access from Python.'),
  bot('scrapy', 'Scrapy', 'generic_bot', ['Scrapy'], null, 'Scrapy scraping framework.'),
  bot('curl-wget', 'curl / wget', 'generic_bot', ['curl/', 'libcurl', 'Wget'], null, 'Command-line HTTP clients.'),
  bot('node-http', 'Node.js HTTP client', 'generic_bot', ['axios/', 'node-fetch', 'undici', 'node/'], null, 'Scripted access from Node.js.'),
  bot('go-http-client', 'Go HTTP client', 'generic_bot', ['Go-http-client'], null, 'Scripted access from Go.'),
  bot('java-http', 'Java HTTP client', 'generic_bot', ['Java/', 'okhttp/', 'Apache-HttpClient'], null, 'Scripted access from Java or Android.'),
  bot('php-http', 'PHP HTTP client', 'generic_bot', ['PHP/', 'GuzzleHttp'], null, 'Scripted access from PHP.'),
  bot('ruby-http', 'Ruby HTTP client', 'generic_bot', ['Ruby/'], null, 'Scripted access from Ruby.'),
  bot('httpie', 'HTTPie', 'generic_bot', ['HTTPie'], null, 'HTTPie command-line client.'),
];

/** bot_catalog slug for a registry name, e.g. "ChatGPT-User" → "chatgpt-user". */
export const catalogSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Registry regexes are alternations of literals; each literal is one LIKE substring. */
export const uaSubstrings = (pattern: RegExp): string[] => pattern.source.split('|');

/** Registry bots come first in botCatalog(); this many rows. */
export const AI_BOT_REGISTRY_SIZE = AI_BOT_REGISTRY.length;

/** The full bot catalog in match order: the AI registry (most-specific-first), then OTHER_BOTS. */
export function botCatalog(): CatalogBot[] {
  const ai = AI_BOT_REGISTRY.map((sig) => bot(
    catalogSlug(sig.name), sig.name, CATEGORY_CLASS[sig.category], uaSubstrings(sig.pattern), vendorOf(sig),
    `${vendorOf(sig)} — ${AGENT_CLASSES[CATEGORY_CLASS[sig.category]].label.toLowerCase()}.`,
  ));
  return [...ai, ...OTHER_BOTS];
}

/**
 * Stored visitor_type values per table, each mapped to the ontology classes it covers. A class
 * belongs to the value listing it or its nearest ancestor. Changing a list changes the CHECK.
 */
export const VISITOR_TYPES = {
  unified_visitors: {
    human: ['human_visitor'],
    ai_agent: ['ai_agent'],
    bot: ['automated_agent'],
    unknown: ['web_agent'],
  },
  cloudflare_traffic: {
    human: ['human_visitor'],
    ai_bot: ['ai_agent'],
    search_crawler: ['search_crawler', 'seo_tool', 'archive_crawler'],
    monitoring: ['monitoring'],
    scraper: ['generic_bot'],
    unknown: ['web_agent'],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type VisitorTypeTable = keyof typeof VISITOR_TYPES;
export type VisitorType<T extends VisitorTypeTable> = keyof (typeof VISITOR_TYPES)[T] & string;

/** The visitor_type value a class is stored as in `table`. */
export function visitorTypeFor<T extends VisitorTypeTable>(table: T, classId: string): VisitorType<T> {
  const map = VISITOR_TYPES[table] as Record<string, readonly string[]>;
  for (const id of [classId, ...ancestors(classId)]) {
    const hit = Object.keys(map).find((v) => map[v].includes(id));
    if (hit) return hit as VisitorType<T>;
  }
  throw new Error(`${table}: no visitor_type for ${classId}`);
}

export interface AgentClassification {
  classId: string;
  /** Registry name, OTHER_BOTS name, 'Generic bot', or null for humans and unknowns. */
  botName: string | null;
}

/** Classify a User-Agent into an ontology class, in bot_catalog match order. */
export function classifyAgent(ua: string | null): AgentClassification {
  if (!ua) return { classId: 'web_agent', botName: null };
  const lower = ua.toLowerCase();
  const hit = botCatalog().find((b) => b.uaPatterns.some((p) => lower.includes(p.toLowerCase())));
  if (hit) return { classId: hit.category, botName: hit.name };
  if (GENERIC_BOT_PATTERN.test(ua)) return { classId: 'generic_bot', botName: 'Generic bot' };
  if (/Mozilla\/5\.0/i.test(ua) && /Chrome|Firefox|Safari|Edge|Opera/i.test(ua)) return { classId: 'human_visitor', botName: null };
  return { classId: 'web_agent', botName: null };
}
