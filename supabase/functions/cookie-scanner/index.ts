import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CookieScanRequest {
  site_id: string;
  url: string;
  tracking_id?: string;
}

interface DetectedCookie {
  name: string;
  domain: string;
  category: 'necessary' | 'analytics' | 'marketing' | 'preferences';
  purpose: string;
  provider: string;
  expiry?: string;
  is_third_party: boolean;
  script_source?: string;
}

interface DetectedScript {
  name: string;
  type: 'plugin' | 'external_script' | 'inline_script';
  url?: string;
  category: 'necessary' | 'analytics' | 'marketing' | 'preferences';
  provider: string;
  purpose: string;
  detected_cookies: string[];
}

// Cookie and script database for automatic categorization
const COOKIE_DATABASE: Record<string, Partial<DetectedCookie>> = {
  // WordPress Core
  'wordpress_*': { category: 'necessary', provider: 'WordPress', purpose: 'Core functionality and user sessions' },
  'wp-settings-*': { category: 'necessary', provider: 'WordPress', purpose: 'User interface customization' },
  'PHPSESSID': { category: 'necessary', provider: 'PHP', purpose: 'Session management' },
  
  // Analytics
  '_ga': { category: 'analytics', provider: 'Google Analytics', purpose: 'Distinguish users' },
  '_ga_*': { category: 'analytics', provider: 'Google Analytics 4', purpose: 'Session and campaign data' },
  '_gid': { category: 'analytics', provider: 'Google Analytics', purpose: 'Distinguish users' },
  '_gat': { category: 'analytics', provider: 'Google Analytics', purpose: 'Throttle request rate' },
  '_gtag': { category: 'analytics', provider: 'Google Analytics', purpose: 'Google Analytics tracking' },
  'heatmap_*': { category: 'analytics', provider: 'CortIQ Analytics (Expandtalk Corporation AB)', purpose: 'User behavior tracking' },
  
  // Marketing
  '_fbp': { category: 'marketing', provider: 'Facebook', purpose: 'Facebook browser tracking' },
  '_fbc': { category: 'marketing', provider: 'Facebook', purpose: 'Facebook conversion tracking' },
  'fr': { category: 'marketing', provider: 'Facebook', purpose: 'Advertisement delivery' },
  'IDE': { category: 'marketing', provider: 'Google Ads', purpose: 'Ad targeting and measurement' },
  
  // Preferences
  'cookieconsent_status': { category: 'preferences', provider: 'Cookie Consent', purpose: 'Remember cookie preferences' },
  'heatmap_consent': { category: 'preferences', provider: 'Heatmap Analytics', purpose: 'Cookie consent status' },
};

const SCRIPT_DATABASE: Record<string, Partial<DetectedScript>> = {
  // Google Analytics
  'googletagmanager.com/gtag': { 
    category: 'analytics', 
    provider: 'Google Analytics', 
    purpose: 'Web analytics and tracking',
    detected_cookies: ['_ga', '_ga_*', '_gid', '_gat']
  },
  'google-analytics.com/analytics': { 
    category: 'analytics', 
    provider: 'Google Analytics', 
    purpose: 'Legacy Google Analytics',
    detected_cookies: ['_ga', '_gid', '_gat']
  },
  
  // Facebook
  'connect.facebook.net': { 
    category: 'marketing', 
    provider: 'Facebook', 
    purpose: 'Facebook advertising and tracking',
    detected_cookies: ['_fbp', '_fbc', 'fr']
  },
  
  // Common WordPress plugins
  'wp-rocket': { category: 'necessary', provider: 'WP Rocket', purpose: 'Performance optimization' },
  'jetpack': { category: 'analytics', provider: 'Jetpack', purpose: 'WordPress.com integration' },
  'yoast': { category: 'necessary', provider: 'Yoast SEO', purpose: 'SEO optimization' },
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

async function scanWebsite(url: string): Promise<{ cookies: DetectedCookie[], scripts: DetectedScript[] }> {
  console.log(`Scanning website: ${url}`);
  
  try {
    // Fetch the website HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract scripts from HTML
    const scriptMatches = html.match(/<script[^>]*src="([^"]+)"[^>]*>/gi) || [];
    const inlineScripts = html.match(/<script[^>]*>([^<]+)<\/script>/gi) || [];
    
    const detectedScripts: DetectedScript[] = [];
    const detectedCookies: DetectedCookie[] = [];
    
    // Analyze external scripts
    for (const scriptMatch of scriptMatches) {
      const srcMatch = scriptMatch.match(/src="([^"]+)"/);
      if (srcMatch) {
        const scriptUrl = srcMatch[1];
        const script = categorizeScript(scriptUrl);
        if (script) {
          detectedScripts.push(script);
          
          // Add cookies associated with this script
          script.detected_cookies.forEach(cookieName => {
            try {
              const hostname = new URL(scriptUrl.startsWith('//') ? `https:${scriptUrl}` : scriptUrl.startsWith('http') ? scriptUrl : `https://${scriptUrl}`).hostname;
              const cookie = categorizeCookie(cookieName, hostname);
              if (cookie) {
                cookie.script_source = scriptUrl;
                detectedCookies.push(cookie);
              }
            } catch {
              // Fallback for invalid URLs
              const cookie = categorizeCookie(cookieName, 'unknown');
              if (cookie) {
                cookie.script_source = scriptUrl;
                detectedCookies.push(cookie);
              }
            }
          });
        }
      }
    }
    
    // Analyze inline scripts for known patterns
    for (const inlineScript of inlineScripts) {
      // Check for Google Analytics
      if (inlineScript.includes('gtag') || inlineScript.includes('google-analytics')) {
        const script: DetectedScript = {
          name: 'Google Analytics (Inline)',
          type: 'inline_script',
          category: 'analytics',
          provider: 'Google Analytics',
          purpose: 'Web analytics tracking',
          detected_cookies: ['_ga', '_ga_*', '_gid', '_gat']
        };
        detectedScripts.push(script);
        
        // Add GA cookies
        script.detected_cookies.forEach(cookieName => {
          try {
            const hostname = new URL(url).hostname;
            const cookie = categorizeCookie(cookieName, hostname);
            if (cookie) {
              cookie.script_source = 'Inline Script';
              detectedCookies.push(cookie);
            }
          } catch {
            const cookie = categorizeCookie(cookieName, 'unknown');
            if (cookie) {
              cookie.script_source = 'Inline Script';
              detectedCookies.push(cookie);
            }
          }
        });
      }
      
      // Check for Facebook Pixel
      if (inlineScript.includes('fbq') || inlineScript.includes('facebook')) {
        const script: DetectedScript = {
          name: 'Facebook Pixel (Inline)',
          type: 'inline_script',
          category: 'marketing',
          provider: 'Facebook',
          purpose: 'Conversion tracking and advertising',
          detected_cookies: ['_fbp', '_fbc', 'fr']
        };
        detectedScripts.push(script);
      }
      
      // Check for Heatmap Analytics
      if (inlineScript.includes('HeatmapAnalytics') || inlineScript.includes('expandtalk')) {
        const script: DetectedScript = {
          name: 'CortIQ Analytics (Expandtalk Corporation AB)',
          type: 'inline_script',
          category: 'analytics',
          provider: 'Expandtalk Corporation AB',
          purpose: 'User behavior and heatmap tracking',
          detected_cookies: ['heatmap_session', 'heatmap_consent']
        };
        detectedScripts.push(script);
      }
    }
    
    // Check for WordPress-specific patterns
    if (html.includes('wp-content') || html.includes('wordpress')) {
      // Add WordPress core cookies
      const wpCookies = ['wordpress_*', 'wp-settings-*', 'PHPSESSID'];
      wpCookies.forEach(cookieName => {
        try {
          const hostname = new URL(url).hostname;
          const cookie = categorizeCookie(cookieName, hostname);
          if (cookie) {
            detectedCookies.push(cookie);
          }
        } catch {
          const cookie = categorizeCookie(cookieName, 'unknown');
          if (cookie) {
            detectedCookies.push(cookie);
          }
        }
      });
    }
    
    console.log(`Detected ${detectedScripts.length} scripts and ${detectedCookies.length} cookies`);
    
    return { cookies: detectedCookies, scripts: detectedScripts };
    
  } catch (error) {
    console.error('Error scanning website:', error);
    throw error;
  }
}

function categorizeScript(scriptUrl: string): DetectedScript | null {
  // Normalize URL to handle relative URLs
  const normalizeUrl = (url: string): string => {
    try {
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        return `https:${url}`;
      }
      // Handle relative paths
      if (!url.startsWith('http')) {
        return `https://${url}`;
      }
      return url;
    } catch {
      return url;
    }
  };

  const getHostname = (url: string): string => {
    try {
      const normalized = normalizeUrl(url);
      return new URL(normalized).hostname;
    } catch {
      // Fallback: extract hostname from URL string
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\?]+)/);
      return match ? match[1] : 'unknown';
    }
  };

  for (const [pattern, config] of Object.entries(SCRIPT_DATABASE)) {
    if (scriptUrl.includes(pattern)) {
      return {
        name: config.provider || 'Unknown',
        type: 'external_script',
        url: scriptUrl,
        category: config.category || 'necessary',
        provider: config.provider || 'Unknown',
        purpose: config.purpose || 'Unknown functionality',
        detected_cookies: config.detected_cookies || []
      };
    }
  }
  
  // Default categorization for unknown scripts
  if (scriptUrl.includes('analytics') || scriptUrl.includes('tracking')) {
    return {
      name: 'Unknown Analytics Script',
      type: 'external_script',
      url: scriptUrl,
      category: 'analytics',
      provider: getHostname(scriptUrl),
      purpose: 'Analytics and tracking',
      detected_cookies: []
    };
  }
  
  if (scriptUrl.includes('ads') || scriptUrl.includes('marketing')) {
    return {
      name: 'Unknown Marketing Script',
      type: 'external_script',
      url: scriptUrl,
      category: 'marketing',
      provider: getHostname(scriptUrl),
      purpose: 'Advertising and marketing',
      detected_cookies: []
    };
  }
  
  return null;
}

function categorizeCookie(cookieName: string, domain: string): DetectedCookie | null {
  // Check for exact match first
  if (COOKIE_DATABASE[cookieName]) {
    const config = COOKIE_DATABASE[cookieName];
    return {
      name: cookieName,
      domain: domain,
      category: config.category || 'necessary',
      purpose: config.purpose || 'Unknown purpose',
      provider: config.provider || domain,
      is_third_party: false, // Will be determined properly later
      ...config
    };
  }
  
  // Check for pattern matches
  for (const [pattern, config] of Object.entries(COOKIE_DATABASE)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(cookieName)) {
        return {
          name: cookieName,
          domain: domain,
          category: config.category || 'necessary',
          purpose: config.purpose || 'Unknown purpose',
          provider: config.provider || domain,
      is_third_party: !domain.includes(domain.replace(/^https?:\/\//, '').split('/')[0]),
          ...config
        };
      }
    }
  }
  
  // Default categorization
  return {
    name: cookieName,
    domain: domain,
    category: 'necessary',
    purpose: 'Unknown purpose - manual categorization needed',
    provider: domain,
    is_third_party: false
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { site_id, url }: CookieScanRequest = await req.json();
    
    if (!site_id || !url) {
      return new Response(
        JSON.stringify({ error: "Missing site_id or url" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting: Max 3 scans per hour per site
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('detected_cookies')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', site_id)
      .gte('created_at', oneHourAgo);

    if (count && count >= 3) {
      return new Response(
        JSON.stringify({ 
          error: "För många skanningar. Försök igen senare.",
          message: "Du kan skanna max 3 gånger per timme. Försök igen om en stund."
        }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
      );
    }

    console.log(`Starting cookie scan for site ${site_id} at ${url}`);

    // Scan the website
    const { cookies, scripts } = await scanWebsite(url);

    // Save detected cookies to database
    if (cookies.length > 0) {
      const { error: cookiesError } = await supabase
        .from('detected_cookies')
        .upsert(
          cookies.map(cookie => ({
            site_id,
            cookie_name: cookie.name,
            cookie_domain: cookie.domain,
            cookie_category: cookie.category,
            cookie_purpose: cookie.purpose,
            cookie_provider: cookie.provider,
            cookie_expiry: cookie.expiry,
            is_third_party: cookie.is_third_party,
            detection_method: 'automatic',
            script_source: cookie.script_source
          })),
          { onConflict: 'site_id,cookie_name,cookie_domain' }
        );

      if (cookiesError) {
        console.error('Error saving cookies:', cookiesError);
      }
    }

    // Save detected scripts to database
    if (scripts.length > 0) {
      const { error: scriptsError } = await supabase
        .from('detected_scripts')
        .upsert(
          scripts.map(script => ({
            site_id,
            script_name: script.name,
            script_type: script.type,
            script_url: script.url,
            detected_cookies: script.detected_cookies,
            category: script.category,
            provider: script.provider,
            purpose: script.purpose,
            last_seen: new Date().toISOString()
          })),
          { onConflict: 'site_id,script_name,script_url' }
        );

      if (scriptsError) {
        console.error('Error saving scripts:', scriptsError);
      }
    }

    // Update site's last scan timestamp
    await supabase
      .from('sites')
      .update({ last_cookie_scan: new Date().toISOString() })
      .eq('id', site_id);

    console.log(`Cookie scan completed for site ${site_id}. Found ${cookies.length} cookies and ${scripts.length} scripts`);

    return new Response(
      JSON.stringify({
        success: true,
        cookies_found: cookies.length,
        scripts_found: scripts.length,
        cookies,
        scripts
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );

  } catch (error: any) {
    console.error("Error in cookie-scanner function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
};

serve(handler);