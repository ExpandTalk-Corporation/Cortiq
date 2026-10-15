/**
 * Agent Telemetry — OTLP/HTTP JSON ingestor
 *
 * Accepts two formats:
 *
 * 1. OTLP/HTTP JSON (standard OTel exporters, Claude Code, OpenTelemetry SDKs):
 *    POST /agent-telemetry
 *    Content-Type: application/json
 *    Body: { "resourceSpans": [...] }
 *
 * 2. Simplified JSON (CortIQ SDK, quick instrumentation):
 *    POST /agent-telemetry
 *    Content-Type: application/json
 *    Body: { "spans": [...] }
 *
 * Authentication: Bearer <company_api_key>
 *   Same API key used for track-event.
 *
 * Claude Code configuration:
 *   export CLAUDE_CODE_ENABLE_TELEMETRY=1
 *   export OTEL_METRICS_EXPORTER=otlp
 *   export OTEL_LOGS_EXPORTER=otlp
 *   export OTEL_EXPORTER_OTLP_ENDPOINT=https://<project>.supabase.co/functions/v1/agent-telemetry
 *   export OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <api_key>
 */

import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── OTLP attribute extraction helpers ─────────────────────────────────────────

function attrValue(attr: { key: string; value: Record<string, unknown> }): unknown {
  const v = attr.value;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue    !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.boolValue   !== undefined) return Boolean(v.boolValue);
  if (v.arrayValue  !== undefined) return v.arrayValue;
  if (v.kvlistValue !== undefined) return v.kvlistValue;
  return null;
}

function attrsToMap(attrs: Array<{ key: string; value: Record<string, unknown> }> | undefined): Record<string, unknown> {
  if (!attrs) return {};
  return Object.fromEntries(attrs.map(a => [a.key, attrValue(a)]));
}

/** Convert nanosecond Unix timestamp string to ISO string. */
function nanoToISO(nanoStr: string | undefined): string | null {
  if (!nanoStr) return null;
  try {
    const ms = Number(BigInt(nanoStr) / 1_000_000n);
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

// ── Span normalization ─────────────────────────────────────────────────────────

interface NormalizedSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  span_name: string;
  span_kind: string | null;
  status_code: 'OK' | 'ERROR' | 'UNSET';
  status_message: string | null;
  start_time: string;
  end_time: string | null;
  gen_ai_provider_name: string | null;
  gen_ai_request_model: string | null;
  gen_ai_operation_name: string | null;
  gen_ai_conversation_id: string | null;
  gen_ai_agent_name: string | null;
  gen_ai_agent_id: string | null;
  gen_ai_agent_version: string | null;
  gen_ai_usage_input_tokens: number | null;
  gen_ai_usage_output_tokens: number | null;
  tool_name: string | null;
  tool_call_id: string | null;
  mcp_server: string | null;
  data_source_id: string | null;
  retrieval_score: number | null;
  eval_score: number | null;
  had_retry: boolean;
  escalated: boolean;
  has_hallucination_flag: boolean;
  web_session_id: string | null;
  attributes: Record<string, unknown>;
  resource_attributes: Record<string, unknown>;
}

const OTLP_STATUS_MAP: Record<number, 'OK' | 'ERROR' | 'UNSET'> = {
  0: 'UNSET',
  1: 'OK',
  2: 'ERROR',
};

const OTLP_KIND_MAP: Record<number, string> = {
  0: 'INTERNAL', 1: 'SERVER', 2: 'CLIENT', 3: 'PRODUCER', 4: 'CONSUMER',
};

/** Normalize an OTLP/JSON span into the CortIQ schema. */
function normalizeOTLPSpan(
  span: Record<string, unknown>,
  resourceAttrs: Record<string, unknown>,
): NormalizedSpan {
  const attrs = attrsToMap(span.attributes as Array<{ key: string; value: Record<string, unknown> }>);

  const statusObj = span.status as Record<string, unknown> | undefined;
  const statusCode = statusObj
    ? (OTLP_STATUS_MAP[Number(statusObj.code)] ?? 'UNSET')
    : 'UNSET';

  const spanKindNum = span.kind !== undefined ? Number(span.kind) : undefined;

  // Infer gen_ai_agent_name from resource or span attributes
  const agentName = (
    (attrs['gen_ai.agent.name'] as string) ??
    (resourceAttrs['gen_ai.agent.name'] as string) ??
    (resourceAttrs['service.name'] as string) ??
    null
  );

  // Web session bridge: use gen_ai.conversation_id or cortiq.web_session_id
  const conversationId = (attrs['gen_ai.conversation_id'] as string) ?? null;
  const webSessionId   = (attrs['cortiq.web_session_id'] as string) ?? conversationId ?? null;

  // Separate known gen_ai.* attrs from raw overflow
  const knownKeys = new Set([
    'gen_ai.provider.name', 'gen_ai.request.model', 'gen_ai.operation.name',
    'gen_ai.conversation_id', 'gen_ai.agent.name', 'gen_ai.agent.id', 'gen_ai.agent.version',
    'gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens',
    'gen_ai.tool.name', 'gen_ai.tool.call.id',
    'gen_ai.data_source.id', 'gen_ai.evaluation.score',
    'cortiq.web_session_id', 'cortiq.mcp_server', 'cortiq.had_retry',
    'cortiq.escalated', 'cortiq.has_hallucination_flag', 'cortiq.retrieval_score',
  ]);
  const overflow: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!knownKeys.has(k)) overflow[k] = v;
  }

  return {
    trace_id:        String(span.traceId ?? ''),
    span_id:         String(span.spanId ?? ''),
    parent_span_id:  span.parentSpanId ? String(span.parentSpanId) : null,
    span_name:       String(span.name ?? ''),
    span_kind:       spanKindNum !== undefined ? (OTLP_KIND_MAP[spanKindNum] ?? null) : null,
    status_code:     statusCode,
    status_message:  statusObj?.message ? String(statusObj.message) : null,
    start_time:      nanoToISO(String(span.startTimeUnixNano ?? '')) ?? new Date().toISOString(),
    end_time:        nanoToISO(String(span.endTimeUnixNano ?? '')) ?? null,

    gen_ai_provider_name:      (attrs['gen_ai.provider.name'] as string) ?? null,
    gen_ai_request_model:      (attrs['gen_ai.request.model'] as string) ?? null,
    gen_ai_operation_name:     (attrs['gen_ai.operation.name'] as string) ?? null,
    gen_ai_conversation_id:    conversationId,
    gen_ai_agent_name:         agentName,
    gen_ai_agent_id:           (attrs['gen_ai.agent.id'] as string) ?? null,
    gen_ai_agent_version:      (attrs['gen_ai.agent.version'] as string) ?? null,
    gen_ai_usage_input_tokens:  attrs['gen_ai.usage.input_tokens']  != null ? Number(attrs['gen_ai.usage.input_tokens'])  : null,
    gen_ai_usage_output_tokens: attrs['gen_ai.usage.output_tokens'] != null ? Number(attrs['gen_ai.usage.output_tokens']) : null,

    tool_name:         (attrs['gen_ai.tool.name'] as string) ?? null,
    tool_call_id:      (attrs['gen_ai.tool.call.id'] as string) ?? null,
    mcp_server:        (attrs['cortiq.mcp_server'] as string) ?? null,
    data_source_id:    (attrs['gen_ai.data_source.id'] as string) ?? null,
    retrieval_score:   attrs['cortiq.retrieval_score'] != null ? Number(attrs['cortiq.retrieval_score']) : null,
    eval_score:        attrs['gen_ai.evaluation.score'] != null ? Number(attrs['gen_ai.evaluation.score']) : null,
    had_retry:         Boolean(attrs['cortiq.had_retry'] ?? false),
    escalated:         Boolean(attrs['cortiq.escalated'] ?? false),
    has_hallucination_flag: Boolean(attrs['cortiq.has_hallucination_flag'] ?? false),
    web_session_id:    webSessionId,

    attributes:          overflow,
    resource_attributes: resourceAttrs,
  };
}

/** Normalize the simplified CortIQ SDK format. */
function normalizeSimpleSpan(span: Record<string, unknown>): NormalizedSpan {
  const attrs = (span.attributes ?? {}) as Record<string, unknown>;
  const agentName = (attrs['gen_ai.agent.name'] as string) ?? (span.agent_name as string) ?? null;
  const conversationId = (attrs['gen_ai.conversation_id'] as string) ?? (span.conversation_id as string) ?? null;
  const webSessionId   = (attrs['cortiq.web_session_id'] as string) ?? (span.web_session_id as string) ?? conversationId ?? null;

  return {
    trace_id:        String(span.trace_id ?? ''),
    span_id:         String(span.span_id ?? ''),
    parent_span_id:  span.parent_span_id ? String(span.parent_span_id) : null,
    span_name:       String(span.name ?? span.span_name ?? ''),
    span_kind:       (span.span_kind as string) ?? null,
    status_code:     (['OK','ERROR','UNSET'].includes(String(span.status_code ?? ''))
      ? span.status_code as 'OK' | 'ERROR' | 'UNSET' : 'UNSET'),
    status_message:  (span.status_message as string) ?? null,
    start_time:      String(span.start_time ?? new Date().toISOString()),
    end_time:        (span.end_time as string) ?? null,

    gen_ai_provider_name:      (attrs['gen_ai.provider.name'] as string) ?? (span.provider as string) ?? null,
    gen_ai_request_model:      (attrs['gen_ai.request.model'] as string) ?? (span.model as string) ?? null,
    gen_ai_operation_name:     (attrs['gen_ai.operation.name'] as string) ?? (span.operation as string) ?? null,
    gen_ai_conversation_id:    conversationId,
    gen_ai_agent_name:         agentName,
    gen_ai_agent_id:           (attrs['gen_ai.agent.id'] as string) ?? null,
    gen_ai_agent_version:      (attrs['gen_ai.agent.version'] as string) ?? null,
    gen_ai_usage_input_tokens:  span.input_tokens  != null ? Number(span.input_tokens)  : (attrs['gen_ai.usage.input_tokens']  != null ? Number(attrs['gen_ai.usage.input_tokens'])  : null),
    gen_ai_usage_output_tokens: span.output_tokens != null ? Number(span.output_tokens) : (attrs['gen_ai.usage.output_tokens'] != null ? Number(attrs['gen_ai.usage.output_tokens']) : null),

    tool_name:         (attrs['gen_ai.tool.name'] as string) ?? (span.tool_name as string) ?? null,
    tool_call_id:      (attrs['gen_ai.tool.call.id'] as string) ?? null,
    mcp_server:        (span.mcp_server as string) ?? (attrs['cortiq.mcp_server'] as string) ?? null,
    data_source_id:    (attrs['gen_ai.data_source.id'] as string) ?? null,
    retrieval_score:   span.retrieval_score != null ? Number(span.retrieval_score) : null,
    eval_score:        span.eval_score != null ? Number(span.eval_score) : null,
    had_retry:         Boolean(span.had_retry ?? attrs['cortiq.had_retry'] ?? false),
    escalated:         Boolean(span.escalated ?? attrs['cortiq.escalated'] ?? false),
    has_hallucination_flag: Boolean(span.has_hallucination_flag ?? attrs['cortiq.has_hallucination_flag'] ?? false),
    web_session_id:    webSessionId,

    attributes:          attrs,
    resource_attributes: {},
  };
}

// ── Cost computation ──────────────────────────────────────────────────────────

async function computeCost(
  supabase: ReturnType<typeof createClient>,
  model: string | null,
  inputTokens: number | null,
  outputTokens: number | null,
): Promise<number | null> {
  if (!model || (!inputTokens && !outputTokens)) return null;
  const { data } = await supabase.rpc('compute_span_cost', {
    p_model:         model,
    p_input_tokens:  inputTokens  ?? 0,
    p_output_tokens: outputTokens ?? 0,
  });
  return data ?? null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Auth: Bearer company API key ─────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = authHeader.replace('Bearer ', '');
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, is_active')
      .eq('api_key', apiKey)
      .single();

    if (companyError || !company?.is_active) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json();
    const normalizedSpans: NormalizedSpan[] = [];
    const affectedHours = new Set<string>();

    // OTLP/HTTP JSON format
    if (Array.isArray(body.resourceSpans)) {
      for (const rs of body.resourceSpans) {
        const resourceAttrs = attrsToMap(rs.resource?.attributes);
        for (const ss of (rs.scopeSpans ?? [])) {
          for (const span of (ss.spans ?? [])) {
            normalizedSpans.push(normalizeOTLPSpan(span, resourceAttrs));
          }
        }
      }
    }
    // Simplified CortIQ format
    else if (Array.isArray(body.spans)) {
      for (const span of body.spans) {
        normalizedSpans.push(normalizeSimpleSpan(span));
      }
    }
    else {
      return new Response(JSON.stringify({ error: 'Expected resourceSpans[] or spans[]' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (normalizedSpans.length === 0) {
      return new Response(JSON.stringify({ accepted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Enrich with cost + insert ─────────────────────────────────────────
    const rows: Record<string, unknown>[] = [];

    for (const s of normalizedSpans) {
      if (!s.trace_id || !s.span_id) continue;

      const cost = await computeCost(supabase, s.gen_ai_request_model,
        s.gen_ai_usage_input_tokens, s.gen_ai_usage_output_tokens);

      rows.push({
        company_id:                 company.id,
        trace_id:                   s.trace_id,
        span_id:                    s.span_id,
        parent_span_id:             s.parent_span_id,
        span_name:                  s.span_name,
        span_kind:                  s.span_kind,
        status_code:                s.status_code,
        status_message:             s.status_message,
        start_time:                 s.start_time,
        end_time:                   s.end_time,
        gen_ai_provider_name:       s.gen_ai_provider_name,
        gen_ai_request_model:       s.gen_ai_request_model,
        gen_ai_operation_name:      s.gen_ai_operation_name,
        gen_ai_conversation_id:     s.gen_ai_conversation_id,
        gen_ai_agent_name:          s.gen_ai_agent_name,
        gen_ai_agent_id:            s.gen_ai_agent_id,
        gen_ai_agent_version:       s.gen_ai_agent_version,
        gen_ai_usage_input_tokens:  s.gen_ai_usage_input_tokens,
        gen_ai_usage_output_tokens: s.gen_ai_usage_output_tokens,
        estimated_cost_usd:         cost,
        tool_name:                  s.tool_name,
        tool_call_id:               s.tool_call_id,
        mcp_server:                 s.mcp_server,
        data_source_id:             s.data_source_id,
        retrieval_score:            s.retrieval_score,
        eval_score:                 s.eval_score,
        had_retry:                  s.had_retry,
        escalated:                  s.escalated,
        has_hallucination_flag:     s.has_hallucination_flag,
        web_session_id:             s.web_session_id,
        attributes:                 s.attributes,
        resource_attributes:        s.resource_attributes,
      });

      // Collect affected hours for stats refresh
      const hour = s.start_time.slice(0, 13) + ':00:00Z';
      affectedHours.add(hour);
    }

    // Batch upsert spans
    const { error: insertError } = await supabase
      .from('agent_spans')
      .upsert(rows, { onConflict: 'company_id,trace_id,span_id', ignoreDuplicates: false });

    if (insertError) {
      console.error('[agent-telemetry] Insert error:', insertError.message);
      return new Response(JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upsert agent_definitions for new agents (auto-register)
    const agentNames = [...new Set(normalizedSpans
      .map(s => s.gen_ai_agent_name)
      .filter(Boolean) as string[])];

    if (agentNames.length > 0) {
      await supabase.from('agent_definitions').upsert(
        agentNames.map(name => ({ company_id: company.id, agent_name: name })),
        { onConflict: 'company_id,agent_name', ignoreDuplicates: true },
      );
    }

    // Refresh hourly stats (fire-and-forget — non-critical path)
    Promise.all([...affectedHours].map(h =>
      supabase.rpc('refresh_agent_hourly_stats', {
        p_company_id: company.id,
        p_hour:       h,
      })
    )).catch(e => console.warn('[agent-telemetry] Stats refresh failed:', e));

    console.log(`[agent-telemetry] Accepted ${rows.length} spans for company ${company.id}`);

    return new Response(JSON.stringify({ accepted: rows.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[agent-telemetry] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
