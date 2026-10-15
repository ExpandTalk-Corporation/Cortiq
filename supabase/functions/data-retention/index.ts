import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      // Delegate to the single authoritative retention routine (run_data_retention),
      // which applies each site's own gdpr_settings.data_retention_days (default 730),
      // scopes deletes correctly, and wraps every table separately.
      //
      // This function previously ran its own hardcoded 30-day GLOBAL purge with no
      // per-site scoping, which both contradicted the 730-day cron and risked deleting
      // real customers' data prematurely. It now shares one source of truth.
      const { data, error } = await supabase.rpc('run_data_retention');
      if (error) throw error;

      console.log('Data retention cleanup completed:', data);

      return new Response(JSON.stringify({ success: true, deletedRecords: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Data retention error:', error);
      return new Response(JSON.stringify({ error: 'Data retention failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});