// Technical GEO checks ported from the GEO audit toolkit (fetch_page.py and the
// geo-crawlers / geo-llmstxt / geo-technical skills), limited to what runs on raw
// HTML and HTTP headers inside an Edge Function (no headless browser).

// The 14 AI crawlers the toolkit checks. Each entry is the robots.txt product token.
export const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot',
  'CCBot', 'Bytespider', 'cohere-ai', 'Google-Extended', 'GoogleOther', 'Applebot-Extended',
  'FacebookBot', 'Amazonbot',
] as const;

// Crawlers that feed AI search answers and citations; blocking these costs visibility.
export const CITATION_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'GPTBot', 'Google-Extended'];

export type CrawlerAccess = 'allowed' | 'blocked';

// robots.txt per RFC 9309: consecutive User-agent lines form one group; a crawler
// obeys the group whose user-agent matches its token (case-insensitive), else '*'.
// Only the site root matters for "can this bot read the site": blocked when the
// group disallows '/' without allowing it back. Disallowing individual paths
// (/admin, /dashboard) is normal and still counts as allowed.
export function parseRobots(robotsTxt: string): Record<string, CrawlerAccess> {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], allow: [], disallow: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === 'allow') current.allow.push(value);
      if (key === 'disallow') current.disallow.push(value);
    }
  }
  const verdict = (g: (typeof groups)[number] | undefined): CrawlerAccess => {
    if (!g) return 'allowed';
    return g.disallow.includes('/') && !g.allow.includes('/') ? 'blocked' : 'allowed';
  };
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const result: Record<string, CrawlerAccess> = {};
  for (const bot of AI_CRAWLERS) {
    const specific = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    result[bot] = verdict(specific ?? wildcard);
  }
  return result;
}

export interface LlmsTxtCheck {
  present: boolean;
  hasTitle: boolean;      // starts with "# Name"
  hasSummary: boolean;    // a "> summary" blockquote
  sections: number;       // "## " headings
  links: number;          // markdown links
  fullPresent: boolean;   // /llms-full.txt
  issues: string[];
}

// Structure from the llms.txt proposal (llmstxt.org): H1 name, blockquote summary,
// H2 sections of markdown link lists.
export function checkLlmsTxt(body: string | null, fullPresent: boolean): LlmsTxtCheck {
  if (body === null) {
    return { present: false, hasTitle: false, hasSummary: false, sections: 0, links: 0, fullPresent, issues: ['No /llms.txt'] };
  }
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasTitle = /^#\s+\S/.test(lines[0] ?? '');
  const hasSummary = lines.some((l) => l.startsWith('>'));
  const sections = lines.filter((l) => /^##\s+\S/.test(l)).length;
  const links = (body.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
  const issues: string[] = [];
  if (!hasTitle) issues.push('First line is not a "# Site name" heading');
  if (!hasSummary) issues.push('No "> summary" line describing the site');
  if (sections === 0) issues.push('No "## " sections');
  if (links === 0) issues.push('No markdown links to key pages');
  return { present: true, hasTitle, hasSummary, sections, links, fullPresent, issues };
}

export interface RenderingCheck {
  textWords: number;
  emptyAppShell: boolean;   // e.g. <div id="root"></div> with little text around it
  framework: string | null;
  verdict: 'server-rendered' | 'partly' | 'javascript-only';
}

// AI crawlers mostly do not run JavaScript, so content that only appears after
// hydration is invisible to them. Heuristic on the raw HTML only.
export function checkRendering(html: string): RenderingCheck {
  const text = html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const textWords = text ? text.split(' ').length : 0;
  const framework =
    /__NEXT_DATA__|id=["']__next["']/i.test(html) ? 'Next.js' :
    /id=["']__nuxt["']|window\.__NUXT__/i.test(html) ? 'Nuxt' :
    /ng-version=/i.test(html) ? 'Angular' :
    /data-reactroot|id=["']root["']/i.test(html) ? 'React' :
    /id=["']app["']/i.test(html) ? 'Vue or other SPA' : null;
  const emptyAppShell = /<div[^>]+id=["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);
  const verdict = emptyAppShell && textWords < 100 ? 'javascript-only' : textWords < 150 ? 'partly' : 'server-rendered';
  return { textWords, emptyAppShell, framework, verdict };
}

export interface SecurityHeaders {
  hsts: boolean;
  csp: boolean;
  contentTypeOptions: boolean;
  frameProtection: boolean;
  referrerPolicy: boolean;
}

export function checkSecurityHeaders(headers: Headers): SecurityHeaders {
  const csp = headers.get('content-security-policy') ?? '';
  return {
    hsts: headers.has('strict-transport-security'),
    csp: csp.length > 0,
    contentTypeOptions: (headers.get('x-content-type-options') ?? '').toLowerCase() === 'nosniff',
    frameProtection: headers.has('x-frame-options') || /frame-ancestors/i.test(csp),
    referrerPolicy: headers.has('referrer-policy'),
  };
}
