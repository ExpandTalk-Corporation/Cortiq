import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      siteId, 
      conversionData, 
      gaEventName,
      eventValue 
    } = await req.json();

    console.log('Processing GA4 conversion sync:', { siteId, gaEventName, eventValue });

    // 1. Hämta site configuration med GA4 Measurement ID
    const { data: siteData, error: siteError } = await supabase
      .from('sites')
      .select('ga_measurement_id, conversion_goals')
      .eq('id', siteId)
      .single();

    if (siteError || !siteData?.ga_measurement_id) {
      throw new Error('GA4 Measurement ID not configured for this site');
    }

    const measurementId = siteData.ga_measurement_id;
    
    // 2. Skicka conversion event till GA4 via Measurement Protocol
    const ga4Response = await sendToGA4({
      measurementId,
      clientId: conversionData.session_id || 'anonymous',
      eventName: gaEventName,
      eventParameters: {
        currency: 'SEK',
        value: eventValue || 0,
        event_category: 'conversion',
        event_label: conversionData.event_name,
        page_location: conversionData.page_url || '',
        custom_parameter_1: conversionData.element_selector || '',
        conversion_source: 'heatmap_system'
      }
    });

    // 3. Spara till vår egen conversion_events tabell
    const { error: conversionError } = await supabase
      .from('conversion_events')
      .insert({
        site_id: siteId,
        session_id: conversionData.session_id,
        event_type: conversionData.event_type,
        event_name: conversionData.event_name,
        event_value: eventValue,
        element_selector: conversionData.element_selector,
        form_data: conversionData.form_data || null
      });

    if (conversionError) {
      console.error('Error saving conversion event:', conversionError);
    }

    // 4. Logga resultatet
    console.log('GA4 sync completed:', {
      ga4_response_status: ga4Response.status,
      conversion_saved: !conversionError
    });

    return new Response(JSON.stringify({
      success: true,
      ga4_sent: ga4Response.status === 204,
      conversion_saved: !conversionError,
      message: 'Conversion synced to GA4 and saved locally'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ga4-conversion-sync:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Funktion för att skicka events till GA4 Measurement Protocol
async function sendToGA4({
  measurementId,
  clientId,
  eventName,
  eventParameters
}: {
  measurementId: string;
  clientId: string;
  eventName: string;
  eventParameters: Record<string, any>;
}) {
  const ga4Endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${Deno.env.get('GA4_API_SECRET') || 'default'}`;
  
  const payload = {
    client_id: clientId,
    events: [{
      name: eventName,
      parameters: eventParameters
    }]
  };

  console.log('Sending to GA4:', { endpoint: ga4Endpoint, payload });

  return await fetch(ga4Endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
}