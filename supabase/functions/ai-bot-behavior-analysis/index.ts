import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";
import { rangeBounds, rangeDays, validRange } from "../_shared/report-range.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { siteId } = body;
    // An explicit startDate/endDate (the dashboard date filter) wins over the legacy
    // "last N days" input.
    const range = validRange(body.startDate, body.endDate);
    const days: number = range ? rangeDays(range) : (body.days ?? 7);

    console.log('🤖 AI Bot Behavior Analysis started for site:', siteId);

    let trafficQuery = supabase
      .from('ai_bot_traffic')
      .select('*')
      .eq('site_id', siteId);
    if (range) {
      const bounds = rangeBounds(range);
      trafficQuery = trafficQuery.gte('detected_at', bounds.start).lt('detected_at', bounds.end);
    } else {
      // Fetch bot traffic from last N days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      trafficQuery = trafficQuery.gte('detected_at', startDate.toISOString());
    }

    const { data: botTraffic, error: trafficError } = await trafficQuery
      .order('detected_at', { ascending: false })
      .limit(500);

    if (trafficError) throw trafficError;

    console.log(`📊 Analyzing ${botTraffic?.length || 0} bot visits`);

    // Fetch probe signals for advanced analysis
    const { data: probeSignals, error: probeError } = await supabase
      .from('ai_bot_probe_signals')
      .select('*')
      .in('traffic_id', (botTraffic || []).map(t => t.id));

    if (probeError) console.error('Probe signals error:', probeError);

    // Prepare data summary for AI analysis
    const botSummary = {
      totalVisits: botTraffic?.length || 0,
      uniqueBots: [...new Set((botTraffic || []).map(t => t.bot_name))].length,
      botTypes: botTraffic?.reduce((acc: Record<string, number>, t) => {
        acc[t.bot_type] = (acc[t.bot_type] || 0) + 1;
        return acc;
      }, {}),
      requestTypes: botTraffic?.reduce((acc: Record<string, number>, t) => {
        acc[t.request_type] = (acc[t.request_type] || 0) + 1;
        return acc;
      }, {}),
      jsExecutionRate: botTraffic?.filter(t => t.js_executed).length || 0,
      probeTriggeredCount: probeSignals?.length || 0,
      topUrls: botTraffic?.reduce((acc: Record<string, number>, t) => {
        acc[t.url] = (acc[t.url] || 0) + 1;
        return acc;
      }, {}),
      suspiciousSignals: {
        webdriverDetected: probeSignals?.filter(p => p.webdriver_detected).length || 0,
        headlessDetected: probeSignals?.filter(p => p.headless_detected).length || 0,
        automationSignals: probeSignals?.filter(p => 
          Object.values(p.automation_signals || {}).filter(v => v === true).length > 2
        ).length || 0,
      },
      ipPatterns: botTraffic?.reduce((acc: Record<string, number>, t) => {
        const ipPrefix = t.ip_address?.split('.').slice(0, 2).join('.') || 'unknown';
        acc[ipPrefix] = (acc[ipPrefix] || 0) + 1;
        return acc;
      }, {}),
    };

    // Advanced threat scoring
    const threatIndicators = {
      rapidFireRequests: calculateRapidFireScore(botTraffic || []),
      ipConcentration: calculateIPConcentration(botSummary.ipPatterns),
      urlScanningPattern: calculateURLScanningPattern(botSummary.topUrls),
      automationScore: (botSummary.suspiciousSignals.automationSignals / Math.max(1, botSummary.totalVisits)) * 100,
      headlessRatio: (botSummary.suspiciousSignals.headlessDetected / Math.max(1, botSummary.totalVisits)) * 100,
    };

    const overallThreatScore = calculateOverallThreatScore(threatIndicators);

    console.log('🎯 Threat Score:', overallThreatScore, 'Indicators:', threatIndicators);

    // Call Lovable AI for behavioral analysis and recommendations
    const aiPrompt = `Analyze this AI bot traffic data and provide cybersecurity insights:

**Traffic Summary:**
- Total Bot Visits: ${botSummary.totalVisits}
- Unique Bots: ${botSummary.uniqueBots}
- Bot Types: ${JSON.stringify(botSummary.botTypes)}
- Request Types: ${JSON.stringify(botSummary.requestTypes)}
- JS Execution Rate: ${((botSummary.jsExecutionRate / Math.max(1, botSummary.totalVisits)) * 100).toFixed(1)}%

**Security Indicators:**
- Webdriver Detected: ${botSummary.suspiciousSignals.webdriverDetected}
- Headless Browsers: ${botSummary.suspiciousSignals.headlessDetected}
- Automation Signals: ${botSummary.suspiciousSignals.automationSignals}

**Threat Analysis:**
- Rapid Fire Score: ${threatIndicators.rapidFireRequests.toFixed(1)}
- IP Concentration: ${threatIndicators.ipConcentration.toFixed(1)}
- URL Scanning Pattern: ${threatIndicators.urlScanningPattern.toFixed(1)}
- Automation Score: ${threatIndicators.automationScore.toFixed(1)}%
- Headless Ratio: ${threatIndicators.headlessRatio.toFixed(1)}%
- **Overall Threat Score: ${overallThreatScore.toFixed(1)}/100**

**Top URLs Targeted:**
${Object.entries(botSummary.topUrls)
  .sort((a, b) => (b[1] as number) - (a[1] as number))
  .slice(0, 10)
  .map(([url, count]) => `- ${url}: ${count} visits`)
  .join('\\n')}

Provide:
1. **Behavior Pattern Analysis**: What patterns do you see? Good bots vs malicious?
2. **Security Assessment**: Is this normal AI training/citation traffic or potential threat?
3. **Specific Threats**: Identify any concerning patterns (scraping, DDoS, data extraction)
4. **Actionable Recommendations**: What should the site owner do? (Block IPs, rate limiting, robots.txt updates, etc.)
5. **Business Impact**: How might this affect SEO, AI citations, and website performance?

Keep response structured and actionable. Focus on Swedish market context.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a cybersecurity and AI bot traffic expert. Analyze bot behavior patterns and provide actionable security recommendations. Focus on identifying legitimate AI training/citation traffic vs malicious scraping/DDoS attempts.',
          },
          {
            role: 'user',
            content: aiPrompt,
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API Error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log('✅ AI Analysis Complete');

    // Store analysis in database
    const { data: analysisRecord, error: insertError } = await supabase
      .from('ai_bot_analysis')
      .insert({
        site_id: siteId,
        analysis_period_days: days,
        total_visits: botSummary.totalVisits,
        unique_bots: botSummary.uniqueBots,
        threat_score: overallThreatScore,
        threat_indicators: threatIndicators,
        bot_breakdown: botSummary.botTypes,
        ai_analysis: analysis,
        recommendations_generated: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing analysis:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: botSummary,
        threatScore: overallThreatScore,
        threatIndicators,
        aiAnalysis: analysis,
        analysisId: analysisRecord?.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-bot-behavior-analysis:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to calculate rapid fire score
function calculateRapidFireScore(traffic: any[]): number {
  if (traffic.length < 2) return 0;

  const timestamps = traffic.map(t => new Date(t.detected_at).getTime()).sort((a, b) => a - b);
  const intervals = [];

  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const oneMinute = 60 * 1000;

  // Score 0-100: Lower interval = higher score (more rapid fire)
  if (avgInterval < oneMinute) {
    return Math.min(100, (oneMinute / avgInterval) * 20);
  }

  return Math.max(0, 100 - (avgInterval / oneMinute) * 10);
}

// Helper function to calculate IP concentration
function calculateIPConcentration(ipPatterns: Record<string, number>): number {
  const values = Object.values(ipPatterns);
  if (values.length === 0) return 0;

  const total = values.reduce((a, b) => a + b, 0);
  const maxFromSingleIP = Math.max(...values);

  // Score 0-100: Higher concentration = higher score
  return (maxFromSingleIP / total) * 100;
}

// Helper function to calculate URL scanning pattern
function calculateURLScanningPattern(urlCounts: Record<string, number>): number {
  const uniqueUrls = Object.keys(urlCounts).length;
  const totalVisits = Object.values(urlCounts).reduce((a, b) => a + b, 0);

  if (totalVisits === 0) return 0;

  // Score 0-100: More unique URLs relative to visits = higher scanning score
  const ratio = uniqueUrls / totalVisits;
  return Math.min(100, ratio * 200); // Amplify for sensitivity
}

// Helper function to calculate overall threat score
function calculateOverallThreatScore(indicators: {
  rapidFireRequests: number;
  ipConcentration: number;
  urlScanningPattern: number;
  automationScore: number;
  headlessRatio: number;
}): number {
  // Weighted average
  const weights = {
    rapidFireRequests: 0.25,
    ipConcentration: 0.15,
    urlScanningPattern: 0.2,
    automationScore: 0.2,
    headlessRatio: 0.2,
  };

  return (
    indicators.rapidFireRequests * weights.rapidFireRequests +
    indicators.ipConcentration * weights.ipConcentration +
    indicators.urlScanningPattern * weights.urlScanningPattern +
    indicators.automationScore * weights.automationScore +
    indicators.headlessRatio * weights.headlessRatio
  );
}
