import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: user } = await supabase.auth.getUser(token);
    
    if (!user.user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { siteId, funnelId, startDate, endDate } = await req.json();

    // Verify site ownership
    const { data: site } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .eq('user_id', user.user.id)
      .single();

    if (!site) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get funnel definition
    const { data: funnel } = await supabase
      .from('funnels')
      .select('*')
      .eq('id', funnelId)
      .single();

    if (!funnel) {
      return new Response(JSON.stringify({ error: 'Funnel not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all sessions in date range
    const { data: sessions } = await supabase
      .from('tracking_sessions')
      .select('session_id, created_at')
      .eq('site_id', siteId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        funnel,
        steps: [],
        totalSessions: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Analyze funnel progression
    const steps = funnel.steps as any[];
    const stepResults = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let sessionsEntered = 0;
      let sessionsCompleted = 0;

      for (const session of sessions) {
        // Check if session completed this step
        const { data: pageViews } = await supabase
          .from('page_views')
          .select('url')
          .eq('session_id', session.session_id)
          .ilike('url', `%${step.url}%`)
          .limit(1);

        if (pageViews && pageViews.length > 0) {
          sessionsEntered++;
          
          // Check if completed next step (or all steps if last)
          if (i < steps.length - 1) {
            const nextStep = steps[i + 1];
            const { data: nextViews } = await supabase
              .from('page_views')
              .select('url')
              .eq('session_id', session.session_id)
              .ilike('url', `%${nextStep.url}%`)
              .limit(1);
            
            if (nextViews && nextViews.length > 0) {
              sessionsCompleted++;
            }
          } else {
            // Last step - check for conversion
            sessionsCompleted++;
          }
        }
      }

      const dropOffRate = sessionsEntered > 0
        ? ((sessionsEntered - sessionsCompleted) / sessionsEntered) * 100
        : 0;

      stepResults.push({
        stepIndex: i,
        stepName: step.name,
        stepUrl: step.url,
        sessionsEntered,
        sessionsCompleted,
        dropOffRate: Number(dropOffRate.toFixed(2)),
        completionRate: sessionsEntered > 0 
          ? Number(((sessionsCompleted / sessionsEntered) * 100).toFixed(2)) 
          : 0
      });

      // Save analytics
      await supabase
        .from('funnel_analytics')
        .upsert({
          funnel_id: funnelId,
          site_id: siteId,
          step_index: i,
          step_name: step.name,
          sessions_entered: sessionsEntered,
          sessions_completed: sessionsCompleted,
          drop_off_rate: dropOffRate,
          date: new Date().toISOString().split('T')[0]
        }, {
          onConflict: 'funnel_id,step_index,date'
        });
    }

    return new Response(JSON.stringify({
      success: true,
      funnel: {
        id: funnel.id,
        name: funnel.funnel_name,
        steps: funnel.steps
      },
      analysis: stepResults,
      totalSessions: sessions.length,
      overallConversionRate: stepResults.length > 0 && stepResults[0].sessionsEntered > 0
        ? Number(((stepResults[stepResults.length - 1].sessionsCompleted / stepResults[0].sessionsEntered) * 100).toFixed(2))
        : 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Funnel analyzer error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
