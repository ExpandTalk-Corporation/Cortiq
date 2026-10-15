import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";

/**
 * Sentrisk API integration
 *
 * Implements two endpoints consumed by the Sentrisk integration:
 *
 *   GET /v1/validate?site={tracking_id}
 *   GET /v1/dashboard?site={tracking_id}&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Auth: x-api-key header (validated against the api_keys table).
 *
 * Deploy base URL (set as CORTIQ_API_URL in Sentrisk env):
 *   https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/sentrisk-api
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const path = url.pathname;

  const isValidate = path.endsWith("/v1/validate") || path.endsWith("/validate");
  const isDashboard = path.endsWith("/v1/dashboard") || path.endsWith("/dashboard");

  if (!isValidate && !isDashboard) {
    return json({ ok: false, error: "Not found" }, 404);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return json({ ok: false, error: "Invalid API key" }, 401);
  }

  // ── Required query param ─────────────────────────────────────────────────
  const trackingId = url.searchParams.get("site");
  if (!trackingId) {
    return json({ ok: false, error: "Missing required parameter: site" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // ── Validate API key (reuse existing RPC + hashing pattern) ─────────────
    const keyHash = await hashKey(apiKey);
    const { data: keyRows, error: keyError } = await supabase.rpc(
      "validate_api_key",
      { p_key_hash: keyHash }
    );

    if (keyError || !keyRows || keyRows.length === 0) {
      return json({ ok: false, error: "Invalid API key" }, 401);
    }

    const keyData = keyRows[0] as {
      api_key_id: string;
      company_id: string;
      site_id: string | null;
      permissions: string[];
      rate_limit: number;
    };

    // ── Look up site by tracking_id ──────────────────────────────────────────
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, domain, tracking_id, organization_id, is_active")
      .eq("tracking_id", trackingId)
      .single();

    if (siteError || !site) {
      return json({ ok: false, error: "Site not found" }, 404);
    }

    // Verify the API key is scoped to this site (or is unscoped)
    if (keyData.site_id && keyData.site_id !== site.id) {
      return json({ ok: false, error: "Site not found" }, 404);
    }

    // ── /v1/validate ─────────────────────────────────────────────────────────
    if (isValidate) {
      let plan = "starter";

      if (site.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("plan")
          .eq("id", site.organization_id)
          .single();
        if (org?.plan) plan = org.plan;
      }

      return json({
        ok: true,
        site: site.tracking_id,
        domain: site.domain,
        plan,
      });
    }

    // ── /v1/dashboard ────────────────────────────────────────────────────────
    const fromDate = url.searchParams.get("from");
    const toDate = url.searchParams.get("to");

    if (!fromDate || !toDate) {
      return json(
        { ok: false, error: "Missing required parameters: from, to" },
        400
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return json(
        { ok: false, error: "Dates must be in YYYY-MM-DD format" },
        400
      );
    }

    const fromISO = `${fromDate}T00:00:00Z`;
    const toISO = `${toDate}T23:59:59Z`;
    const days =
      Math.round(
        (new Date(toDate).getTime() - new Date(fromDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    const { data: dash, error: dashError } = await supabase.rpc(
      "get_sentrisk_dashboard",
      {
        p_site_id: site.id,
        p_from: fromISO,
        p_to: toISO,
      }
    );

    if (dashError) {
      console.error("get_sentrisk_dashboard error:", dashError);
      return json({ ok: false, error: "Failed to fetch dashboard data" }, 500);
    }

    return json({
      site: site.tracking_id,
      period: { from: fromDate, to: toDate, days },
      stats: {
        pageviews:            dash.pageviews,
        sessions:             dash.sessions,
        visitors:             dash.visitors,
        bounce_rate:          dash.bounce_rate,
        avg_duration_seconds: dash.avg_duration_seconds,
      },
      trend:   dash.trend,
      pages:   dash.pages,
      devices: dash.devices,
      sources: dash.sources,
    });
  } catch (err) {
    console.error("Sentrisk API error:", err);
    return json({ ok: false, error: "Internal server error" }, 500);
  }
});
