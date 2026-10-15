import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";
import { requireSiteAccess } from "../_shared/site-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Step =
  | "parse_request"
  | "validate_input"
  | "authorize"
  | "init_supabase"
  | "load_site"
  | "check_site_ga4"
  | "get_service_key"
  | "get_access_token"
  | "ga4_fetch"
  | "format_response";

function ok<T>(body: T, debugId: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, debugId, ...extra, ...body }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Debug-Id": debugId },
    status: 200,
  });
}

function fail(
  debugId: string,
  step: Step,
  status: number,
  message: string,
  details?: unknown,
  tips?: string[],
  extra: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify(
      {
        ok: false,
        debugId,
        error: { step, message, status, details, tips },
        ...extra,
      },
      null,
      2,
    ),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Debug-Id": debugId },
      status,
    },
  );
}

function isUUID(v?: string): boolean {
  return !!v && /^[0-9a-fA-F-]{36}$/.test(v);
}

function iso(d = new Date()) {
  return d.toISOString();
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
  const data = `${headerB64}.${payloadB64}`;

  const pk = (key.private_key as string)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const imported = await crypto.subtle.importKey(
    "pkcs8",
    str2ab(atob(pk)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", imported, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${data}.${sigB64}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Token error ${resp.status}: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

function str2ab(str: string) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) bufView[i] = str.charCodeAt(i);
  return buf;
}

serve(async (req) => {
  const t0 = performance.now();
  const debugId = crypto.randomUUID();
  const startedAt = iso();

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  let step: Step = "parse_request";
  try {
    console.log(`[${debugId}] start ${startedAt} ${req.method} ${new URL(req.url).pathname}`);

    // 1) Läs & eko request (utan hemligheter)
    const body = await req.json().catch(() => ({}));
    const { siteId, measurementId, startDate, endDate } = body ?? {};
    console.log(`[${debugId}] request body`, { siteId, measurementId, startDate, endDate });

    // 2) Validering
    step = "validate_input";
    if (!isUUID(siteId)) {
      return fail(debugId, step, 400, "Invalid or missing siteId", { received: siteId }, [
        "Skicka ett giltigt UUID i siteId.",
        "Hämta ett befintligt id från tabellen sites.",
      ], { startedAt });
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
    if (!access.ok) return fail(debugId, step, access.status, access.error, undefined, undefined, { startedAt });

    // 3) Initiera Supabase
    step = "init_supabase";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseKey) {
      return fail(debugId, step, 500, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", undefined, [
        "Sätt miljövariablerna i Edge Function settings.",
      ], { startedAt });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4) Läs site
    step = "load_site";
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("ga_property_id, ga_integration_enabled, site_name")
      .eq("id", siteId)
      .single();

    console.log(`[${debugId}] site query`, { siteError, site });

    if (siteError || !site) {
      return fail(debugId, step, 404, "Site not found", siteError, [
        "Kontrollera att siteId finns i tabellen sites.",
      ], { startedAt });
    }

    // 5) Kolla GA4-konfig
    step = "check_site_ga4";
    if (!site.ga_integration_enabled || !site.ga_property_id) {
      return fail(debugId, step, 400, "Google Analytics integration not enabled for this site", { site }, [
        "Sätt ga_integration_enabled=true och ga_property_id.",
      ], { startedAt });
    }

    // 6) Hämta service-nyckel
    step = "get_service_key";
    const serviceAccountKey = Deno.env.get("GA4_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKey) {
      return fail(debugId, step, 500, "GA4 service account key not configured", undefined, [
        "Lägg in GA4_SERVICE_ACCOUNT_KEY (JSON från servicekonto).",
      ], { startedAt });
    }

    // 7) Token
    step = "get_access_token";
    let accessToken = "";
    try {
      const tToken0 = performance.now();
      accessToken = await getGoogleAccessToken(serviceAccountKey);
      console.log(`[${debugId}] token ok in ${(performance.now() - tToken0).toFixed(0)}ms`);
    } catch (e) {
      return fail(debugId, step, 502, "Failed to mint Google access token", String(e), [
        "Verifiera servicekontots behörighet till GA4-propertyn.",
        "Kontrollera att JSON-nyckeln är giltig och inte roterad.",
      ], { startedAt });
    }

    // 8) GA4-anrop
    step = "ga4_fetch";
    const today = new Date();
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const sDate = startDate || d30.toISOString().split("T")[0];
    const eDate = endDate || today.toISOString().split("T")[0];

    const requestBody = {
      property: `properties/${site.ga_property_id}`,
      dateRanges: [{ startDate: sDate, endDate: eDate }],
      dimensions: [{ name: "searchTerm" }, { name: "date" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: "view_search_results" },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 50,
    };

    const gaUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga_property_id}:runReport`;
    const gaResp = await fetch(gaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(requestBody),
    });

    const rawText = await gaResp.text();
    let parsed: any = {};
    try { parsed = rawText ? JSON.parse(rawText) : {}; } catch { /* behåll rawText i fel */ }

    if (!gaResp.ok) {
      // Returnera exakt vad GA svarade
      return fail(
        debugId,
        step,
        gaResp.status,
        "GA4 API error",
        { statusText: gaResp.statusText, body: parsed || rawText, url: gaResp.url, requestBody },
        [
          "Kontrollera att servicekontot har åtkomst (Viewer/Analyst) till GA4-propertyn.",
          "Validera propertyId och datumintervall.",
        ],
        { startedAt, site: { id: siteId, name: site.site_name, property: site.ga_property_id } },
      );
    }

    // 9) Formatera
    step = "format_response";
    const rows = parsed.rows ?? [];
    const searchTerms = rows.map((row: any) => ({
      searchTerm: row.dimensionValues?.[0]?.value || "Unknown",
      eventCount: row.metricValues?.[0]?.value || "0",
      lastSearched: row.dimensionValues?.[1]?.value,
    }))
      .filter((r: any) => r.searchTerm && r.searchTerm !== "Unknown" && r.searchTerm !== "(not set)" && r.searchTerm.length > 1);

    const elapsed = (performance.now() - t0).toFixed(0) + "ms";
    console.log(`[${debugId}] done ${elapsed}, terms=${searchTerms.length}`);

    return ok(
      { searchTerms, meta: { startedAt, finishedAt: iso(), elapsed, input: { siteId, startDate: sDate, endDate: eDate } } },
      debugId,
      { site: { id: siteId, name: site.site_name, property: site.ga_property_id } },
    );
  } catch (e: any) {
    const elapsed = (performance.now() - t0).toFixed(0) + "ms";
    console.error(`[${debugId}] unhandled error after ${elapsed}`, e?.stack || e?.message || String(e));
    return fail(debugId, "format_response", 500, "Internal server error", String(e), undefined, {
      startedAt,
      elapsed,
    });
  }
});