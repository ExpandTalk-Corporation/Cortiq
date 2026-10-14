import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Status = 'ok' | 'warn' | 'bad' | 'na';
type Check = { label: string; status: Status; detail: string };

const ICON: Record<Status, React.ReactNode> = {
  ok:   <CheckCircle2 className="h-4 w-4 text-green-600" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  bad:  <XCircle className="h-4 w-4 text-red-600" />,
  na:   <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

export function SetupHealthCheck({ siteId }: { siteId: string }) {
  const [checks, setChecks] = useState<Check[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: site } = await supabase
        .from('sites')
        .select('tracking_id, ga_measurement_id, tracking_mode')
        .eq('id', siteId)
        .maybeSingle();
      const { count: pv } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('viewed_at', since7);
      const { count: consents } = await supabase
        .from('cookie_consents')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('created_at', since30);

      const s = (site || {}) as { tracking_id?: string; ga_measurement_id?: string; tracking_mode?: string };
      const cookieless = s.tracking_mode === 'cookieless';
      const result: Check[] = [
        {
          label: 'Tracking script',
          status: (pv || 0) > 0 ? 'ok' : s.tracking_id ? 'warn' : 'bad',
          detail: (pv || 0) > 0
            ? `Receiving data (${pv} page views / 7d)`
            : s.tracking_id ? 'Configured, but no data in 7 days — check the snippet is installed' : 'No Tracking ID set',
        },
        {
          label: 'GDPR consent log',
          status: (consents || 0) > 0 ? 'ok' : 'warn',
          detail: (consents || 0) > 0
            ? `${consents} consent records / 30d (Art. 7 proof)`
            : 'No consent recorded yet — CortIQ collects nothing in the browser until analytics consent, in cookieless mode too',
        },
        {
          // This reflects the DASHBOARD setting only. The dashboard cannot observe the
          // deployed script/plugin's mode, so we must not assert compliance from it alone.
          label: 'Tracking mode (dashboard setting)',
          status: 'ok',
          detail: cookieless
            ? 'Set to Cookieless. Confirm your installed snippet/plugin is also set to cookieless — otherwise the script identifies returning visitors (full mode) after consent.'
            : 'Set to Full (fingerprint + returning-visitor profiling, requires consent).',
        },
        {
          label: 'Google Analytics 4',
          status: s.ga_measurement_id ? 'ok' : 'na',
          detail: s.ga_measurement_id ? 'Connected with Consent Mode v2' : 'Not configured (optional)',
        },
      ];
      if (!cancelled) setChecks(result);
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const overall: Status = !checks
    ? 'na'
    : checks.some((c) => c.status === 'bad')
    ? 'bad'
    : checks.some((c) => c.status === 'warn')
    ? 'warn'
    : 'ok';

  const overallLabel = { ok: 'All good', warn: 'Needs attention', bad: 'Action needed', na: 'Checking…' }[overall];
  const overallClass = {
    ok: 'bg-green-100 text-green-800 border-green-200',
    warn: 'bg-amber-100 text-amber-800 border-amber-200',
    bad: 'bg-red-100 text-red-800 border-red-200',
    na: 'bg-muted text-muted-foreground',
  }[overall];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5" /> Setup health check
          </CardTitle>
          <Badge variant="outline" className={`text-xs ${overallClass}`}>{overallLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(checks || []).map((c) => (
            <div key={c.label} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
            </div>
          ))}
          {!checks && <div className="text-sm text-muted-foreground">Checking…</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default SetupHealthCheck;
