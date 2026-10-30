import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePixelReadiness } from '@/hooks/usePixelReadiness';
import type { ReadinessState } from '@/lib/pixelReadiness';
import type { Site } from '@/types/dashboard';

const COPY: Record<ReadinessState, { badge: string; headline: string; action: string }> = {
  no_primary_goal: { badge: 'Set up', headline: 'Set a primary goal first',
    action: 'Mark the conversion that matters most (e.g. demo request) as Primary in Conversion Goals.' },
  fix_goals: { badge: 'Fix goals', headline: 'Fix your primary goal first',
    action: 'A misfiring goal would mislead any ad platform. See the warning in Conversion Goals.' },
  aggregate_enough: { badge: 'Aggregate is enough', headline: 'You probably do not need the pixel',
    action: 'An ad platform would see too few conversions to optimise on, so a cookie banner likely costs more than it gives. Turn on Aggregate measurement under Consent → Tracking mode and track channels with UTM tags.' },
  borderline: { badge: 'Borderline', headline: 'Borderline — test before adding a banner',
    action: 'Run aggregate measurement for a month and compare. If volume grows, add consented click IDs for your biggest campaign first.' },
  attribution_pays: { badge: 'Attribution pays off', headline: 'The attribution layer pays off',
    action: 'Use consented click IDs + Enhanced Conversions (Settings → Integrations → HubSpot) so Smart Bidding learns from qualified leads.' },
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PixelReadinessCard({ selectedSite }: { selectedSite: Site }) {
  const { data, isLoading, error } = usePixelReadiness(selectedSite);
  if (isLoading) return <div className="h-40 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (error || !data) return null;
  const copy = COPY[data.state];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Do you need the pixel?</CardTitle>
          <Badge variant="outline">{copy.badge}</Badge>
        </div>
        <CardDescription>{copy.headline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.state !== 'no_primary_goal' && (
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-2xl font-bold">{data.conversions}</div><p className="text-xs text-muted-foreground">conversions, 30 days</p></div>
            <div><div className="text-2xl font-bold">{pct(data.acceptanceUsed)}</div><p className="text-xs text-muted-foreground">{data.acceptanceAssumed ? 'acceptance (assumed)' : 'banner acceptance'}</p></div>
            <div><div className="text-2xl font-bold">{data.effectiveConversions}</div><p className="text-xs text-muted-foreground">an ad platform would see</p></div>
          </div>
        )}
        <p className="text-sm">{copy.action}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {data.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">
          Verify: based on {data.conversions} conversions on goal “{data.primaryGoalName ?? '—'}” in the last 30 days
          ({data.source === 'aggregate' ? 'aggregate measurement, all visitors' : 'consented sessions only'}). Thresholds
          (~30 / ~50 per month) are a rule of thumb — check Google Ads’ bid strategy recommendations for your account.
        </p>
      </CardContent>
    </Card>
  );
}
