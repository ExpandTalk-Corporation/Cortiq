import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveSite } from "../_shared/resolve-site.ts";

// AI-referral measurement: a human visitor arriving from ChatGPT, Perplexity, Claude, …
//
// This is visitor analytics, not security. The tracker (public/spa-tracking.js) only calls
// this endpoint after the visitor has given analytics consent; see startAnalytics() and
// tests/foundation/tracking-consent.test.mjs. The legacy ai-tracking-unified.js no longer
// calls it. Because the server cannot verify consent itself, it also minimises what it
// stores: no user agent, no visitor hash, referrer reduced to its origin and the landing
// URL stripped of every query parameter except utm_*.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORMS = new Set(['chatgpt', 'perplexity', 'claude', 'gemini', 'copilot', 'you', 'phind', 'other_ai']);
const DEVICE_TYPES = new Set(['desktop', 'mobile', 'tablet']);

interface TrackingData {
  siteId: string;
  sessionId: string;
  aiPlatform?: string;
  referrer?: string;
  url?: string;
  pageTitle?: string;
  deviceType?: string;
  landedAt?: string;
  update?: {
    sessionDuration?: number;
    pagesViewed?: number;
    conversions?: number;
    engaged?: boolean;
    bounce?: boolean;
  };
}

function referrerOrigin(ref: string | undefined): string | null {
  if (!ref) return null;
  try { return new URL(ref).origin; } catch { return null; }
}

// Keep path + utm_* only: other query parameters can carry emails, tokens or search terms.
function minimiseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const kept = new URLSearchParams();
    u.searchParams.forEach((v, k) => { if (k.startsWith('utm_')) kept.set(k, v.slice(0, 200)); });
    const qs = kept.toString();
    return (u.origin + u.pathname + (qs ? `?${qs}` : '')).slice(0, 1000);
  } catch {
    return null;
  }
}

const clampInt = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : undefined;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let data: TrackingData;
    try { data = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const sessionId = typeof data.sessionId === 'string' ? data.sessionId.slice(0, 100) : '';
    if (!data.siteId || !UUID.test(data.siteId) || !sessionId) {
      return json({ error: 'Missing or invalid siteId/sessionId' }, 400);
    }

    // siteId may be an account id (WordPress plugin); resolved via the page URL / Origin.
    const site = await resolveSite(supabase, data.siteId, data.url ?? req.headers.get('origin'), 'id, is_active');
    if (!site || !site.is_active) return json({ success: true, skipped: 'unknown site' });
    const siteId = site.id;

    // Engagement update at page hide. Whitelisted columns only — the old code passed the
    // client object straight to .update(), which let a caller overwrite any column.
    if (data.update) {
      const u = data.update;
      const patch: Record<string, unknown> = {};
      const duration = clampInt(u.sessionDuration, 86_400);
      const pages = clampInt(u.pagesViewed, 10_000);
      const conversions = clampInt(u.conversions, 10_000);
      if (duration !== undefined) patch.session_duration = duration;
      if (pages !== undefined) patch.pages_viewed = pages;
      if (conversions !== undefined) patch.conversions = conversions;
      if (typeof u.engaged === 'boolean') patch.engaged = u.engaged;
      if (typeof u.bounce === 'boolean') patch.bounce = u.bounce;
      if (Object.keys(patch).length === 0) return json({ success: true, action: 'noop' });

      const { error } = await supabase.from('ai_search_traffic').update(patch)
        .eq('site_id', siteId).eq('session_id', sessionId);
      if (error) throw error;
      return json({ success: true, action: 'updated' });
    }

    const platform = (data.aiPlatform ?? '').toLowerCase();
    if (!PLATFORMS.has(platform)) return json({ error: 'Unknown aiPlatform' }, 400);

    const { data: existing, error: checkError } = await supabase.from('ai_search_traffic')
      .select('id, pages_viewed').eq('site_id', siteId).eq('session_id', sessionId).maybeSingle();
    if (checkError) throw checkError;

    if (existing) {
      const { error } = await supabase.from('ai_search_traffic')
        .update({ pages_viewed: (existing.pages_viewed ?? 1) + 1, engaged: true })
        .eq('id', existing.id);
      if (error) throw error;
      return json({ success: true, action: 'pageview_tracked' });
    }

    const url = minimiseUrl(data.url);
    if (!url) return json({ error: 'Invalid url' }, 400);

    const landedAt = data.landedAt && !Number.isNaN(Date.parse(data.landedAt)) ? data.landedAt : new Date().toISOString();

    const { error: insertError } = await supabase.from('ai_search_traffic').insert({
      site_id: siteId,
      session_id: sessionId,
      user_hash: null,
      ai_platform: platform,
      referrer: referrerOrigin(data.referrer),
      user_agent: null,
      url,
      page_title: typeof data.pageTitle === 'string' ? data.pageTitle.slice(0, 300) : null,
      device_type: DEVICE_TYPES.has(data.deviceType ?? '') ? data.deviceType : 'desktop',
      landed_at: landedAt,
      pages_viewed: 1,
      engaged: false,
      bounce: false,
    });
    if (insertError) throw insertError;

    return json({ success: true, action: 'session_created' });
  } catch (error) {
    console.error('Error in ai-search-tracker:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
