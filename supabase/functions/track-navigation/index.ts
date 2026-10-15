import { createClient } from '../_shared/supabase.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      site_id, 
      menu_item_id, 
      menu_title, 
      menu_url, 
      device_type = 'desktop',
      timestamp 
    } = await req.json();

    if (!site_id || !menu_item_id || !menu_title || !menu_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: site_id, menu_item_id, menu_title, menu_url' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get current date for tracking
    const currentDate = new Date().toISOString().split('T')[0];

    console.log(`Tracking navigation click: ${menu_title} (${menu_item_id}) for site ${site_id}`);

    // Use the increment function to update navigation analytics
    const { error: incrementError } = await supabase.rpc('increment_navigation_clicks', {
      p_site_id: site_id,
      p_menu_item_id: menu_item_id,
      p_menu_title: menu_title,
      p_menu_url: menu_url,
      p_device_type: device_type,
      p_date: currentDate
    });

    if (incrementError) {
      console.error('Error incrementing navigation clicks:', incrementError);
      return new Response(
        JSON.stringify({ error: 'Failed to track navigation click' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Successfully tracked navigation click for menu item ${menu_item_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Navigation click tracked successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Navigation tracking error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});