import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";

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

    console.log('Starting GDPR data cleanup...');

    // Get current date for retention calculations
    const now = new Date();
    
    // Clean up old cookie consents (older than 2 years)
    const consentRetentionDate = new Date(now.getTime() - (2 * 365 * 24 * 60 * 60 * 1000));
    
    const { data: deletedConsents, error: consentError } = await supabase
      .from('cookie_consents')
      .delete()
      .lt('created_at', consentRetentionDate.toISOString());

    if (consentError) {
      console.error('Error cleaning up consents:', consentError);
    } else {
      console.log(`Cleaned up old cookie consents older than ${consentRetentionDate.toISOString()}`);
    }

    // Clean up old data requests (older than 3 years or already processed and older than 1 year)
    const requestRetentionDate = new Date(now.getTime() - (3 * 365 * 24 * 60 * 60 * 1000));
    const processedRetentionDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
    
    const { data: deletedRequests, error: requestError } = await supabase
      .from('data_requests')
      .delete()
      .or(`created_at.lt.${requestRetentionDate.toISOString()},and(status.eq.completed,processed_at.lt.${processedRetentionDate.toISOString()})`);

    if (requestError) {
      console.error('Error cleaning up data requests:', requestError);
    } else {
      console.log(`Cleaned up old data requests`);
    }

    // Clean up expired consent validations (older than 30 days)
    const validationRetentionDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const { data: deletedValidations, error: validationError } = await supabase
      .from('consent_validations')
      .delete()
      .lt('created_at', validationRetentionDate.toISOString());

    if (validationError) {
      console.error('Error cleaning up consent validations:', validationError);
    } else {
      console.log(`Cleaned up old consent validations older than ${validationRetentionDate.toISOString()}`);
    }

    // Clean up old tracking data based on site-specific retention settings
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select(`
        id,
        gdpr_settings!inner(data_retention_days)
      `);

    if (sitesError) {
      console.error('Error fetching sites for data cleanup:', sitesError);
    } else {
      for (const site of sites) {
        const retentionDays = site.gdpr_settings?.data_retention_days || 365;
        const siteRetentionDate = new Date(now.getTime() - (retentionDays * 24 * 60 * 60 * 1000));
        
        // Clean tracking sessions
        await supabase
          .from('tracking_sessions')
          .delete()
          .eq('site_id', site.id)
          .lt('started_at', siteRetentionDate.toISOString());
          
        // Clean heatmap data
        await supabase
          .from('heatmap_data')
          .delete()
          .eq('site_id', site.id)
          .lt('created_at', siteRetentionDate.toISOString());
          
        // Clean form sessions
        await supabase
          .from('form_sessions')
          .delete()
          .eq('site_id', site.id)
          .lt('created_at', siteRetentionDate.toISOString());
          
        // Clean page views
        await supabase
          .from('page_views')
          .delete()
          .eq('site_id', site.id)
          .lt('viewed_at', siteRetentionDate.toISOString());
          
        console.log(`Cleaned up tracking data for site ${site.id} older than ${retentionDays} days`);
      }
    }

    // Clean up old dashboard insights (older than 90 days)
    const insightRetentionDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    await supabase
      .from('dashboard_insights')
      .delete()
      .or(`expires_at.lt.${now.toISOString()},created_at.lt.${insightRetentionDate.toISOString()}`);

    console.log('GDPR data cleanup completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'GDPR data cleanup completed',
        timestamp: now.toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in data cleanup:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Data cleanup failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});