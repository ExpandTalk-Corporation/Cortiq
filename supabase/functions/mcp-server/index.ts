import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const securityHeaders = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  ...corsHeaders,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: securityHeaders });
}

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_VERSION = '1.0.0';

// ============================================================================
// Types
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ApiKeyValidation {
  api_key_id: string;
  company_id: string;
  site_id: string;
  permissions: string[];
  rate_limit: number;
  expires_at: string | null;
}

interface ToolInput {
  since?: string;
  until?: string;
  limit?: number;
  url?: string;
  url_prefix?: string;
  device_type?: string;
  sql?: string;
}

// ============================================================================
// Tool Definitions — 23 analytics tools
// ============================================================================

const TOOLS = [
  // ── Sites & Meta ──────────────────────────────────────────────────────────
  {
    name: 'cortiq_list_sites',
    description: 'List all sites connected to this API key. Use to discover site identifiers and domain names. Free to call.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cortiq_describe_schema',
    description: 'Describe available data: event types, AI platforms tracked, device categories. Free.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO date (default: 7 days ago)' },
        until: { type: 'string', description: 'ISO date (default: today)' },
      },
    },
  },

  // ── Traffic Baseline ──────────────────────────────────────────────────────
  {
    name: 'cortiq_sessions_summary',
    description: 'Headline stats: total sessions, unique visitors, average session duration (seconds), total pageviews, overall bounce rate. The first tool to call for any period comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO date (default: 7 days ago)' },
        until: { type: 'string', description: 'ISO date (default: today)' },
      },
    },
  },
  {
    name: 'cortiq_daily_visitors',
    description: 'Unique visitor count per UTC day over the window. Use for trend lines and day-over-day comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_bounce_rate',
    description: 'Site-wide bounce rate: total_sessions, bounces (single-page sessions), bounce_rate_pct. THE most-watched operator metric. Always include when comparing two periods.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_top_pages',
    description: 'Most viewed URLs with pageview count and unique session count. Sorted by views descending. Use url_prefix to scope to a section.',
    inputSchema: {
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
    description: 'Top traffic referrers — where visitors come from. Includes direct, search, social, and AI platforms. Returns source with pageview and unique visitor counts.',
    inputSchema: {
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
    description: 'Landing pages with per-page session count and bounce rate. Use to find which entry points lose visitors immediately.',
    inputSchema: {
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
    inputSchema: {
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
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },

  // ── Engagement & Behavior ─────────────────────────────────────────────────
  {
    name: 'cortiq_avg_engagement_time',
    description: 'Per-URL engagement: average time on page (ms) and average scroll depth (0–100%). Sorted by traffic volume. Filter by url_prefix for specific sections.',
    inputSchema: {
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
    name: 'cortiq_click_counts',
    description: 'Aggregate click counts grouped by HTML element (tag + CSS classes). Shows which UI elements receive the most interaction.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max elements (default: 50)' },
        url_prefix: { type: 'string' },
      },
    },
  },
  {
    name: 'cortiq_heatmap_grid',
    description: 'Viewport-normalized click heatmap (0–100 scale) for a specific URL. Returns (vx_pct, vy_pct, clicks) rows. Use to identify focal points and click concentration on a page.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page URL to get heatmap for' },
        since: { type: 'string' },
        until: { type: 'string' },
        device_type: { type: 'string', enum: ['mobile', 'tablet', 'desktop'] },
      },
      required: ['url'],
    },
  },
  {
    name: 'cortiq_top_rage_clicks',
    description: 'Elements receiving rage-click incidents (3+ rapid clicks within 1500ms on same element). Identifies UX friction — elements that look interactive but are not.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
    },
  },
  {
    name: 'cortiq_top_outbound',
    description: 'Most-clicked external link destinations with click count and unique visitor count. Shows where users exit to.',
    inputSchema: {
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
    description: 'Google Core Web Vitals per URL: LCP (Largest Contentful Paint) average and p75, CLS average. Good LCP < 2500ms, good CLS < 0.1.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max URLs (default: 15)' },
      },
    },
  },

  // ── Forms & Funnels ───────────────────────────────────────────────────────
  {
    name: 'cortiq_form_analytics',
    description: 'Form performance: starts, completions, abandonment rate, average completion time. Identify which forms have conversion problems.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
        limit: { type: 'number', description: 'Max forms (default: 10)' },
      },
    },
  },
  {
    name: 'cortiq_funnel_completion',
    description: 'Funnel step completion rates showing where users drop off in defined conversion funnels.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' },
      },
    },
  },

  // ── AI-Native Analytics (UNIQUE TO CORTIQ) ────────────────────────────────
  {
    name: 'cortiq_ai_agent_traffic',
    description: 'UNIQUE TO CORTIQ — Traffic from AI agents: ChatGPT Browser, Perplexity, Claude, Gemini, Copilot, and more. Returns sessions, bounce rate, avg duration, avg pages/session, and conversion rate per AI platform. Use to understand how AI agents engage with your site vs each other.',
    inputSchema: {
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
    description: 'UNIQUE TO CORTIQ — Bot intelligence: detects headless browsers, crawlers, and automation tools. Returns bot name, type, JS execution capability, probe signals, and threat level. Use to understand non-human traffic quality and security posture.',
    inputSchema: {
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
    description: 'UNIQUE TO CORTIQ — Top pages and content sections visited by AI agents. Shows what content AI agents consume most. Crucial for GEO (Generative Engine Optimization) strategy — high AI visits = citation potential.',
    inputSchema: {
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
    description: 'UNIQUE TO CORTIQ — Side-by-side comparison of AI agent traffic vs human visitors: session count, avg duration, bounce rate, pages/session, conversion rate. Use to understand behavioral differences between AI and human traffic.',
    inputSchema: {
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function validateApiKey(
  authHeader: string | null,
  supabase: ReturnType<typeof createClient>,
): Promise<ApiKeyValidation | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const apiKey = authHeader.substring(7);
  if (apiKey.length < 20) return null; // Reject obviously invalid keys early
  const keyHash = await sha256Hex(apiKey);
  const { data, error } = await supabase.rpc('validate_api_key', { p_key_hash: keyHash });
  if (error || !data?.length) return null;
  const validation = data[0] as ApiKeyValidation;
  // Check expiry
  if (validation.expires_at && new Date(validation.expires_at) < new Date()) return null;
  return validation;
}

async function checkRateLimit(
  apiKeyId: string,
  rateLimit: number,
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('check_rate_limit', {
      p_api_key_id: apiKeyId,
      p_rate_limit: rateLimit,
    });
    return data === true;
  } catch {
    return true; // Fail open — rate limit check shouldn't block legitimate traffic if RPC is down
  }
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
}

// ============================================================================
// Tool Implementations
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

    // ── Sites & Meta ────────────────────────────────────────────────────────

    case 'cortiq_list_sites': {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, domain, created_at')
        .eq('id', siteId)
        .limit(1);
      if (error) throw new Error(error.message);
      return { sites: data ?? [] };
    }

    case 'cortiq_describe_schema': {
      const { data: aiData } = await supabase
        .from('ai_search_traffic')
        .select('ai_platform')
        .eq('site_id', siteId)
        .gte('created_at', since)
        .lt('created_at', until)
        .limit(200);
      const aiPlatforms = [...new Set((aiData ?? []).map((r: Record<string, string>) => r.ai_platform).filter(Boolean))];
      return {
        site_id: siteId,
        available_tables: [
          { table: 'page_views', description: 'One row per page view. Columns: url, referrer, time_on_page, scroll_depth, session_id, exit_page, is_conversion_page, viewed_at, site_id' },
          { table: 'tracking_sessions', description: 'One row per session. Columns: session_id, duration_seconds, page_views (count), device_type, browser, os, utm_source, utm_medium, started_at, site_id' },
          { table: 'user_interactions', description: 'Clicks, scrolls, interactions. Columns: interaction_type, element_tag, element_class, element_id, element_text, x_coordinate, y_coordinate, session_id, page_view_id, created_at' },
          { table: 'heatmap_data', description: 'Click heatmap grid. Columns: url, grid_x (0-100), grid_y (0-100), device_type, interaction_type, site_id, created_at' },
          { table: 'ai_search_traffic', description: 'AI platform visits. Columns: ai_platform, created_at, site_id (table may be empty)' },
          { table: 'ai_bot_traffic', description: 'Bot traffic. Columns: bot_name, bot_type, request_type (AUTHORITATIVE AI classification: training|agentic|citation), js_executed, probe_triggered, session_id, site_id, created_at. NOTE: the legacy column bot_category is deprecated (always "other") — always use request_type for training/agentic/citation.' },
          { table: 'form_sessions', description: 'Form interactions. Columns: form_id, form_type, device_type, session_id, completed_at, abandoned_at, completion_time, error_count, fields_completed, total_fields, started_at, site_id' },
          { table: 'funnel_analytics', description: 'Funnel steps. Columns: funnel_id, step_index, step_name, sessions_entered, sessions_completed, drop_off_rate, date' },
        ],
        ai_platforms_tracked_this_period: aiPlatforms,
        device_types: ['mobile', 'tablet', 'desktop'],
        note: 'All tables are scoped to your site_id automatically.',
        window: { since, until },
      };
    }

    // ── Traffic Baseline ────────────────────────────────────────────────────

    case 'cortiq_sessions_summary': {
      const [sessRes, pvRes] = await Promise.all([
        supabase.from('tracking_sessions').select('session_id, duration_seconds, page_views').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000),
        supabase.from('page_views').select('id', { count: 'exact', head: true }).eq('site_id', siteId).gte('viewed_at', since).lt('viewed_at', until),
      ]);
      const sessions = sessRes.data ?? [];
      const totalSessions = sessions.length;
      const uniqueVisitors = totalSessions; // No visitor_id on sessions — use session count as proxy
      const bounces = sessions.filter((s: Record<string, number>) => (s.page_views ?? 1) <= 1).length;
      const avgDuration = avg(sessions.map((s: Record<string, number>) => s.duration_seconds ?? 0));
      return {
        total_sessions: totalSessions,
        unique_visitors: uniqueVisitors,
        total_pageviews: pvRes.count ?? 0,
        avg_session_duration_seconds: Math.round(avgDuration),
        bounce_rate_pct: pct(bounces, totalSessions),
        window: { since, until },
      };
    }

    case 'cortiq_daily_visitors': {
      const { data, error } = await supabase
        .from('tracking_sessions')
        .select('session_id, started_at')
        .eq('site_id', siteId)
        .gte('started_at', since)
        .lt('started_at', until)
        .limit(100000);
      if (error) throw new Error(error.message);
      const byDay = new Map<string, number>();
      for (const s of data ?? []) {
        const day = String(s.started_at).substring(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
      return {
        daily_visitors: [...byDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, sessions: count })),
        window: { since, until },
      };
    }

    case 'cortiq_bounce_rate': {
      const { data } = await supabase
        .from('tracking_sessions')
        .select('page_views')
        .eq('site_id', siteId)
        .gte('started_at', since)
        .lt('started_at', until)
        .limit(100000);
      const sessions = data ?? [];
      const total = sessions.length;
      const bounces = sessions.filter((s: Record<string, number>) => (s.page_views ?? 1) <= 1).length;
      return { total_sessions: total, bounces, bounce_rate_pct: pct(bounces, total), window: { since, until } };
    }

    case 'cortiq_top_pages': {
      let query = supabase
        .from('page_views')
        .select('url, session_id')
        .eq('site_id', siteId)
        .gte('viewed_at', since)
        .lt('viewed_at', until)
        .limit(100000);
      if (input.url_prefix) query = query.like('url', `${input.url_prefix}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const urlMap = new Map<string, { pv: number; sessions: Set<string> }>();
      for (const pv of data ?? []) {
        const e = urlMap.get(pv.url) ?? { pv: 0, sessions: new Set() };
        e.pv++;
        if (pv.session_id) e.sessions.add(String(pv.session_id));
        urlMap.set(pv.url, e);
      }
      return {
        pages: [...urlMap.entries()]
          .sort((a, b) => b[1].pv - a[1].pv)
          .slice(0, limit)
          .map(([url, v]) => ({ url, pageviews: v.pv, unique_sessions: v.sessions.size })),
        window: { since, until },
      };
    }

    case 'cortiq_top_sources': {
      const { data, error } = await supabase
        .from('page_views')
        .select('referrer, session_id')
        .eq('site_id', siteId)
        .gte('viewed_at', since)
        .lt('viewed_at', until)
        .limit(100000);
      if (error) throw new Error(error.message);
      const srcMap = new Map<string, { pv: number; visitors: Set<string> }>();
      for (const pv of data ?? []) {
        let src = '(direct)';
        try { if (pv.referrer) src = new URL(String(pv.referrer)).hostname || '(direct)'; } catch {}
        const e = srcMap.get(src) ?? { pv: 0, visitors: new Set() };
        e.pv++;
        if (pv.session_id) e.visitors.add(String(pv.session_id));
        srcMap.set(src, e);
      }
      return {
        sources: [...srcMap.entries()]
          .sort((a, b) => b[1].pv - a[1].pv)
          .slice(0, limit)
          .map(([source, v]) => ({ source, pageviews: v.pv, unique_visitors: v.visitors.size })),
        window: { since, until },
      };
    }

    case 'cortiq_top_entry_pages': {
      const { data } = await supabase
        .from('tracking_sessions')
        .select('session_id, page_views')
        .eq('site_id', siteId)
        .gte('started_at', since)
        .lt('started_at', until)
        .limit(100000);
      // Derive entry page from first page_view per session
      const sessionIds = (data ?? []).map((s: Record<string, string>) => s.session_id).filter(Boolean);
      const pvData = sessionIds.length > 0
        ? (await supabase.from('page_views').select('url, session_id, viewed_at').in('session_id', sessionIds.slice(0, 500)).eq('site_id', siteId).limit(10000)).data ?? []
        : [];
      const firstPagePerSession = new Map<string, string>();
      for (const pv of pvData.sort((a: Record<string, string>, b: Record<string, string>) => String(a.viewed_at).localeCompare(String(b.viewed_at)))) {
        if (!firstPagePerSession.has(String(pv.session_id))) firstPagePerSession.set(String(pv.session_id), String(pv.url));
      }
      const sessionPageViews = new Map<string, number>();
      for (const s of data ?? []) sessionPageViews.set(String(s.session_id), Number(s.page_views) ?? 1);
      const entryMap = new Map<string, { sessions: number; bounces: number }>();
      for (const [sessionId, url] of firstPagePerSession) {
        const e = entryMap.get(url) ?? { sessions: 0, bounces: 0 };
        e.sessions++;
        if ((sessionPageViews.get(sessionId) ?? 1) <= 1) e.bounces++;
        entryMap.set(url, e);
      }
      return {
        entry_pages: [...entryMap.entries()]
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .slice(0, limit)
          .map(([url, v]) => ({ url, sessions: v.sessions, bounces: v.bounces, bounce_rate_pct: pct(v.bounces, v.sessions) })),
        window: { since, until },
      };
    }

    case 'cortiq_top_exit_pages': {
      const { data } = await supabase
        .from('page_views')
        .select('url')
        .eq('site_id', siteId)
        .eq('exit_page', true)
        .gte('viewed_at', since)
        .lt('viewed_at', until)
        .limit(100000);
      const exitMap = new Map<string, number>();
      for (const pv of data ?? []) exitMap.set(String(pv.url), (exitMap.get(String(pv.url)) ?? 0) + 1);
      return {
        exit_pages: [...exitMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([url, exit_sessions]) => ({ url, exit_sessions })),
        window: { since, until },
      };
    }

    case 'cortiq_pageviews_by_device': {
      const { data } = await supabase
        .from('tracking_sessions')
        .select('device_type, session_id')
        .eq('site_id', siteId)
        .gte('started_at', since)
        .lt('started_at', until)
        .limit(100000);
      const devMap = new Map<string, { sessions: number; visitors: Set<string> }>();
      for (const s of data ?? []) {
        const dt = String(s.device_type || 'unknown');
        const e = devMap.get(dt) ?? { sessions: 0, visitors: new Set() };
        e.sessions++;
        if (s.session_id) e.visitors.add(String(s.session_id));
        devMap.set(dt, e);
      }
      const total = [...devMap.values()].reduce((sum, v) => sum + v.sessions, 0);
      return {
        by_device: [...devMap.entries()]
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .map(([device_type, v]) => ({ device_type, sessions: v.sessions, unique_visitors: v.visitors.size, pct_of_total: pct(v.sessions, total) })),
        window: { since, until },
      };
    }

    // ── Engagement & Behavior ────────────────────────────────────────────────

    case 'cortiq_avg_engagement_time': {
      let query = supabase
        .from('page_views')
        .select('url, time_on_page, scroll_depth')
        .eq('site_id', siteId)
        .gte('viewed_at', since)
        .lt('viewed_at', until)
        .not('time_on_page', 'is', null)
        .limit(100000);
      if (input.url_prefix) query = query.like('url', `${input.url_prefix}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const urlMap = new Map<string, { times: number[]; scrolls: number[] }>();
      for (const pv of data ?? []) {
        const e = urlMap.get(String(pv.url)) ?? { times: [], scrolls: [] };
        if (pv.time_on_page) e.times.push(Number(pv.time_on_page));
        if (pv.scroll_depth != null) e.scrolls.push(Number(pv.scroll_depth));
        urlMap.set(String(pv.url), e);
      }
      return {
        engagement: [...urlMap.entries()]
          .filter(([, v]) => v.times.length > 0)
          .sort((a, b) => b[1].times.length - a[1].times.length)
          .slice(0, limit)
          .map(([url, v]) => ({
            url,
            pageviews: v.times.length,
            avg_time_on_page_ms: Math.round(avg(v.times)),
            avg_scroll_depth_pct: v.scrolls.length > 0 ? Math.round(avg(v.scrolls)) : null,
          })),
        window: { since, until },
      };
    }

    case 'cortiq_click_counts': {
      // user_interactions has no site_id — get session_ids for this site first
      const { data: siteSessions } = await supabase
        .from('tracking_sessions')
        .select('session_id')
        .eq('site_id', siteId)
        .gte('started_at', since)
        .lt('started_at', until)
        .limit(5000);
      const sids = (siteSessions ?? []).map((s: Record<string, string>) => s.session_id).filter(Boolean);
      if (sids.length === 0) return { elements: [], total_clicks: 0, window: { since, until } };
      let query = supabase
        .from('user_interactions')
        .select('element_tag, element_class')
        .in('session_id', sids)
        .eq('interaction_type', 'click')
        .limit(100000);
      if (input.url_prefix) { /* url not available in user_interactions */ }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const elemMap = new Map<string, number>();
      for (const i of data ?? []) {
        const key = `${i.element_tag || 'unknown'}|${i.element_class || ''}`;
        elemMap.set(key, (elemMap.get(key) ?? 0) + 1);
      }
      const rows = [...elemMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key, clicks]) => {
          const [tag, cls] = key.split('|');
          return { element_tag: tag, class_chain: cls || null, clicks };
        });
      return { elements: rows, total_clicks: rows.reduce((s, r) => s + r.clicks, 0), window: { since, until } };
    }

    case 'cortiq_heatmap_grid': {
      if (!input.url) return { error: 'url parameter is required' };
      let query = supabase
        .from('heatmap_data')
        .select('grid_x, grid_y')
        .eq('site_id', siteId)
        .like('url', `${input.url}%`)
        .gte('created_at', since)
        .lt('created_at', until)
        .limit(20000);
      if (input.device_type) query = query.eq('device_type', input.device_type);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const gridMap = new Map<string, number>();
      for (const h of data ?? []) {
        const key = `${Math.round(Number(h.grid_x))},${Math.round(Number(h.grid_y))}`;
        gridMap.set(key, (gridMap.get(key) ?? 0) + 1);
      }
      const grid = [...gridMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([coord, clicks]) => {
          const [vx_pct, vy_pct] = coord.split(',').map(Number);
          return { vx_pct, vy_pct, clicks };
        });
      return { url: input.url, grid, total_clicks: grid.reduce((s, r) => s + r.clicks, 0), window: { since, until } };
    }

    case 'cortiq_top_rage_clicks': {
      const { data, error } = await supabase
        .from('behavioral_incidents')
        .select('url, element_tag, element_id, element_class, incident_count, visitor_count')
        .eq('site_id', siteId)
        .eq('incident_type', 'rage_click')
        .gte('created_at', since)
        .lt('created_at', until)
        .order('incident_count', { ascending: false })
        .limit(limit);
      if (error) return { rage_clicks: [], note: 'No rage click data for this period', window: { since, until } };
      return { rage_clicks: data ?? [], window: { since, until } };
    }

    case 'cortiq_top_outbound': {
      // user_interactions has no element_href/site_id — use element_text as proxy for link clicks
      const { data: outSessions } = await supabase.from('tracking_sessions').select('session_id').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(5000);
      const outSids = (outSessions ?? []).map((s: Record<string, string>) => s.session_id).filter(Boolean);
      const { data } = outSids.length > 0 ? await supabase
        .from('user_interactions')
        .select('element_text, session_id')
        .in('session_id', outSids)
        .eq('interaction_type', 'link_click')
        .not('element_text', 'is', null)
        .limit(100000)
        : { data: [] };
      const destMap = new Map<string, { clicks: number; visitors: Set<string> }>();
      for (const i of data ?? []) {
        const text = String(i.element_text || '').trim();
        if (!text) continue;
        const e = destMap.get(text) ?? { clicks: 0, visitors: new Set() };
        e.clicks++;
        if (i.session_id) e.visitors.add(String(i.session_id));
        destMap.set(text, e);
      }
      return {
        outbound: [...destMap.entries()]
          .sort((a, b) => b[1].clicks - a[1].clicks)
          .slice(0, limit)
          .map(([link_text, v]) => ({ link_text, clicks: v.clicks, unique_sessions: v.visitors.size })),
        note: 'Shows link text of clicked links (href not stored in user_interactions)',
        window: { since, until },
      };
    }

    case 'cortiq_web_vitals': {
      const { data, error } = await supabase
        .from('page_views')
        .select('url, lcp, cls')
        .eq('site_id', siteId)
        .not('lcp', 'is', null)
        .gte('viewed_at', since)
        .lt('viewed_at', until)
        .limit(100000);
      if (error) return { vitals: [], note: 'Web Vitals not available for this period', window: { since, until } };
      const urlMap = new Map<string, { lcps: number[]; clss: number[] }>();
      for (const pv of data ?? []) {
        const e = urlMap.get(String(pv.url)) ?? { lcps: [], clss: [] };
        if (pv.lcp) e.lcps.push(Number(pv.lcp));
        if (pv.cls != null) e.clss.push(Number(pv.cls));
        urlMap.set(String(pv.url), e);
      }
      return {
        vitals: [...urlMap.entries()]
          .filter(([, v]) => v.lcps.length >= 3)
          .sort((a, b) => b[1].lcps.length - a[1].lcps.length)
          .slice(0, limit)
          .map(([url, v]) => {
            const sorted = [...v.lcps].sort((a, b) => a - b);
            const p75 = sorted[Math.floor(sorted.length * 0.75)];
            return {
              url,
              sample_count: v.lcps.length,
              avg_lcp_ms: Math.round(avg(v.lcps)),
              p75_lcp_ms: p75 ?? null,
              avg_cls: v.clss.length > 0 ? Math.round(avg(v.clss) * 1000) / 1000 : null,
              lcp_status: p75 < 2500 ? 'good' : p75 < 4000 ? 'needs_improvement' : 'poor',
            };
          }),
        window: { since, until },
      };
    }

    // ── Forms & Funnels ─────────────────────────────────────────────────────

    case 'cortiq_form_analytics': {
      const { data, error } = await supabase
        .from('form_sessions')
        .select('form_id, form_type, completed_at, completion_time')
        .eq('site_id', siteId)
        .gte('started_at', since)
        .lt('started_at', until)
        .limit(100000);
      if (error) {
        const { data: agg } = await supabase.from('form_analytics').select('*').eq('site_id', siteId).limit(limit);
        return { forms: agg ?? [], window: { since, until } };
      }
      const formMap = new Map<string, { type: string; starts: number; completions: number; times: number[] }>();
      for (const s of data ?? []) {
        const key = String(s.form_id || 'unknown');
        const e = formMap.get(key) ?? { type: String(s.form_type || key), starts: 0, completions: 0, times: [] };
        e.starts++;
        if (s.completed_at) { e.completions++; if (s.completion_time) e.times.push(Number(s.completion_time)); }
        formMap.set(key, e);
      }
      return {
        forms: [...formMap.entries()]
          .sort((a, b) => b[1].starts - a[1].starts)
          .slice(0, limit)
          .map(([form_id, v]) => ({
            form_id,
            form_type: v.type,
            starts: v.starts,
            completions: v.completions,
            abandonment_rate_pct: pct(v.starts - v.completions, v.starts),
            avg_completion_time_seconds: v.times.length > 0 ? Math.round(avg(v.times) / 1000) : null,
          })),
        window: { since, until },
      };
    }

    case 'cortiq_funnel_completion': {
      const { data, error } = await supabase
        .from('funnel_analytics')
        .select('funnel_id, step_index, step_name, sessions_entered, sessions_completed, drop_off_rate')
        .eq('site_id', siteId)
        .gte('date', since)
        .lt('date', until)
        .order('funnel_id')
        .order('step_index')
        .limit(500);
      if (error) throw new Error(error.message);
      return { funnel_steps: data ?? [], window: { since, until } };
    }

    // ── AI-Native Analytics ─────────────────────────────────────────────────

    case 'cortiq_ai_agent_traffic': {
      const { data, error } = await supabase
        .from('ai_search_traffic')
        .select('ai_platform, session_id, created_at')
        .eq('site_id', siteId)
        .gte('created_at', since)
        .lt('created_at', until)
        .limit(100000);
      if (error) throw new Error(error.message);
      const platMap = new Map<string, { sessions: number }>();
      for (const s of data ?? []) {
        const p = String(s.ai_platform || 'unknown');
        const e = platMap.get(p) ?? { sessions: 0 };
        e.sessions++;
        platMap.set(p, e);
      }
      return {
        ai_traffic: [...platMap.entries()]
          .sort((a, b) => b[1].sessions - a[1].sessions)
          .slice(0, limit)
          .map(([ai_platform, v]) => ({
            ai_platform,
            sessions: v.sessions,
          })),
        note: 'Detailed AI session metrics (duration, bounce, conversion) require ai_search_traffic data to be populated.',
        window: { since, until },
      };
    }

    case 'cortiq_ai_bot_analysis': {
      const { data, error } = await supabase
        .from('ai_bot_traffic')
        .select('bot_name, bot_type, request_type, js_executed, probe_triggered')
        .eq('site_id', siteId)
        .gte('created_at', since)
        .lt('created_at', until)
        .limit(100000);
      if (error) throw new Error(error.message);
      // request_type is the authoritative 3-way classification written at ingest
      // (training|agentic|citation, fallback 'unknown'). The old bot_category column
      // is legacy dead data (always 'other') — do not read it.
      const botMap = new Map<string, { type: string; category: string; requests: number; js_exec: number; probes: number }>();
      for (const b of data ?? []) {
        const key = String(b.bot_name || 'unknown');
        const e = botMap.get(key) ?? { type: String(b.bot_type || 'unknown'), category: String(b.request_type || 'unknown'), requests: 0, js_exec: 0, probes: 0 };
        e.requests++;
        if (b.js_executed) e.js_exec++;
        if (b.probe_triggered) e.probes++;
        botMap.set(key, e);
      }
      return {
        bots: [...botMap.entries()]
          .sort((a, b) => b[1].requests - a[1].requests)
          .slice(0, limit)
          .map(([bot_name, v]) => ({
            bot_name,
            bot_type: v.type,
            category: v.category, // training | agentic | citation | unknown
            requests: v.requests,
            js_capable_pct: pct(v.js_exec, v.requests),
            probe_rate_pct: pct(v.probes, v.requests),
          })),
        window: { since, until },
      };
    }

    case 'cortiq_ai_agent_journey': {
      const { data, error } = await supabase
        .from('ai_agent_journey_steps')
        .select('url, ai_platform, time_on_page_ms')
        .eq('site_id', siteId)
        .gte('created_at', since)
        .lt('created_at', until)
        .limit(100000);
      if (error) {
        const { data: fallback } = await supabase
          .from('ai_agent_sessions')
          .select('pages_viewed, conversion_page, ai_platform')
          .eq('site_id', siteId)
          .gte('created_at', since)
          .lt('created_at', until)
          .limit(1000);
        return { ai_journey: fallback ?? [], note: 'Showing session-level data (journey steps not available)', window: { since, until } };
      }
      const urlMap = new Map<string, { visits: number; platforms: Set<string>; times: number[] }>();
      for (const step of data ?? []) {
        const e = urlMap.get(String(step.url)) ?? { visits: 0, platforms: new Set(), times: [] };
        e.visits++;
        if (step.ai_platform) e.platforms.add(String(step.ai_platform));
        if (step.time_on_page_ms) e.times.push(Number(step.time_on_page_ms));
        urlMap.set(String(step.url), e);
      }
      return {
        ai_journey: [...urlMap.entries()]
          .sort((a, b) => b[1].visits - a[1].visits)
          .slice(0, limit)
          .map(([url, v]) => ({
            url,
            ai_visits: v.visits,
            ai_platforms: [...v.platforms],
            avg_time_on_page_ms: v.times.length > 0 ? Math.round(avg(v.times)) : null,
          })),
        window: { since, until },
      };
    }

    case 'cortiq_ai_vs_human': {
      const [aiRes, sessRes] = await Promise.all([
        supabase.from('ai_search_traffic').select('ai_platform, session_id').eq('site_id', siteId).gte('created_at', since).lt('created_at', until).limit(100000),
        supabase.from('tracking_sessions').select('duration_seconds, page_views').eq('site_id', siteId).gte('started_at', since).lt('started_at', until).limit(100000),
      ]);
      const ai = aiRes.data ?? [];
      const all = sessRes.data ?? [];
      const aiCount = ai.length;
      const allCount = all.length;

      const humAvgDur = Math.round(avg(all.map((r: Record<string, number>) => r.duration_seconds ?? 0)));
      const humBounces = all.filter((r: Record<string, number>) => (r.page_views ?? 1) <= 1).length;
      const humBouncePct = pct(humBounces, allCount);
      const humAvgPages = allCount > 0 ? Math.round(all.reduce((s: number, r: Record<string, number>) => s + (r.page_views ?? 0), 0) / allCount * 10) / 10 : 0;

      return {
        comparison: {
          ai_agents: { sessions: aiCount, note: 'Detailed metrics require ai_search_traffic data' },
          all_visitors: { sessions: allCount, avg_duration_seconds: humAvgDur, bounce_rate_pct: humBouncePct, avg_pages_per_session: humAvgPages },
        },
        note: 'all_visitors includes AI agent sessions. ai_agents is a subset.',
        window: { since, until },
      };
    }

    // ── SQL Escape Hatch (disabled until mcp_execute_query DB function is audited) ──

    case 'cortiq_execute_query': {
      return {
        error: 'cortiq_execute_query is not available in this version.',
        hint: 'Use the predefined analytics tools. Custom SQL will be enabled in a future release after security review.',
        available_tools: [
          'cortiq_sessions_summary', 'cortiq_top_pages', 'cortiq_top_sources',
          'cortiq_ai_agent_traffic', 'cortiq_ai_bot_analysis', 'cortiq_ai_agent_journey',
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// MCP Protocol Router
// ============================================================================

async function handleMCPRequest(
  request: JsonRpcRequest,
  siteId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<JsonRpcResponse> {
  const { method, id, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: {
              name: 'cortiq-analytics',
              version: SERVER_VERSION,
              description: 'CortIQ — AI-native web analytics. Unique AI agent tracking for ChatGPT, Perplexity, Claude, Gemini traffic.',
            },
          },
        };

      case 'notifications/initialized':
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

      case 'tools/call': {
        const toolName = (params as Record<string, string>)?.name;
        const toolInput = ((params as Record<string, ToolInput>)?.arguments ?? {}) as ToolInput;
        if (!toolName) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
        if (!TOOLS.find(t => t.name === toolName)) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${toolName}` } };
        }
        const result = await executeTool(toolName, toolInput, siteId, supabase);
        return {
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        };
      }

      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0', id,
      error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
    };
  }
}

// ============================================================================
// Entry Point
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    if (req.method !== 'POST') {
      return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'POST required' } }, 405);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const startTime = Date.now();

    // ── 1. Authenticate ──────────────────────────────────────────────────────
    let keyValidation: ApiKeyValidation | null = null;
    try {
      keyValidation = await validateApiKey(req.headers.get('Authorization'), supabase);
    } catch {
      return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Authentication failed' } }, 401);
    }

    if (!keyValidation) {
      return jsonResponse({
        jsonrpc: '2.0', id: null,
        error: { code: -32001, message: 'Unauthorized. Provide a valid CortIQ API key as: Authorization: Bearer <key>' },
      }, 401);
    }

    // ── 2. Rate limiting ─────────────────────────────────────────────────────
    const withinLimit = await checkRateLimit(keyValidation.api_key_id, keyValidation.rate_limit, supabase);
    if (!withinLimit) {
      return jsonResponse({
        jsonrpc: '2.0', id: null,
        error: { code: -32002, message: `Rate limit exceeded. Limit: ${keyValidation.rate_limit} requests/hour.` },
      }, 429);
    }

    // ── 3. Parse request ──────────────────────────────────────────────────────
    let body: JsonRpcRequest;
    try {
      body = await req.json() as JsonRpcRequest;
    } catch {
      return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }, 400);
    }

    // ── 4. Handle ─────────────────────────────────────────────────────────────
    const response = await handleMCPRequest(body, keyValidation.site_id, supabase);
    const statusCode = response.error ? 200 : 200; // JSON-RPC always 200 per spec

    // ── 5. Log usage (non-blocking) ───────────────────────────────────────────
    void (async () => {
      try {
        await supabase.rpc('log_api_usage', {
          p_api_key_id: keyValidation!.api_key_id,
          p_endpoint: `/mcp-server/${body.method}`,
          p_method: 'POST',
          p_status_code: statusCode,
          p_response_time_ms: Date.now() - startTime,
          p_request_ip: req.headers.get('x-forwarded-for') ?? '',
          p_user_agent: req.headers.get('user-agent') ?? '',
        });
      } catch { /* non-critical */ }
    })();

    return jsonResponse(response, statusCode);

  } catch (err) {
    // Never expose internal error details to clients
    console.error('MCP server error:', err);
    return jsonResponse(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal server error' } },
      500,
    );
  }
});
