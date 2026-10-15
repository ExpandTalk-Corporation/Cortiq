import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation
function validateInput(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.siteId || typeof data.siteId !== 'string') {
    errors.push('Invalid siteId');
  }
  
  if (data.startDate && isNaN(Date.parse(data.startDate))) {
    errors.push('Invalid startDate');
  }
  
  if (data.endDate && isNaN(Date.parse(data.endDate))) {
    errors.push('Invalid endDate');
  }
  
  return { valid: errors.length === 0, errors };
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

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: user } = await supabase.auth.getUser(token);
    
    if (!user.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestData = await req.json();
    
    // Validate input
    const validation = validateInput(requestData);
    if (!validation.valid) {
      return new Response(JSON.stringify({ 
        error: 'Validation failed', 
        details: validation.errors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { siteId, startDate, endDate } = requestData;

    // Fetch site and verify ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .eq('user_id', user.user.id)
      .single();

    if (siteError || !site) {
      return new Response(JSON.stringify({ error: 'Site not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user identities with LTV data (limit to 10000 for performance)
    const { data: identities, error } = await supabase
      .from('user_identities')
      .select('*')
      .eq('site_id', siteId)
      .eq('consent_granted', true)
      .order('total_revenue', { ascending: false })
      .limit(10000);

    if (error) throw error;

    // Calculate cohort analysis
    const cohorts: Record<string, any> = {};
    
    for (const identity of identities || []) {
      const cohortMonth = new Date(identity.first_seen).toISOString().slice(0, 7);
      
      if (!cohorts[cohortMonth]) {
        cohorts[cohortMonth] = {
          month: cohortMonth,
          users: 0,
          totalRevenue: 0,
          avgRevenue: 0,
          avgSessions: 0
        };
      }
      
      cohorts[cohortMonth].users++;
      cohorts[cohortMonth].totalRevenue += Number(identity.total_revenue || 0);
      cohorts[cohortMonth].avgSessions += identity.total_sessions || 0;
    }

    // Calculate averages
    Object.keys(cohorts).forEach(month => {
      if (cohorts[month].users > 0) {
        cohorts[month].avgRevenue = Number((cohorts[month].totalRevenue / cohorts[month].users).toFixed(2));
        cohorts[month].avgSessions = Number((cohorts[month].avgSessions / cohorts[month].users).toFixed(1));
      }
    });

    // Get top value users (limited to 100)
    const topUsers = (identities || []).slice(0, 100).map(u => ({
      userHash: u.user_hash,
      totalRevenue: Number(u.total_revenue || 0),
      totalSessions: u.total_sessions || 0,
      firstSeen: u.first_seen,
      lastSeen: u.last_seen,
      avgRevenuePerSession: u.total_sessions > 0 
        ? Number((Number(u.total_revenue || 0) / u.total_sessions).toFixed(2))
        : 0
    }));

    // Overall statistics
    const stats = {
      totalUsers: identities?.length || 0,
      totalRevenue: identities?.reduce((sum, u) => sum + Number(u.total_revenue || 0), 0) || 0,
      avgLTV: 0,
      avgSessions: 0
    };
    
    if (stats.totalUsers > 0) {
      stats.avgLTV = Number((stats.totalRevenue / stats.totalUsers).toFixed(2));
      stats.avgSessions = Number((identities?.reduce((sum, u) => sum + (u.total_sessions || 0), 0) / stats.totalUsers || 0).toFixed(1));
    }

    return new Response(JSON.stringify({
      success: true,
      stats,
      cohorts: Object.values(cohorts),
      topUsers
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('User lifetime value error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
