import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";
import { assertSafeUrl } from "../_shared/safe-url.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Browserless v2 (same account/region as tracking-check). The legacy chrome.browserless.io
// host and v1 options (quality on PNG, waitFor) fail, which left every heatmap with a placeholder.
const BROWSERLESS_API_KEY = Deno.env.get('BROWSERLESS_API_KEY');
const BROWSERLESS_URL = (Deno.env.get('BROWSERLESS_URL') || 'https://production-ams.browserless.io').replace(/\/$/, '');

serve(async (req) => {
  console.log('=== Take Screenshot Function Started ===');
  console.log('Request method:', req.method);
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Function is running');
    const { url, siteId, deviceType = 'desktop' } = await req.json();
    console.log('Request data:', { url, siteId, deviceType });

    if (!url || !siteId) {
      console.log('Missing required fields');
      return new Response(
        JSON.stringify({ error: 'URL and siteId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Only the site's owner may screenshot for it: this client writes sites.screenshot_urls
    // with the service role, so the caller's JWT is verified and ownership checked first.
    // The token is passed to getUser() explicitly: the client has no session of its own.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    const { data: ownedSite } = user
      ? await supabase.from('sites').select('id').eq('id', siteId).eq('user_id', user.id).maybeSingle()
      : { data: null };
    if (!ownedSite) {
      return new Response(
        JSON.stringify({ error: 'Not authorised for this site' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    try {
      await assertSafeUrl(url);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: (e as Error).message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Set viewport dimensions based on device type
    const viewports = {
      mobile: { width: 375, height: 667 },
      tablet: { width: 768, height: 1024 },
      desktop: { width: 1920, height: 1080 },
      all: { width: 1920, height: 1080 }
    };

    const viewport = viewports[deviceType as keyof typeof viewports] || viewports.desktop;

    console.log('Taking screenshot using Browserless API...');
    
    let screenshotBuffer: ArrayBuffer;
    let screenshotSuccess = false;

    try {
      if (!BROWSERLESS_API_KEY) {
        throw new Error('BROWSERLESS_API_KEY not configured');
      }

      // Use Browserless API for screenshots
      const browserlessUrl = `${BROWSERLESS_URL}/screenshot?token=${encodeURIComponent(BROWSERLESS_API_KEY)}&timeout=60000`;
      const screenshotData = {
        url: url,
        options: { fullPage: true, type: 'png' },
        viewport: { width: viewport.width, height: viewport.height },
        gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 },
        waitForTimeout: 1500,
      };
      
      console.log(`Calling Browserless API for: ${url}`);
      
      const screenshotResponse = await fetch(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(screenshotData),
        signal: AbortSignal.timeout(70_000),
      });
      
      if (screenshotResponse.ok) {
        screenshotBuffer = await screenshotResponse.arrayBuffer();
        screenshotSuccess = true;
        console.log('Browserless API succeeded');
      } else {
        const errorText = await screenshotResponse.text();
        console.log('Browserless API failed with status:', screenshotResponse.status, 'Error:', errorText);
        throw new Error(`Browserless API failed: ${screenshotResponse.status}`);
      }
    } catch (error) {
      // Report the failure instead of saving a placeholder over an existing screenshot.
      console.log('Screenshot API error:', (error as Error).message);
      return new Response(
        JSON.stringify({ error: `Screenshot failed: ${(error as Error).message}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Screenshot/placeholder ready, uploading to Supabase Storage...');

    // Generate filename
    const urlHost = new URL(url).hostname;
    const urlPath = new URL(url).pathname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const filename = `${urlHost}${urlPath}_${deviceType}_${Date.now()}.${screenshotSuccess ? 'png' : 'svg'}`;
    const filePath = `${siteId}/${filename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('page-screenshots')
      .upload(filePath, screenshotBuffer, {
        contentType: screenshotSuccess ? 'image/png' : 'image/svg+xml',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading screenshot:', uploadError);
      throw new Error(`Failed to upload screenshot: ${uploadError.message}`);
    }

    // Generate public URL
    const { data: urlData } = supabase.storage
      .from('page-screenshots')
      .getPublicUrl(filePath);

    const screenshotUrl = urlData.publicUrl;

    console.log('Screenshot uploaded successfully:', screenshotUrl);

    // Create a clean, simple screenshot data structure to avoid serialization issues
    const screenshotData = {
      url: screenshotUrl,
      filename: filename,
      timestamp: new Date().toISOString(),
      viewport_width: viewport.width,
      viewport_height: viewport.height,
      placeholder: !screenshotSuccess
    };

    // Update site's screenshot_urls with clean data structure
    const { data: siteData, error: siteError } = await supabase
      .from('sites')
      .select('screenshot_urls')
      .eq('id', siteId)
      .single();

    const currentScreenshots = siteData?.screenshot_urls || {};
    
    // Ensure clean structure without deep nesting
    const updatedScreenshots = {
      ...currentScreenshots,
      [url]: {
        ...(currentScreenshots[url] || {}),
        [deviceType]: screenshotData
      }
    };

    const { error: updateError } = await supabase
      .from('sites')
      .update({ screenshot_urls: updatedScreenshots })
      .eq('id', siteId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error(`Failed to update site: ${updateError.message}`);
    }

    console.log('Screenshot/placeholder saved successfully');

    return new Response(
      JSON.stringify({
        success: true,
        screenshotUrl: screenshotUrl,
        filename: filename,
        deviceType: deviceType,
        viewport: viewport,
        isPlaceholder: !screenshotSuccess,
        message: screenshotSuccess ? 'Screenshot taken and saved successfully' : 'Placeholder created and saved'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Screenshot function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});