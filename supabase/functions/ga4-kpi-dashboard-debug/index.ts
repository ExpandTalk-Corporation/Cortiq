import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { requireSiteAccess } from "../_shared/site-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Step =
  | "parse_request" | "validate_input" | "authorize" | "init_supabase" | "load_site" | "check_site_ga4"
  | "get_service_key" | "get_access_token" | "fetch_sections" | "format_response";

type SectionKey = "overall" | "channels" | "paid" | "social" | "ai" | "newsletter" | "newsletter_events";

const DEFAULT_SECTIONS: SectionKey[] = ["overall","channels","paid","social","ai","newsletter","newsletter_events"];
const SECTION_TIMEOUT_MS = 6000; // justera vid behov
const TOKEN_TIMEOUT_MS = 6000;

function isUUID(v?: string): boolean {
  return !!v && /^[0-9a-fA-F-]{36}$/.test(v);
}
function iso(d = new Date()) { return d.toISOString(); }

function ok(body: unknown, debugId: string, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Debug-Id": debugId },
  });
}

function fail(debugId: string, step: Step, status: number, message: string, details?: unknown, tips?: string[]) {
  return ok({ ok: false, debugId, error: { step, status, message, details, tips } }, debugId, status);
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  const t = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${ms}ms @${tag}`)), ms));
  return Promise.race([p, t]);
}

function str2ab(str: string) {
  const buf = new ArrayBuffer(str.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i);
  return buf;
}

async function getGoogleAccessToken(serviceAccountKey: string) {
  const key = JSON.parse(serviceAccountKey);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = `${headerB64}.${payloadB64}`;

  const pk = (key.private_key as string).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    str2ab(atob(pk)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${unsigned}.${sigB64}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const json = await resp.json();
  if (!resp.ok) throw new Error(`Token error ${resp.status}: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

// ---------- GA4 Request Builders ----------
function dr(startDate: string, endDate: string, comparisonStart?: string, comparisonEnd?: string) {
  const arr: any[] = [{ startDate, endDate }];
  if (comparisonStart && comparisonEnd) arr.push({ startDate: comparisonStart, endDate: comparisonEnd });
  return arr;
}

function rq_overall(p: string, s: string, e: string, cs?: string, ce?: string) {
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "deviceCategory" }],
    metrics: [
      { name: "sessions" }, { name: "activeUsers" }, { name: "newUsers" },
      { name: "screenPageViews" }, { name: "averageSessionDuration" },
      { name: "bounceRate" }, { name: "screenPageViewsPerSession" },
      { name: "conversions" }, { name: "totalRevenue" }, { name: "purchaseRevenue" },
    ],
  };
}

function rq_channels(p: string, s: string, e: string, cs?: string, ce?: string) {
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "deviceCategory" }],
    metrics: [
      { name: "sessions" }, { name: "activeUsers" }, { name: "conversions" },
      { name: "totalRevenue" }, { name: "bounceRate" }, { name: "averageSessionDuration" },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: ["organic","(none)","referral"].map(v => ({
          filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: v } }
        })),
      },
    },
  };
}

function rq_paid(p: string, s: string, e: string, cs?: string, ce?: string) {
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
    metrics: [
      { name: "sessions" }, { name: "activeUsers" }, { name: "conversions" },
      { name: "totalRevenue" }, { name: "advertiserAdCost" },
      { name: "advertiserAdClicks" }, { name: "advertiserAdImpressions" },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: ["cpc","ppc","paid-social","display"].map(v => ({
          filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: v } }
        })),
      },
    },
  };
}

function rq_social(p: string, s: string, e: string, cs?: string, ce?: string) {
  const sources = ["facebook","instagram","linkedin","twitter","youtube","tiktok"];
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [
      { name: "sessions" }, { name: "activeUsers" }, { name: "conversions" },
      { name: "totalRevenue" }, { name: "bounceRate" }, { name: "averageSessionDuration" },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: sources.map(v => ({
          filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: v } }
        })),
      },
    },
  };
}

function rq_ai(p: string, s: string, e: string, cs?: string, ce?: string) {
  const engines = ["chatgpt","perplexity","claude","gemini","copilot","you.com","poe"];
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "sessionSource" }, { name: "landingPage" }],
    metrics: [
      { name: "sessions" }, { name: "activeUsers" }, { name: "conversions" },
      { name: "totalRevenue" }, { name: "bounceRate" }, { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: engines.map(v => ({
          filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: v } }
        })),
      },
    },
  };
}

function rq_newsletter(p: string, s: string, e: string, cs?: string, ce?: string) {
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "sessionSource" }, { name: "sessionCampaignName" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "conversions" }, { name: "totalRevenue" }],
    dimensionFilter: {
      orGroup: {
        expressions: [
          { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: "email" } } },
          { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "newsletter" } } },
          { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: "mailchimp" } } },
        ],
      },
    },
  };
}

function rq_newsletter_events(p: string, s: string, e: string, cs?: string, ce?: string) {
  return {
    property: `properties/${p}`,
    dateRanges: dr(s, e, cs, ce),
    dimensions: [{ name: "month" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "eventCountPerUser" }],
    dimensionFilter: {
      orGroup: {
        expressions: ["newsletter_signup","newsletter_confirmation","newsletter_unsubscribe"]
          .map(v => ({ filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: v } } })),
      },
    },
  };
}

async function ga4(token: string, propertyId: string, body: any): Promise<any> {
  const pid = propertyId;
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!resp.ok) {
    throw { status: resp.status, statusText: resp.statusText, body: json, url, requestBody: body };
  }
  return json;
}

// ---------- Serve ----------
serve(async (req) => {
  const t0 = performance.now();
  const startedAt = iso();
  const debugId = crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  let step: Step = "parse_request";
  try {
    console.log(`[${debugId}] ▶ KPI debug start ${startedAt}`);

    const body = await req.json().catch(() => ({}));
    const {
      siteId,
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
      sections, // optional: ["overall","channels",...]
      sectionTimeoutMs, // optional override
    } = body ?? {};

    console.log(`[${debugId}] input`, {
      siteId, startDate, endDate, comparisonStartDate, comparisonEndDate, sections,
    });

    // Validate
    step = "validate_input";
    if (!isUUID(siteId)) {
      return fail(debugId, step, 400, "Invalid or missing siteId", { received: siteId }, [
        "Skicka ett giltigt UUID från tabellen sites.",
      ]);
    }
    if (!startDate || !endDate) {
      return fail(debugId, step, 400, "Missing startDate or endDate", { startDate, endDate }, [
        "Skicka ISO-datum (YYYY-MM-DD) för startDate och endDate.",
      ]);
    }

    // Caller must be signed in and have access to the site (RLS on sites).
    step = "authorize";
    const authorization = req.headers.get("Authorization");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authorization ?? "" } } },
    );
    const access = await requireSiteAccess(userClient, authorization, siteId);
    if (!access.ok) return fail(debugId, step, access.status, access.error);

    // Init Supabase
    step = "init_supabase";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) {
      return fail(debugId, step, 500, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    const supabase = createClient(url, key);

    // Load site
    step = "load_site";
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("ga_property_id, ga_integration_enabled, site_name")
      .eq("id", siteId)
      .single();

    console.log(`[${debugId}] site`, { siteError, site });

    if (siteError || !site) {
      return fail(debugId, step, 404, "Site not found", siteError);
    }

    // Check GA4
    step = "check_site_ga4";
    if (!site.ga_integration_enabled || !site.ga_property_id) {
      return fail(debugId, step, 400, "Google Analytics integration not enabled or missing propertyId", { site });
    }

    // Service key
    step = "get_service_key";
    const sak = Deno.env.get("GA4_SERVICE_ACCOUNT_KEY");
    if (!sak) {
      return fail(debugId, step, 500, "GA4 service account key not configured");
    }

    // Token (with timeout)
    step = "get_access_token";
    let token = "";
    const tTok0 = performance.now();
    try {
      token = await withTimeout(getGoogleAccessToken(sak), TOKEN_TIMEOUT_MS, "token");
      console.log(`[${debugId}] token ok in ${(performance.now() - tTok0).toFixed(0)}ms`);
    } catch (e) {
      return fail(debugId, step, 502, "Failed to mint Google access token", String(e), [
        "Kontrollera servicekontots GA4-behörigheter och nyckelns giltighet.",
      ]);
    }

    // Build selected sections
    step = "fetch_sections";
    const sel: SectionKey[] = Array.isArray(sections) && sections.length
      ? sections.filter((k: string): k is SectionKey => DEFAULT_SECTIONS.includes(k as SectionKey))
      : DEFAULT_SECTIONS;

    const pid = site.ga_property_id as string;
    const timeout = typeof sectionTimeoutMs === "number" ? Math.max(1000, sectionTimeoutMs) : SECTION_TIMEOUT_MS;

    // Map of section -> request body builder
    const builders: Record<SectionKey, () => any> = {
      overall: () => rq_overall(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
      channels: () => rq_channels(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
      paid: () => rq_paid(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
      social: () => rq_social(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
      ai: () => rq_ai(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
      newsletter: () => rq_newsletter(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
      newsletter_events: () => rq_newsletter_events(pid, startDate, endDate, comparisonStartDate, comparisonEndDate),
    };

    // Execute each section individually with its own timeout, do NOT throw on failure
    const results: Record<string, any> = {};
    const errors: Record<string, any> = {};

    await Promise.all(sel.map(async (k) => {
      const tS = performance.now();
      try {
        const body = builders[k]();
        const data = await withTimeout(ga4(token, pid, body), timeout, `ga4:${k}`);
        results[k] = { ok: true, rowCount: data.rowCount || 0, data };
        console.log(`[${debugId}] ${k} ok in ${(performance.now() - tS).toFixed(0)}ms rows=${data.rowCount || 0}`);
      } catch (e: any) {
        errors[k] = { ok: false, error: e?.status ? e : String(e) };
        console.warn(`[${debugId}] ${k} fail in ${(performance.now() - tS).toFixed(0)}ms`, e);
      }
    }));

    // Response
    step = "format_response";
    const elapsed = (performance.now() - t0).toFixed(0) + "ms";
    const bodyOut = {
      ok: Object.keys(errors).length === 0,
      debugId,
      site: { id: siteId, name: site.site_name, property: pid },
      input: { startDate, endDate, comparisonStartDate, comparisonEndDate, sections: sel, sectionTimeoutMs: timeout },
      results,
      errors, // per-sektion fel, med GA4-status/body om tillgängligt
      meta: { startedAt, finishedAt: iso(), elapsed },
    };
    return ok(bodyOut, debugId);
  } catch (e: any) {
    const elapsed = (performance.now() - t0).toFixed(0) + "ms";
    console.error(`[${debugId}] ✖ unhandled after ${elapsed}`, e?.stack || e?.message || String(e));
    return fail(debugId, "format_response", 500, "Internal server error", String(e));
  }
});