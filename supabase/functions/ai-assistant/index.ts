import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// Types
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ClaudeResponse {
  content: ContentBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface ToolInput {
  since?: string;
  until?: string;
  limit?: number;
  url?: string;
  url_prefix?: string;
  device_type?: string;
}

// ============================================================================
// Tool Definitions (Claude API format — input_schema not inputSchema)
// ============================================================================

const TOOLS = [
  {
    name: 'cortiq_sessions_summary',
    description: 'Headline stats: total sessions, unique visitors, average session duration (seconds), total pageviews, overall bounce rate. The first tool to call for any period comparison.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO date (default: 7 days ago)' },
        until: { type: 'string', description: 'ISO date (default: today)' },
      },
    },
  },
  {
    name: 'cortiq_daily_visitors',
    description: 'Unique visitor count per day. Use for trend lines and day-over-day comparison.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_bounce_rate',
    description: 'Site-wide bounce rate: total_sessions, bounces, bounce_rate_pct.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_top_pages',
    description: 'Most viewed URLs with pageview count and unique session count. Use url_prefix to scope to a section.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default: 15)' },
        url_prefix: { type: 'string', description: 'Filter to URLs starting with this prefix' },
      },
    },
  },
  {
    name: 'cortiq_top_sources',
    description: 'Top traffic referrers — where visitors come from. Includes direct, search, social, and AI platforms.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default: 15)' },
      },
    },
  },
  {
    name: 'cortiq_top_entry_pages',
    description: 'Landing pages with per-page session count and bounce rate. Find which entry points lose visitors immediately.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default: 15)' },
      },
    },
  },
  {
    name: 'cortiq_top_exit_pages',
    description: 'Pages where sessions ended. High exit rates on non-terminal pages signal content or UX problems.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
    },
  },
  {
    name: 'cortiq_pageviews_by_device',
    description: 'Pageviews and unique visitors grouped by device type (mobile, tablet, desktop) with percentage breakdown.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_avg_engagement_time',
    description: 'Per-URL engagement: average time on page (ms) and average scroll depth (0–100%). Sorted by traffic volume.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max URLs (default: 15)' },
        url_prefix: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_top_rage_clicks',
    description: 'Elements receiving rage-click incidents (3+ rapid clicks). Identifies UX friction.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
    },
  },
  {
    name: 'cortiq_web_vitals',
    description: 'Core Web Vitals per URL: LCP average and p75, CLS average. Good LCP < 2500ms, good CLS < 0.1.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max URLs (default: 15)' },
      },
    },
  },
  {
    name: 'cortiq_form_analytics',
    description: 'Form performance: starts, completions, abandonment rate, average completion time.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max forms (default: 10)' },
      },
    },
  },
  {
    name: 'cortiq_ai_agent_traffic',
    description: 'UNIQUE TO CORTIQ — Traffic from AI agents: ChatGPT Browser, Perplexity, Claude, Gemini, Copilot. Sessions per AI platform.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max platforms (default: 20)' },
      },
    },
  },
  {
    name: 'cortiq_ai_bot_analysis',
    description: 'UNIQUE TO CORTIQ — Bot intelligence: detects crawlers and automation tools. Returns bot name, type, JS capability, threat level.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max bot types (default: 20)' },
      },
    },
  },
  {
    name: 'cortiq_ai_agent_journey',
    description: 'UNIQUE TO CORTIQ — Top pages visited by AI agents. Shows what content AI agents consume most. Crucial for GEO strategy.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max pages (default: 15)' },
      },
    },
  },
  {
    name: 'cortiq_ai_vs_human',
    description: 'UNIQUE TO CORTIQ — Side-by-side comparison of AI agent traffic vs human visitors: sessions, duration, bounce rate, pages/session.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },
];

// ============================================================================
// Helpers
// ============================================================================

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function defaultUntilExclusive(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function parseWindow(input: ToolInput): { since: string; until: string } {
  return {
    since: input.since ?? defaultSince(),
    until: input.until ?? defaultUntilExclusive(),
  };
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
}

// ============================================================================
// Tool Implementations (reused from mcp-server)
// ============================================================================

async function executeTool(
  toolName: string,
  input: ToolInput,
  siteId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<unknown> {
  const { since, until } = parseWindow(input);
  const limit = input.limit ?? 15;

  switch (toolName) {
    case 'cortiq_sessions_summary': {
      const [sessRes, pvRes] = await Promise.all([
        supabase.from('tracking_sessions').select('session_id, duration_seconds, page_views').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000),
        supabase.from('page_views').select('id', { count: 'exact', head: true }).eq('site_id', siteId).gte('viewed_at', since).lt('viewed_at', until),
      ]);
      const sessions = sessRes.data ?? [];
      const total = sessions.length;
      const bounces = sessions.filter((s: Record<string, number>) => (s.page_views ?? 1) <= 1).length;
      const avgDur = avg(sessions.map((s: Record<string, number>) => s.duration_seconds ?? 0));
      return { total_sessions: total, unique_visitors: total, total_pageviews: pvRes.count ?? 0, avg_session_duration_seconds: Math.round(avgDur), bounce_rate_pct: pct(bounces, total), window: { since, until } };
    }

    case 'cortiq_daily_visitors': {
      const { data } = await supabase.from('tracking_sessions').select('session_id, started_at').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000);
      const byDay = new Map<string, number>();
      for (const s of data ?? []) {
        const day = String(s.started_at).substring(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
      return { daily_visitors: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, sessions: count })), window: { since, until } };
    }

    case 'cortiq_bounce_rate': {
      const { data } = await supabase.from('tracking_sessions').select('page_views').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000);
      const sessions = data ?? [];
      const total = sessions.length;
      const bounces = sessions.filter((s: Record<string, number>) => (s.page_views ?? 1) <= 1).length;
      return { total_sessions: total, bounces, bounce_rate_pct: pct(bounces, total), window: { since, until } };
    }

    case 'cortiq_top_pages': {
      // Aggregated in SQL (assistant_top_pages) — page_views is the highest-volume table.
      const { data } = await supabase.rpc('assistant_top_pages', {
        p_site_id: siteId, p_since: since, p_until: until, p_limit: limit, p_url_prefix: input.url_prefix ?? null,
      });
      return { pages: data ?? [], window: { since, until } };
    }

    case 'cortiq_top_sources': {
      const { data } = await supabase.from('page_views').select('referrer, session_id').eq('site_id', siteId).gte('viewed_at', since).lt('viewed_at', until).limit(100000);
      const srcMap = new Map<string, { pv: number; visitors: Set<string> }>();
      for (const pv of data ?? []) {
        let src = '(direct)';
        try { if (pv.referrer) src = new URL(String(pv.referrer)).hostname || '(direct)'; } catch {}
        const e = srcMap.get(src) ?? { pv: 0, visitors: new Set() };
        e.pv++;
        if (pv.session_id) e.visitors.add(String(pv.session_id));
        srcMap.set(src, e);
      }
      return { sources: [...srcMap.entries()].sort((a, b) => b[1].pv - a[1].pv).slice(0, limit).map(([source, v]) => ({ source, pageviews: v.pv, unique_visitors: v.visitors.size })), window: { since, until } };
    }

    case 'cortiq_top_entry_pages': {
      const { data } = await supabase.from('tracking_sessions').select('session_id, page_views').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000);
      const sessionIds = (data ?? []).map((s: Record<string, string>) => s.session_id).filter(Boolean);
      const pvData = sessionIds.length > 0
        ? (await supabase.from('page_views').select('url, session_id, viewed_at').in('session_id', sessionIds.slice(0, 500)).eq('site_id', siteId).limit(10000)).data ?? []
        : [];
      const firstPage = new Map<string, string>();
      for (const pv of pvData.sort((a: Record<string, string>, b: Record<string, string>) => String(a.viewed_at).localeCompare(String(b.viewed_at)))) {
        if (!firstPage.has(String(pv.session_id))) firstPage.set(String(pv.session_id), String(pv.url));
      }
      const sessionPV = new Map<string, number>();
      for (const s of data ?? []) sessionPV.set(String(s.session_id), Number(s.page_views) ?? 1);
      const entryMap = new Map<string, { sessions: number; bounces: number }>();
      for (const [sid, url] of firstPage) {
        const e = entryMap.get(url) ?? { sessions: 0, bounces: 0 };
        e.sessions++;
        if ((sessionPV.get(sid) ?? 1) <= 1) e.bounces++;
        entryMap.set(url, e);
      }
      return { entry_pages: [...entryMap.entries()].sort((a, b) => b[1].sessions - a[1].sessions).slice(0, limit).map(([url, v]) => ({ url, sessions: v.sessions, bounce_rate_pct: pct(v.bounces, v.sessions) })), window: { since, until } };
    }

    case 'cortiq_top_exit_pages': {
      const { data } = await supabase.rpc('assistant_top_exit_pages', {
        p_site_id: siteId, p_since: since, p_until: until, p_limit: limit,
      });
      return { exit_pages: data ?? [], window: { since, until } };
    }

    case 'cortiq_pageviews_by_device': {
      const { data } = await supabase.from('tracking_sessions').select('device_type, session_id').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000);
      const devMap = new Map<string, number>();
      for (const s of data ?? []) devMap.set(String(s.device_type || 'unknown'), (devMap.get(String(s.device_type || 'unknown')) ?? 0) + 1);
      const total = [...devMap.values()].reduce((s, v) => s + v, 0);
      return { by_device: [...devMap.entries()].sort((a, b) => b[1] - a[1]).map(([device_type, sessions]) => ({ device_type, sessions, pct_of_total: pct(sessions, total) })), window: { since, until } };
    }

    case 'cortiq_avg_engagement_time': {
      const { data } = await supabase.rpc('assistant_avg_engagement', {
        p_site_id: siteId, p_since: since, p_until: until, p_limit: limit, p_url_prefix: input.url_prefix ?? null,
      });
      return { engagement: data ?? [], window: { since, until } };
    }

    case 'cortiq_top_rage_clicks': {
      const { data } = await supabase.from('behavioral_incidents').select('url, element_tag, element_id, element_class, incident_count, visitor_count').eq('site_id', siteId).eq('incident_type', 'rage_click').gte('created_at', since).lt('created_at', until).order('incident_count', { ascending: false }).limit(limit);
      return { rage_clicks: data ?? [], window: { since, until } };
    }

    case 'cortiq_web_vitals': {
      // Fixed: vitals live in web_vitals (page_views has no lcp/cls). Aggregated in SQL.
      const { data } = await supabase.rpc('assistant_web_vitals', {
        p_site_id: siteId, p_since: since, p_until: until, p_limit: limit,
      });
      return { vitals: data ?? [], window: { since, until } };
    }

    case 'cortiq_form_analytics': {
      const { data } = await supabase.from('form_sessions').select('form_id, form_type, completed_at, completion_time').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000);
      const formMap = new Map<string, { type: string; starts: number; completions: number; times: number[] }>();
      for (const s of data ?? []) {
        const key = String(s.form_id || 'unknown');
        const e = formMap.get(key) ?? { type: String(s.form_type || key), starts: 0, completions: 0, times: [] };
        e.starts++;
        if (s.completed_at) { e.completions++; if (s.completion_time) e.times.push(Number(s.completion_time)); }
        formMap.set(key, e);
      }
      return { forms: [...formMap.entries()].sort((a, b) => b[1].starts - a[1].starts).slice(0, limit).map(([form_id, v]) => ({ form_id, form_type: v.type, starts: v.starts, completions: v.completions, abandonment_rate_pct: pct(v.starts - v.completions, v.starts) })), window: { since, until } };
    }

    case 'cortiq_ai_agent_traffic': {
      const { data } = await supabase.from('ai_search_traffic').select('ai_platform, session_id').eq('site_id', siteId).gte('created_at', since).lt('created_at', until).limit(100000);
      const platMap = new Map<string, number>();
      for (const s of data ?? []) platMap.set(String(s.ai_platform || 'unknown'), (platMap.get(String(s.ai_platform || 'unknown')) ?? 0) + 1);
      return { ai_traffic: [...platMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([ai_platform, sessions]) => ({ ai_platform, sessions })), window: { since, until } };
    }

    case 'cortiq_ai_bot_analysis': {
      const { data } = await supabase.from('ai_bot_traffic').select('bot_name, bot_type, request_type, js_executed, probe_triggered').eq('site_id', siteId).gte('created_at', since).lt('created_at', until).limit(100000);
      // request_type = authoritative 3-way classification (training|agentic|citation, fallback 'unknown').
      // The legacy bot_category column is dead data (always 'other') — do not read it.
      const botMap = new Map<string, { type: string; category: string; requests: number; js_exec: number; probes: number }>();
      for (const b of data ?? []) {
        const key = String(b.bot_name || 'unknown');
        const e = botMap.get(key) ?? { type: String(b.bot_type || 'unknown'), category: String(b.request_type || 'unknown'), requests: 0, js_exec: 0, probes: 0 };
        e.requests++;
        if (b.js_executed) e.js_exec++;
        if (b.probe_triggered) e.probes++;
        botMap.set(key, e);
      }
      return { bots: [...botMap.entries()].sort((a, b) => b[1].requests - a[1].requests).slice(0, limit).map(([bot_name, v]) => ({ bot_name, bot_type: v.type, category: v.category, requests: v.requests, js_capable_pct: pct(v.js_exec, v.requests), probe_rate_pct: pct(v.probes, v.requests) })), window: { since, until } };
    }

    case 'cortiq_ai_agent_journey': {
      const { data, error } = await supabase.from('ai_agent_journey_steps').select('url, ai_platform, time_on_page_ms').eq('site_id', siteId).gte('created_at', since).lt('created_at', until).limit(100000);
      if (error) {
        const { data: fallback } = await supabase.from('ai_agent_sessions').select('pages_viewed, conversion_page, ai_platform').eq('site_id', siteId).gte('created_at', since).lt('created_at', until).limit(1000);
        return { ai_journey: fallback ?? [], note: 'Session-level data only', window: { since, until } };
      }
      const urlMap = new Map<string, { visits: number; platforms: Set<string>; times: number[] }>();
      for (const step of data ?? []) {
        const e = urlMap.get(String(step.url)) ?? { visits: 0, platforms: new Set(), times: [] };
        e.visits++;
        if (step.ai_platform) e.platforms.add(String(step.ai_platform));
        if (step.time_on_page_ms) e.times.push(Number(step.time_on_page_ms));
        urlMap.set(String(step.url), e);
      }
      return { ai_journey: [...urlMap.entries()].sort((a, b) => b[1].visits - a[1].visits).slice(0, limit).map(([url, v]) => ({ url, ai_visits: v.visits, ai_platforms: [...v.platforms], avg_time_on_page_ms: v.times.length > 0 ? Math.round(avg(v.times)) : null })), window: { since, until } };
    }

    case 'cortiq_ai_vs_human': {
      const [aiRes, sessRes] = await Promise.all([
        supabase.from('ai_search_traffic').select('session_id').eq('site_id', siteId).gte('created_at', since).lt('created_at', until).limit(100000),
        supabase.from('tracking_sessions').select('duration_seconds, page_views').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000),
      ]);
      const all = sessRes.data ?? [];
      const humAvgDur = Math.round(avg(all.map((r: Record<string, number>) => r.duration_seconds ?? 0)));
      const humBounces = all.filter((r: Record<string, number>) => (r.page_views ?? 1) <= 1).length;
      return { comparison: { ai_agents: { sessions: (aiRes.data ?? []).length }, all_visitors: { sessions: all.length, avg_duration_seconds: humAvgDur, bounce_rate_pct: pct(humBounces, all.length) } }, window: { since, until } };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// Claude API
// ============================================================================

async function callClaude(
  messages: Message[],
  anthropicKey: string,
  model: string,
): Promise<ClaudeResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      // cache_control on the system block caches the stable tools+system prefix
      // (Anthropic caches in tools → system order), cutting input cost/latency on the
      // multi-turn tool loop where that prefix is resent every iteration.
      system: [
        {
          type: 'text',
          text: `You are an analytics assistant for CortIQ, an AI-native web analytics platform.
You have access to real-time data about the user's website. Always fetch data before answering questions about metrics.
Be concise and data-driven. Format numbers clearly (e.g., 1,247 sessions, 34.2% bounce rate).
When presenting findings, highlight what's notable or unexpected.
Today's date context: use the last 7 days as default window unless asked otherwise.`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
      tools: TOOLS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  return res.json() as Promise<ClaudeResponse>;
}

async function runConversation(
  messages: Message[],
  anthropicKey: string,
  model: string,
  siteId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ response: string; toolsUsed: string[]; inputTokens: number; outputTokens: number }> {
  const toolsUsed: string[] = [];
  const MAX_ITERATIONS = 5;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const claudeRes = await callClaude(messages, anthropicKey, model);
    inputTokens += claudeRes.usage?.input_tokens ?? 0;
    outputTokens += claudeRes.usage?.output_tokens ?? 0;

    const toolBlocks = claudeRes.content.filter(b => b.type === 'tool_use');

    // Truncated by the token ceiling — return what we have with a clear marker rather
    // than looping or silently dropping the tail.
    if (claudeRes.stop_reason === 'max_tokens') {
      const text = claudeRes.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
      return {
        response: (text ? text + '\n\n' : '') + '_(Response truncated — ask me to continue or narrow the question.)_',
        toolsUsed, inputTokens, outputTokens,
      };
    }

    if (toolBlocks.length === 0 || claudeRes.stop_reason === 'end_turn') {
      const text = claudeRes.content
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join('');
      return { response: text, toolsUsed, inputTokens, outputTokens };
    }

    // Add assistant message with tool use blocks
    messages.push({ role: 'assistant', content: claudeRes.content });

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolBlocks.map(async (block) => {
        toolsUsed.push(block.name ?? '');
        try {
          const result = await executeTool(
            block.name ?? '',
            (block.input ?? {}) as ToolInput,
            siteId,
            supabase,
          );
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id ?? '',
            content: JSON.stringify(result),
          };
        } catch (err) {
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id ?? '',
            is_error: true,
            content: err instanceof Error ? err.message : 'Tool execution failed',
          };
        }
      }),
    );

    messages.push({ role: 'user', content: toolResults });
  }

  return { response: 'Too many tool calls. Please try a more specific question.', toolsUsed, inputTokens, outputTokens };
}

// ============================================================================
// Entry Point
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Authenticate user via their Supabase session token
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Parse request body
    const { message, siteId, history = [] } = await req.json() as {
      message: string;
      siteId: string;
      history: Message[];
    };

    if (!message || !siteId) {
      return new Response(JSON.stringify({ error: 'message and siteId are required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Verify user has access to this site (RLS enforced by userClient)
    const { data: site } = await userClient
      .from('sites')
      .select('id, company_id')
      .eq('id', siteId)
      .maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found or access denied' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Get Anthropic API key via service role (not exposed to user client)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: secret } = await serviceClient
      .from('company_secrets')
      .select('anthropic_api_key, ai_model')
      .eq('company_id', site.company_id)
      .maybeSingle();

    if (!secret?.anthropic_api_key) {
      return new Response(
        JSON.stringify({ error: 'No Anthropic API key configured. Add it in Settings → Integrations.' }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Per-user rate limit (distinct from the monthly cost cap): blunt runaway usage /
    // accidental loops. 30 assistant turns per user per hour.
    const { data: underRate, error: rateErr } = await serviceClient.rpc('check_rate_limit', {
      p_key: `ai-assistant:${user.id}`,
      p_max_count: 30,
      p_window_sec: 3600,
    });
    if (!rateErr && underRate === false) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait a bit before asking again.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Enforce the company's monthly cost cap before spending on paid calls.
    const { data: underBudget } = await serviceClient.rpc('check_ai_budget', { p_company_id: site.company_id });
    if (underBudget === false) {
      return new Response(
        JSON.stringify({ error: 'Monthly AI budget reached for this account. Raise the cap in Settings or try again next month.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Build conversation and run
    const messages: Message[] = [
      ...history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message },
    ];

    const model = secret.ai_model ?? 'claude-sonnet-5';
    const { response, toolsUsed, inputTokens, outputTokens } = await runConversation(
      messages,
      secret.anthropic_api_key,
      model,
      siteId,
      serviceClient,
    );

    if (inputTokens || outputTokens) {
      await serviceClient.rpc('record_ai_usage', {
        p_company_id: site.company_id,
        p_site_id: siteId,
        p_function: 'ai-assistant',
        p_model: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      });
    }

    return new Response(
      JSON.stringify({ response, toolsUsed }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );

  } catch (err) {
    console.error('AI assistant error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
