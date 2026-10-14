import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Cloud, Eye, BarChart3, RefreshCw, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Site } from '@/types/dashboard';

// The coverage-gap story in three layers:
//   Edge (Cloudflare)  — ALL traffic, incl. AI crawlers & non-JS requests
//   CortIQ cookieless  — consented human sessions (no cookies, but consent still required)
//   GA4 (estimated)    — only the consented subset
export function ConsentImpact({ selectedSite }: { selectedSite: Site }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [acceptRate, setAcceptRate] = useState<number | null>(null); // 0..1
  const [cortiqPV, setCortiqPV] = useState(0);
  const [edge, setEdge] = useState<{ requests: number; uniques: number } | null>(null);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceDay = since.slice(0, 10);

  const load = async () => {
    setLoading(true);
    try {
      // Banner acceptance (analytics) over 30 days.
      const { data: consents } = await supabase
        .from('cookie_consents')
        .select('consent_types, created_at')
        .eq('site_id', selectedSite.id)
        .gte('created_at', since)
        .limit(2000);
      if (consents && consents.length > 0) {
        const granted = consents.filter((c) => (c.consent_types as any)?.analytics).length;
        setAcceptRate(granted / consents.length);
      } else {
        setAcceptRate(null);
      }

      // CortIQ page views (cookieless — all visitors) over 30 days.
      const { count: pv } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', selectedSite.id)
        .gte('viewed_at', since);
      setCortiqPV(pv || 0);

      // Cloudflare edge aggregates over 30 days.
      const { data: cf } = await supabase
        .from('cloudflare_analytics')
        .select('requests, unique_visitors')
        .eq('site_id', selectedSite.id)
        .gte('day', sinceDay);
      if (cf && cf.length > 0) {
        setEdge({
          requests: cf.reduce((s, r: any) => s + (r.requests || 0), 0),
          uniques: cf.reduce((s, r: any) => s + (r.unique_visitors || 0), 0),
        });
      } else {
        setEdge(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite.id]);

  const syncCloudflare = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('cloudflare-analytics', {
        body: { site_id: selectedSite.id, days: 30 },
      });
      if (error) { toast.error('Cloudflare sync failed: ' + error.message); return; }
      if ((data as any)?.error) { toast.error('Cloudflare: ' + (data as any).error); return; }
      toast.success(`Cloudflare synced — ${(data as any)?.days_upserted ?? 0} days`);
      await load();
    } catch (e) {
      toast.error('Cloudflare sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const ga4Estimate = acceptRate !== null ? Math.round(cortiqPV * acceptRate) : null;
  const gaVisibilityPct = acceptRate !== null ? Math.round(acceptRate * 100) : null;
  const fmt = (n: number) => n.toLocaleString('sv-SE');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Consent Impact</h3>
          <p className="text-sm text-muted-foreground">
            How much of your real traffic each layer sees, last 30 days.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={syncCloudflare} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Cloudflare'}
        </Button>
      </div>

      {gaVisibilityPct !== null && (
        <Alert>
          <TrendingDown className="h-4 w-4" />
          <AlertDescription>
            <strong>GA4 sees ~{gaVisibilityPct}% of your traffic.</strong> CortIQ measures{' '}
            {100 - gaVisibilityPct}% more (cookieless, all visitors){edge ? ', and Cloudflare sees every request at the edge including AI crawlers' : ''}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Edge layer */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cloudflare edge</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {edge ? (
              <>
                <div className="text-2xl font-bold">{fmt(edge.requests)}</div>
                <p className="text-xs text-muted-foreground">requests · {fmt(edge.uniques)} unique · all traffic</p>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">Not connected</div>
                <p className="text-xs text-muted-foreground mt-1">Add a Zone ID + sync to see edge traffic.</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* CortIQ cookieless layer */}
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CortIQ (cookieless)</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(cortiqPV)}</div>
            <p className="text-xs text-muted-foreground">page views · consented sessions, no cookies</p>
          </CardContent>
        </Card>

        {/* GA4 estimated layer */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">GA4 (estimated)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {ga4Estimate !== null ? (
              <>
                <div className="text-2xl font-bold">{fmt(ga4Estimate)}</div>
                <p className="text-xs text-muted-foreground">
                  consented only · <Badge variant="outline" className="text-xs">{gaVisibilityPct}% acceptance</Badge>
                </p>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">No consent data yet</div>
                <p className="text-xs text-muted-foreground mt-1">Acceptance rate appears once the banner is answered.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <p className="text-xs text-muted-foreground">
        Layers are complementary, not identical counts: edge "requests" ≠ CortIQ "page views" ≠ GA4.
        The GA4 figure is an estimate (CortIQ page views × banner acceptance), for scale, not an exact GA4 number.
      </p>
    </div>
  );
}

export default ConsentImpact;
