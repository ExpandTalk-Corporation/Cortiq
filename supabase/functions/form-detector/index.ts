import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertSafeUrl } from '../_shared/safe-url.ts';
import { detectForms } from '../_shared/form-detection.ts';
import { detectSentriskForms } from '../_shared/sentrisk-forms.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FormDetectorRequest {
  siteId: string;
  url: string;
  htmlContent?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Form Detector function started');
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { siteId, url, htmlContent }: FormDetectorRequest = await req.json();
    console.log(`Detecting forms for site: ${siteId} on URL: ${url}`);

    let html = htmlContent;

    // If no HTML was supplied, fetch it — but only after SSRF validation, with a
    // timeout and a response-size cap to prevent memory exhaustion.
    if (!html && url) {
      try {
        const safeUrl = await assertSafeUrl(url);
        const response = await fetch(safeUrl.toString(), {
          redirect: 'error', // don't follow redirects into private space
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'CortIQ-FormDetector/1.0' },
        });
        const MAX_BYTES = 2_000_000; // 2 MB
        const buf = new Uint8Array(await response.arrayBuffer());
        html = new TextDecoder().decode(buf.slice(0, MAX_BYTES));
      } catch (error) {
        console.error('Error fetching HTML:', error?.message ?? error);
        return new Response(
          JSON.stringify({ error: 'Could not fetch page HTML' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!html) {
      return new Response(
        JSON.stringify({ error: 'No HTML content provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const detectedForms: any[] = [];

    // HubSpot and Gravity Forms detection is shared with Tracking Check.
    const METHOD_LABEL = { hs_context: 'hs_context_scan', data_form_id: 'data-form-id_scan', embed_script: 'embed_script_scan', gravity_class: 'gravity_class_scan' } as const;
    for (const hit of detectForms(html)) {
      const isHubSpot = hit.provider === 'hubspot';
      const formId = isHubSpot ? hit.formId : `gf_${hit.formId}`;
      detectedForms.push({
        form_id: formId,
        form_guid: formId,
        form_name: isHubSpot ? `HubSpot Form (${hit.formId.slice(0, 8)}...)` : `Gravity Form ${hit.formId}`,
        form_type: isHubSpot ? 'hubspot' : 'gravity',
        form_url: url,
        site_id: siteId,
        detection_method: METHOD_LABEL[hit.method],
        last_detected: new Date().toISOString(),
      });
    }

    // Detektera Contact Form 7
    const cf7Matches = html.match(/\[contact-form-7[^\]]*id="([^"]*)"[^\]]*title="([^"]*)"/g);
    if (cf7Matches) {
      for (const match of cf7Matches) {
        const idMatch = match.match(/id="([^"]*)"/);
        const titleMatch = match.match(/title="([^"]*)"/);
        
        if (idMatch && titleMatch) {
          const formId = `cf7_${idMatch[1]}`;
          const formName = titleMatch[1];
          
          detectedForms.push({
            form_id: formId,
            form_name: formName,
            form_type: 'contact_form_7',
            form_url: url,
            site_id: siteId,
            detection_method: 'shortcode_scan',
            last_detected: new Date().toISOString()
          });
          
          console.log(`Detected Contact Form 7: ${formName} (${formId})`);
        }
      }
    }

    // SentriSK forms (formerly Traffikboost): a cross-origin iframe to sentrisk.se/embed/<uuid>.
    // form_id matches what the tracker reports on submit ('sentrisk_' + formConfigId).
    for (const hit of detectSentriskForms(html)) {
      const label = hit.formId.startsWith('slot:') ? `slot "${hit.formId.slice(5)}"`
        : hit.formId.startsWith('type:') ? `${hit.formId.slice(5)} form`
        : `${hit.formId.slice(0, 8)}...`;
      detectedForms.push({
        form_id: `sentrisk_${hit.formId}`,
        form_guid: `sentrisk_${hit.formId}`,
        form_name: `SentriSK Form (${label})`,
        form_type: 'sentrisk',
        form_url: url,
        site_id: siteId,
        detection_method: `sentrisk_${hit.method}`,
        last_detected: new Date().toISOString(),
      });
    }

    // Detektera vanliga HTML formulär
    const formMatches = html.match(/<form[^>]*>/gi);
    if (formMatches) {
      for (let i = 0; i < formMatches.length; i++) {
        const formMatch = formMatches[i];
        const idMatch = formMatch.match(/id="([^"]*)"/i);
        const classMatch = formMatch.match(/class="([^"]*)"/i);
        const actionMatch = formMatch.match(/action="([^"]*)"/i);
        
        const formId = idMatch ? idMatch[1] : `generic_form_${i + 1}`;
        const formName = idMatch ? `Form: ${idMatch[1]}` : `Generic Form ${i + 1}`;
        
        // Försök identifiera formulärtyp baserat på class eller action
        let formType = 'generic';
        if (classMatch) {
          const classes = classMatch[1].toLowerCase();
          if (classes.includes('wpcf7') || classes.includes('contact-form-7')) {
            formType = 'contact_form_7';
          } else if (classes.includes('gform') || classes.includes('gravity')) {
            formType = 'gravity_forms';
          } else if (classes.includes('woocommerce') || classes.includes('checkout')) {
            formType = 'woocommerce_checkout';
          }
        }
        
        if (actionMatch) {
          const action = actionMatch[1].toLowerCase();
          if (action.includes('wpcf7') || action.includes('contact-form-7')) {
            formType = 'contact_form_7';
          }
        }
        
        detectedForms.push({
          form_id: formId,
          form_name: formName,
          form_type: formType,
          form_url: url,
          site_id: siteId,
          detection_method: 'html_scan',
          last_detected: new Date().toISOString()
        });
        
        console.log(`Detected HTML form: ${formName} (${formId}) - Type: ${formType}`);
      }
    }

    // Lagra detekterade formulär i databasen
    if (detectedForms.length > 0) {
      for (const form of detectedForms) {
        // Kontrollera om formuläret redan finns
        const { data: existing } = await supabaseClient
          .from('form_analytics')
          .select('id')
          .eq('form_id', form.form_id)
          .eq('site_id', siteId)
          .single();

        if (!existing) {
          // Skapa nytt formulär
          const { error: insertError } = await supabaseClient
            .from('form_analytics')
            .insert({
              site_id: form.site_id,
              form_id: form.form_id,
              form_name: form.form_name,
              form_type: form.form_type,
              form_url: form.form_url,
              total_starts: 0,
              total_completions: 0,
              total_abandons: 0,
              conversion_rate: 0,
              avg_completion_time: 0,
              last_activity: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (insertError) {
            console.error('Error inserting form:', insertError);
          } else {
            console.log(`Inserted new form: ${form.form_name}`);
          }
        } else {
          // Uppdatera senast detekterat
          const { error: updateError } = await supabaseClient
            .from('form_analytics')
            .update({
              form_name: form.form_name,
              form_type: form.form_type,
              form_url: form.form_url,
              last_activity: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error('Error updating form:', updateError);
          } else {
            console.log(`Updated existing form: ${form.form_name}`);
          }
        }
      }
    }

    // Also upsert discovered forms into form_registry for the dashboard widget
    for (const form of detectedForms) {
      const guid = form.form_guid || form.form_id;
      if (!guid) continue;
      const { error: registryError } = await supabaseClient
        .from('form_registry')
        .upsert({
          site_id: siteId,
          form_guid: guid,
          form_type: form.form_type,
          form_label: form.form_name,
          detected_url: form.form_url,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'site_id,form_guid', ignoreDuplicates: false });
      if (registryError) {
        console.warn('form_registry upsert failed (non-fatal):', registryError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        formsDetected: detectedForms.length,
        forms: detectedForms
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in form-detector function:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});