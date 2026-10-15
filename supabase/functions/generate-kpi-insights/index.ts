import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MonthlyKPI {
  month: string;           // '01' – '12'
  monthName: string;
  sessions: number;
  uniqueUsers: number;
  pageViews: number;
  avgDuration: number;
  conversionRate: number;
  prevSessions?: number;
  prevUniqueUsers?: number;
  yoySessionsDelta?: number;  // percentage, e.g. 12.5
  yoyUsersDelta?: number;
  dataSource: 'cortiq' | 'ga4' | 'mixed';
}

interface InsightPayload {
  siteId: string;
  year: number;
  monthlyData: MonthlyKPI[];
  channelData?: Array<{ channel: string; sessions: number; prevSessions?: number }>;
}

interface KPIInsight {
  type: 'Varning' | 'Möjlighet' | 'Trend' | 'Säsong';
  title: string;
  insight: string;
  action: string;
}

async function callClaudeWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Retry on 429 (rate limit) and 5xx (server errors)
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const retryAfter = res.headers.get('retry-after');
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, attempt), 30000); // 1s, 2s, 4s, max 30s
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        lastError = new Error(`Claude API returned ${res.status} after ${maxRetries} retries`);
        throw lastError;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30000)));
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let runId: string | null = null;
  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // AITLP T10: check key age — warn if ANTHROPIC_API_KEY > 90 days since last rotation
    const keyIssuedAt = Deno.env.get('CLAUDE_KEY_ISSUED_AT');
    let keyAgeWarning: string | null = null;
    if (keyIssuedAt) {
      const ageMs  = Date.now() - new Date(keyIssuedAt).getTime();
      const ageDays = Math.floor(ageMs / 86_400_000);
      if (ageDays > 90) {
        keyAgeWarning = `ANTHROPIC_API_KEY is ${ageDays} days old — rotation recommended (AITLP T10: max 90 days)`;
        console.warn(`[credential-age] ${keyAgeWarning}`);
        // Update credential_audit so UI can surface this
        await supabase.from('credential_audit')
          .update({ notes: keyAgeWarning })
          .eq('key_name', 'ANTHROPIC_API_KEY');
      }
    }

    const body: InsightPayload = await req.json();
    const { siteId, year, monthlyData, channelData } = body;

    // AITLP T10: validate siteId is a UUID — never pass unsanitized user input into prompt
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!siteId || !UUID_RE.test(siteId) || !year || !monthlyData?.length) {
      // intentionally before runId creation — invalid request, nothing to log
      return new Response(JSON.stringify({ error: 'Invalid or missing siteId, year, or monthlyData' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // Clamp year to reasonable range to prevent prompt injection via year field
    const safeYear = Math.max(2020, Math.min(2100, Number(year)));
    const model = Deno.env.get('CLAUDE_MODEL') ?? 'claude-sonnet-4-6';

    // Create agent run record for provenance tracking
    const { data: runData } = await supabase
      .from('agent_runs')
      .insert({ site_id: siteId, function_name: 'generate-kpi-insights', model })
      .select('id')
      .single();
    runId = runData?.id ?? null;

    // Summarise the data for the prompt — keep tokens low
    const activeMonths = monthlyData.filter(m => m.sessions > 0 || (m.prevSessions ?? 0) > 0);
    const totalSessions = monthlyData.reduce((s, m) => s + m.sessions, 0);
    const totalPrevSessions = monthlyData.reduce((s, m) => s + (m.prevSessions ?? 0), 0);
    const anomalies = monthlyData.filter(m =>
      m.yoySessionsDelta !== undefined && Math.abs(m.yoySessionsDelta) > 20
    ).map(m => `${m.monthName}: ${m.yoySessionsDelta! > 0 ? '+' : ''}${m.yoySessionsDelta!.toFixed(0)}% YoY`);

    const topChannels = (channelData ?? [])
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5)
      .map(c => `${c.channel}: ${c.sessions} sessioner${c.prevSessions !== undefined ? ` (fd ${c.prevSessions})` : ''}`)
      .join(', ');

    // AITLP T10 / Section 13.7: token flood protection — truncate month summary if too large
    const MAX_MONTH_ROWS = 12;
    const monthSummaryRaw = activeMonths.slice(0, MAX_MONTH_ROWS).map(m =>
      `${m.monthName}: ${m.sessions} sess, ${m.uniqueUsers} anv, ${m.conversionRate.toFixed(1)}% konv` +
      (m.yoySessionsDelta !== undefined ? `, YoY ${m.yoySessionsDelta > 0 ? '+' : ''}${m.yoySessionsDelta.toFixed(0)}%` : '')
    ).join('\n');
    // Hard cap: if summary > 2000 chars something is wrong with the data
    const monthSummary = monthSummaryRaw.slice(0, 2000);

    // Update run with data provenance before calling AI
    if (runId) {
      await supabase.from('agent_runs').update({
        queries_run: [{ source: 'client', description: 'Monthly KPI data', months_count: monthlyData.length, active_months: activeMonths.length }],
        data_snapshot: {
          year: safeYear,
          total_sessions: totalSessions,
          total_prev_sessions: totalPrevSessions,
          active_months: activeMonths.length,
          anomalies_count: anomalies.length,
          has_channel_data: (channelData ?? []).length > 0,
        },
      }).eq('id', runId);
    }

    const prompt = `You are a senior digital analyst. Analyse the following KPI data for ${safeYear} and provide strategic insights in English.

MONTHLY DATA:
${monthSummary}

TOTAL: ${totalSessions} sessions ${safeYear}${totalPrevSessions > 0 ? ` vs ${totalPrevSessions} sessions ${safeYear - 1}` : ''}
${anomalies.length > 0 ? `ANOMALIES (>20% YoY): ${anomalies.join(', ')}` : ''}
${topChannels ? `TOP CHANNELS: ${topChannels}` : ''}

Provide 4–6 insights. Each insight MUST have:
- type: one of "Warning", "Opportunity", "Trend" or "Seasonal"
- title: short title (max 60 characters)
- insight: analysis (2–3 sentences, fact-based, reference specific months/numbers)
- action: concrete action (1–2 sentences)

Return ONLY valid JSON without explanation:
{"insights": [{"type":"...","title":"...","insight":"...","action":"..."}]}`;

    const claudeRes = await callClaudeWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude API error:', claudeRes.status, errText);
      return new Response(JSON.stringify({ error: 'Claude API call failed', details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? '{}';

    let insights: KPIInsight[] = [];
    try {
      const parsed = JSON.parse(rawText);
      insights = parsed.insights ?? [];
    } catch {
      // Try extracting JSON from text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { insights = JSON.parse(match[0]).insights ?? []; } catch { /* fallback empty */ }
      }
    }

    if (runId) {
      await supabase.from('agent_runs').update({
        status: 'completed',
        output: { insights_count: insights.length },
        input_tokens: claudeData.usage?.input_tokens ?? null,
        output_tokens: claudeData.usage?.output_tokens ?? null,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    // Upsert into kpi_ai_insights (one row per site+year)
    const { error: upsertError } = await supabase
      .from('kpi_ai_insights')
      .upsert(
        { site_id: siteId, year, insights_json: insights, generated_at: new Date().toISOString(), run_id: runId },
        { onConflict: 'site_id,year' }
      );

    if (upsertError) {
      console.error('kpi_ai_insights upsert error:', upsertError);
      // Non-fatal — still return the insights
    }

    console.log(`[generate-kpi-insights] site=${siteId} year=${year} insights=${insights.length}`);

    return new Response(JSON.stringify({ success: true, insights, generated_at: new Date().toISOString(), key_age_warning: keyAgeWarning }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Unexpected error in generate-kpi-insights:', err);
    if (runId) {
      await supabase.from('agent_runs').update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
