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

    const { site_id, navigation_data } = await req.json();

    if (!site_id || !navigation_data || !Array.isArray(navigation_data)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: site_id, navigation_data' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Syncing ${navigation_data.length} navigation items for site ${site_id}`);

    // First, mark all existing menu items as inactive for this site
    const { error: deactivateError } = await supabase
      .from('navigation_menus')
      .update({ is_active: false })
      .eq('site_id', site_id);

    if (deactivateError) {
      console.error('Error deactivating existing menus:', deactivateError);
      return new Response(
        JSON.stringify({ error: 'Failed to deactivate existing menus' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Then insert or update navigation menu items
    const menuPromises = navigation_data.map(async (item) => {
      const menuData = {
        site_id,
        menu_item_id: item.menu_item_id,
        menu_title: item.menu_title,
        menu_url: item.menu_url,
        menu_order: item.menu_order || 0,
        parent_id: item.parent_id || 0,
        css_classes: item.css_classes || [],
        menu_location: item.menu_location || 'primary',
        is_active: true
      };

      // Try to update existing menu item first
      const { data: existingMenu, error: fetchError } = await supabase
        .from('navigation_menus')
        .select('id')
        .eq('site_id', site_id)
        .eq('menu_item_id', item.menu_item_id)
        .single();

      if (existingMenu && !fetchError) {
        // Update existing menu item
        const { error: updateError } = await supabase
          .from('navigation_menus')
          .update(menuData)
          .eq('id', existingMenu.id);

        if (updateError) {
          console.error('Error updating menu item:', updateError);
          throw updateError;
        }
      } else {
        // Insert new menu item
        const { error: insertError } = await supabase
          .from('navigation_menus')
          .insert(menuData);

        if (insertError) {
          console.error('Error inserting menu item:', insertError);
          throw insertError;
        }
      }
    });

    // Wait for all menu operations to complete
    await Promise.all(menuPromises);

    // Clean up inactive menu items (optional - remove old items that are no longer in the menu)
    const { error: cleanupError } = await supabase
      .from('navigation_menus')
      .delete()
      .eq('site_id', site_id)
      .eq('is_active', false);

    if (cleanupError) {
      console.warn('Warning: Failed to clean up inactive menu items:', cleanupError);
    }

    console.log(`Successfully synced navigation for site ${site_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Navigation data synced successfully',
        items_synced: navigation_data.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Navigation sync error:', error);
    
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