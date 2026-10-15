import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  test_id: string;
  variant_id: string;
  sessions: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
}

interface StatisticalResult {
  statistical_significance: number;
  confidence_interval_lower: number;
  confidence_interval_upper: number;
  p_value: number;
}

function calculateStatistics(controlResult: TestResult, variantResult: TestResult): StatisticalResult {
  const n_a = controlResult.sessions;
  const n_b = variantResult.sessions;
  const x_a = controlResult.conversions;
  const x_b = variantResult.conversions;
  
  const p_a = x_a / n_a;
  const p_b = x_b / n_b;
  
  // Pooled standard error for two-proportion z-test
  const p_pooled = (x_a + x_b) / (n_a + n_b);
  const se_pooled = Math.sqrt(p_pooled * (1 - p_pooled) * (1/n_a + 1/n_b));
  
  // Z-score calculation
  const z_score = Math.abs(p_b - p_a) / se_pooled;
  
  // P-value approximation (two-tailed test)
  const p_value = 2 * (1 - normalCDF(z_score));
  
  // Statistical significance
  const statistical_significance = (1 - p_value) * 100;
  
  // 95% Confidence interval for the difference
  const z_critical = 1.96; // 95% confidence
  const se_diff = Math.sqrt((p_a * (1 - p_a)) / n_a + (p_b * (1 - p_b)) / n_b);
  
  const ci_margin = z_critical * se_diff;
  const difference = p_b - p_a;
  
  return {
    statistical_significance: Math.max(0, statistical_significance),
    confidence_interval_lower: (difference - ci_margin) * 100,
    confidence_interval_upper: (difference + ci_margin) * 100,
    p_value
  };
}

function normalCDF(z: number): number {
  return (1 + erf(z / Math.sqrt(2))) / 2;
}

function erf(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting A/B test calculations...');

    // Get all running tests
    const { data: runningTests, error: testsError } = await supabase
      .from('ab_tests')
      .select('id, site_id')
      .eq('test_status', 'running');

    if (testsError) {
      throw testsError;
    }

    console.log(`Found ${runningTests.length} running tests`);

    for (const test of runningTests) {
      console.log(`Processing test ${test.id}...`);
      
      // Get test variants
      const { data: variants, error: variantsError } = await supabase
        .from('ab_test_variants')
        .select('id, is_control')
        .eq('test_id', test.id);

      if (variantsError || !variants || variants.length < 2) {
        console.log(`Skipping test ${test.id} - invalid variants`);
        continue;
      }

      const controlVariant = variants.find(v => v.is_control);
      const testVariant = variants.find(v => !v.is_control);

      if (!controlVariant || !testVariant) {
        console.log(`Skipping test ${test.id} - missing control or test variant`);
        continue;
      }

      // Calculate results for each variant
      const variantResults: TestResult[] = [];

      for (const variant of [controlVariant, testVariant]) {
        // Get sessions assigned to this variant
        const { data: assignments, error: assignmentsError } = await supabase
          .from('ab_test_assignments')
          .select('session_id')
          .eq('test_id', test.id)
          .eq('variant_id', variant.id);

        if (assignmentsError) {
          console.error(`Error fetching assignments for variant ${variant.id}:`, assignmentsError);
          continue;
        }

        const sessionIds = assignments.map(a => a.session_id);
        const sessions = sessionIds.length;

        if (sessions === 0) {
          variantResults.push({
            test_id: test.id,
            variant_id: variant.id,
            sessions: 0,
            conversions: 0,
            conversion_rate: 0,
            revenue: 0
          });
          continue;
        }

        // Count conversions for these sessions
        const { data: conversions, error: conversionsError } = await supabase
          .from('conversion_events')
          .select('event_value')
          .eq('site_id', test.site_id)
          .in('session_id', sessionIds);

        if (conversionsError) {
          console.error(`Error fetching conversions for variant ${variant.id}:`, conversionsError);
          continue;
        }

        const conversionCount = conversions.length;
        const totalRevenue = conversions
          .filter(c => c.event_value)
          .reduce((sum, c) => sum + (c.event_value || 0), 0);

        const conversionRate = sessions > 0 ? (conversionCount / sessions) * 100 : 0;

        variantResults.push({
          test_id: test.id,
          variant_id: variant.id,
          sessions,
          conversions: conversionCount,
          conversion_rate: conversionRate,
          revenue: totalRevenue
        });
      }

      if (variantResults.length === 2) {
        const controlResult = variantResults.find(r => r.variant_id === controlVariant.id);
        const testResult = variantResults.find(r => r.variant_id === testVariant.id);

        if (controlResult && testResult && controlResult.sessions > 0 && testResult.sessions > 0) {
          // Calculate statistical significance
          const stats = calculateStatistics(controlResult, testResult);

          // Update or insert results for both variants
          for (const result of variantResults) {
            const resultData = {
              test_id: test.id,
              variant_id: result.variant_id,
              site_id: test.site_id,
              sessions: result.sessions,
              conversions: result.conversions,
              conversion_rate: result.conversion_rate,
              revenue: result.revenue,
              statistical_significance: stats.statistical_significance,
              confidence_interval_lower: stats.confidence_interval_lower,
              confidence_interval_upper: stats.confidence_interval_upper,
              p_value: stats.p_value,
              date: new Date().toISOString().split('T')[0]
            };

            const { error: upsertError } = await supabase
              .from('ab_test_results')
              .upsert(resultData, {
                onConflict: 'test_id,variant_id,date'
              });

            if (upsertError) {
              console.error(`Error upserting results for variant ${result.variant_id}:`, upsertError);
            }
          }

          console.log(`Updated results for test ${test.id}`);
        }
      }
    }

    console.log('A/B test calculations completed');

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed_tests: runningTests.length,
        message: 'A/B test calculations completed successfully' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in A/B test calculator:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});