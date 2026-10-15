import { createClient } from '../_shared/supabase.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DetectedCookie {
  cookie_name: string;
  cookie_category: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract domain from URL - support query parameter
    const url = new URL(req.url);
    const domain = url.searchParams.get('domain');
    
    if (!domain) {
      return new Response(
        JSON.stringify({ 
          error: 'Domain parameter is required',
          usage: 'Use: /supabase-detected-cookies?domain=your-domain.com',
          example: '/supabase-detected-cookies?domain=xn--itskerhet-x2a.com'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Fetching detected cookies for domain:', domain);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find site by domain (try multiple variations and use LIKE for partial matching)
    console.log('Searching for domain:', domain);
    
    // First try exact domain matches with variations
    const domainVariations = [
      domain,
      `https://${domain}`,
      `http://${domain}`,
      `https://www.${domain}`,
      `http://www.${domain}`,
      `https://${domain}/`,
      `http://${domain}/`,
      `https://www.${domain}/`,
      `http://www.${domain}/`
     ];

    console.log('Trying exact matches for variations:', domainVariations);

    // First try exact matches
    const { data: exactSites, error: exactError } = await supabase
      .from('sites')
      .select('id, domain')
      .in('domain', domainVariations);

    console.log('Exact match result:', exactSites, 'Error:', exactError);

    let sites = exactSites;
    let siteError = exactError;

    if (!sites || sites.length === 0) {
      console.log('No exact match found, trying LIKE search for:', domain);
      // If no exact match, try LIKE search for partial domain matching
      const { data: likeSites, error: likeError } = await supabase
        .from('sites')
        .select('id, domain')
        .like('domain', `%${domain}%`);
      
      console.log('LIKE search result:', likeSites, 'Error:', likeError);
      sites = likeSites;
      siteError = likeError;
    }

    if (siteError) {
      console.error('Error fetching site:', siteError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch site information' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!sites || sites.length === 0) {
      console.log('No site found for domain:', domain);
      return new Response(
        JSON.stringify({ 
          error: 'Site not found for domain',
          domain: domain,
          cookies: []
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const siteId = sites[0].id;
    console.log('Found site ID:', siteId);

    // Fetch detected cookies for the site
    const { data: cookies, error: cookiesError } = await supabase
      .from('detected_cookies')
      .select('cookie_name, cookie_category')
      .eq('site_id', siteId)
      .order('cookie_category')
      .order('cookie_name');

    if (cookiesError) {
      console.error('Error fetching cookies:', cookiesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch detected cookies' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Found ${cookies?.length || 0} cookies for domain ${domain}`);

    // Add standard WordPress cookies that should always be included as necessary
    const standardWordPressCookies = [
      'PHPSESSID',
      'wordpress_',
      'wordpress_logged_in_',
      'wp-settings-',
      'wp-settings-time-',
      'comment_author_',
      'comment_author_email_',
      'comment_author_url_'
    ];

    // Get existing necessary cookies
    const necessaryCookies = cookies?.filter(c => c.cookie_category === 'necessary').map(c => c.cookie_name) || [];
    
    // Add WordPress cookies if not already included
    standardWordPressCookies.forEach(wpCookie => {
      if (!necessaryCookies.some(existing => existing.startsWith(wpCookie.replace('_', '')))) {
        necessaryCookies.push(wpCookie);
      }
    });

    // Add standard Google Analytics cookies for analytics category
    const analyticsCookies = cookies?.filter(c => c.cookie_category === 'analytics').map(c => c.cookie_name) || [];
    const standardAnalyticsCookies = ['_ga', '_ga_*', '_gid', '_gat', '_gat_gtag_*'];
    
    standardAnalyticsCookies.forEach(gaCookie => {
      if (!analyticsCookies.includes(gaCookie)) {
        analyticsCookies.push(gaCookie);
      }
    });

    // Group cookies by category with Swedish labels
    const cookiesByCategory = {
      "Nödvändiga cookies (alltid aktiva)": necessaryCookies,
      "Prestanda-cookies (analys)": analyticsCookies,
      "Marknadsförings-cookies": cookies?.filter(c => c.cookie_category === 'marketing').map(c => c.cookie_name) || [],
      "Preferenser": cookies?.filter(c => c.cookie_category === 'preferences').map(c => c.cookie_name) || [],
      "Övriga": cookies?.filter(c => !['necessary', 'analytics', 'marketing', 'preferences'].includes(c.cookie_category)).map(c => c.cookie_name) || []
    };

    // Return the cookies data
    const response = {
      domain: domain,
      site_id: siteId,
      cookies: cookiesByCategory,
      total_cookies: cookies?.length || 0,
      categories: {
        necessary: cookies?.filter(c => c.cookie_category === 'necessary').length || 0,
        analytics: cookies?.filter(c => c.cookie_category === 'analytics').length || 0,
        marketing: cookies?.filter(c => c.cookie_category === 'marketing').length || 0,
        preferences: cookies?.filter(c => c.cookie_category === 'preferences').length || 0
      }
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});