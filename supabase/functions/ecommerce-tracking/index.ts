import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveSite } from "../_shared/resolve-site.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: Max 100 events per minute per site
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(siteId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(siteId);
  
  if (!limit || now > limit.resetAt) {
    rateLimits.set(siteId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (limit.count >= 100) {
    return false;
  }
  
  limit.count++;
  return true;
}

// Input validation
function validateEcommerceEvent(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.siteId || typeof data.siteId !== 'string' || data.siteId.length > 100) {
    errors.push('Invalid siteId');
  }
  
  if (!data.sessionId || typeof data.sessionId !== 'string' || data.sessionId.length > 200) {
    errors.push('Invalid sessionId');
  }
  
  if (!data.eventType || !['view_item', 'add_to_cart', 'begin_checkout', 'purchase'].includes(data.eventType)) {
    errors.push('Invalid eventType');
  }
  
  if (typeof data.consentGranted !== 'boolean') {
    errors.push('Invalid consentGranted');
  }
  
  // Validate productData if present
  if (data.productData) {
    if (data.productData.name && data.productData.name.length > 500) {
      errors.push('Product name too long');
    }
    if (data.productData.price && (isNaN(data.productData.price) || data.productData.price < 0 || data.productData.price > 1000000)) {
      errors.push('Invalid price');
    }
    if (data.productData.quantity && (isNaN(data.productData.quantity) || data.productData.quantity < 1 || data.productData.quantity > 10000)) {
      errors.push('Invalid quantity');
    }
  }
  
  // Validate transactionData if present
  if (data.transactionData) {
    if (data.transactionData.revenue && (isNaN(data.transactionData.revenue) || data.transactionData.revenue < 0 || data.transactionData.revenue > 10000000)) {
      errors.push('Invalid revenue');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// Sanitize string to prevent XSS
function sanitizeString(str: string | null | undefined): string | null {
  if (!str) return null;
  return str.replace(/[<>\"']/g, '').trim().substring(0, 500);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData = await req.json();
    
    // Validate input
    const validation = validateEcommerceEvent(requestData);
    if (!validation.valid) {
      return new Response(JSON.stringify({ 
        error: 'Validation failed', 
        details: validation.errors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { 
      siteId, 
      sessionId, 
      userId,
      eventType,
      productData,
      transactionData,
      consentGranted 
    } = requestData;

    // Rate limiting
    if (!checkRateLimit(siteId)) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Max 100 events per minute.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GDPR: Only track if consent is granted
    if (!consentGranted) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Consent required for e-commerce tracking' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify site exists
    // siteId may be an account id (WordPress plugin); resolved via the browser Origin.
    const site = await resolveSite(supabase, siteId, req.headers.get('origin'), 'id');

    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Sanitize all string inputs
    const sanitizedProductData = productData ? {
      id: sanitizeString(productData.id),
      name: sanitizeString(productData.name),
      category: sanitizeString(productData.category),
      brand: sanitizeString(productData.brand),
      variant: sanitizeString(productData.variant),
      quantity: Math.min(Math.max(1, parseInt(productData.quantity) || 1), 10000),
      price: Math.min(Math.max(0, parseFloat(productData.price) || 0), 1000000),
      currency: sanitizeString(productData.currency) || 'SEK'
    } : null;

    const sanitizedTransactionData = transactionData ? {
      id: sanitizeString(transactionData.id),
      revenue: Math.min(Math.max(0, parseFloat(transactionData.revenue) || 0), 10000000),
      tax: Math.min(Math.max(0, parseFloat(transactionData.tax) || 0), 1000000),
      shipping: Math.min(Math.max(0, parseFloat(transactionData.shipping) || 0), 100000)
    } : null;

    // Insert e-commerce event
    const { data: event, error } = await supabase
      .from('ecommerce_events')
      .insert({
        site_id: site.id,
        session_id: sessionId.substring(0, 200),
        user_id: userId || null,
        event_type: eventType,
        product_id: sanitizedProductData?.id,
        product_name: sanitizedProductData?.name,
        product_category: sanitizedProductData?.category,
        product_brand: sanitizedProductData?.brand,
        product_variant: sanitizedProductData?.variant,
        quantity: sanitizedProductData?.quantity || 1,
        price: sanitizedProductData?.price,
        currency: sanitizedProductData?.currency || 'SEK',
        transaction_id: sanitizedTransactionData?.id,
        revenue: sanitizedTransactionData?.revenue,
        tax: sanitizedTransactionData?.tax,
        shipping: sanitizedTransactionData?.shipping,
        consent_granted: consentGranted
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to insert event');
    }

    // Update user identity if userId exists (only for purchases)
    if (userId && eventType === 'purchase' && sanitizedTransactionData?.revenue) {
      const userHash = await hashUserId(userId);
      
      await supabase.rpc('upsert_user_identity', {
        p_site_id: site.id,
        p_user_hash: userHash,
        p_session_id: sessionId,
        p_revenue: sanitizedTransactionData.revenue
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      eventId: event.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('E-commerce tracking error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function hashUserId(userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(userId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
