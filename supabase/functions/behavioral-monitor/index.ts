import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Denna function körs automatiskt för att övervaka alla aktiva sajter
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting automated behavioral monitoring...');

    // Hämta alla aktiva sajter
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id, site_name, user_id')
      .eq('is_active', true);

    if (sitesError) {
      console.error('Error fetching sites:', sitesError);
      throw sitesError;
    }

    if (!sites || sites.length === 0) {
      console.log('No active sites found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active sites to monitor' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Monitoring ${sites.length} active sites`);

    const results = {
      sitesMonitored: sites.length,
      totalIncidents: 0,
      criticalIncidents: 0,
      sitesWithIncidents: 0,
      monitoringTime: new Date().toISOString()
    };

    // Övervaka varje sajt
    for (const site of sites) {
      try {
        console.log(`Monitoring site: ${site.site_name} (${site.id})`);
        
        // Kör behavioral analysis för sajten
        const { data: analysisResult, error: analysisError } = await supabase.functions.invoke(
          'behavioral-analysis',
          {
            body: { siteId: site.id }
          }
        );

        if (analysisError) {
          console.error(`Error analyzing site ${site.id}:`, analysisError);
          continue;
        }

        if (analysisResult?.results) {
          const siteResults = analysisResult.results;
          results.totalIncidents += siteResults.incidentsCreated || 0;
          
          if (siteResults.incidentsCreated > 0) {
            results.sitesWithIncidents++;
            
            // Kontrollera om det finns kritiska incidenter
            const { data: criticalIncidents } = await supabase
              .from('behavioral_incidents')
              .select('id')
              .eq('site_id', site.id)
              .eq('severity', 'critical')
              .eq('status', 'open')
              .gte('detected_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // senaste timmen

            results.criticalIncidents += criticalIncidents?.length || 0;
          }
        }

        // Lägg till en liten fördröjning för att inte överbelasta systemet
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error monitoring site ${site.id}:`, error);
      }
    }

    // Skicka sammanfattning via email om det finns kritiska incidenter
    if (results.criticalIncidents > 0) {
      console.log(`CRITICAL: ${results.criticalIncidents} critical incidents detected!`);
      // Här kan vi lägga till email-notifikationer i framtiden
    }

    console.log('Monitoring completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in behavioral monitoring:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});