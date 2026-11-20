import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAggregateStats, useLastAggregateDay } from '@/hooks/useAggregateStats';

const fmt = (n: number) => n.toLocaleString('sv-SE');
const pct = (r: number) => `${(r * 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`;
const dec = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// GA4 style: "1m 05s", "42s".
const duration = (sec: number) => {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  return m > 0 ? `${m}m ${String(total % 60).padStart(2, '0')}s` : `${total}s`;
};

/**
 * Shown instead of a card of zeros when nothing was counted in the period. With no counted day ever,
 * the usual cause is a snippet copied before aggregate measurement was turned on (the beacon is
 * inlined only in snippets copied afterwards).
 */
function AggregateEmpty({ lastDay, onNavigate }: { lastDay: string | null; onNavigate?: (tab: string) => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm" role="status">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Aggregate measurement is on, but nothing was counted in this period.</p>
        <p className="text-muted-foreground">
          {lastDay
            ? `Last counted day: ${lastDay}. Widen the date range, or check that the snippet is still on the site.`
            : 'Nothing has been counted yet. Most often the snippet was copied before aggregate measurement was turned on — copy it again.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onNavigate && <Button size="sm" variant="outline" onClick={() => onNavigate('setup')}>Copy the snippet</Button>}
        <Button size="sm" variant="outline" asChild><Link to="/tracking-check/new">Run Tracking Check</Link></Button>
      </div>
    </div>
  );
}

export function AggregateOverview({ siteId, from, to, onNavigate }: { siteId: string; from: string; to: string; onNavigate?: (tab: string) => void }) {
  const { data, isLoading, error } = useAggregateStats(siteId, from, to, true);
  const empty = !!data && data.visits === 0 && data.pageviews === 0;
  const lastDay = useLastAggregateDay(siteId, empty);
  if (isLoading || (empty && lastDay.isLoading)) return <div className="h-32 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (error || !data) return <p className="rounded-lg border p-4 text-sm">Could not load aggregate measurement.</p>;
  if (empty) return <AggregateEmpty lastDay={lastDay.data ?? null} onNavigate={onNavigate} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All counted visitors (aggregate)</CardTitle>
        <CardDescription>Counted without consent: no cookies, no device storage, no persistent IDs.</CardDescription>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">How this is counted</summary>
          <p className="mt-1">
            Visitors are counted per day, so someone who returns on two days counts twice. Engagement uses the
            GA4 definitions: an engaged visit (GA4: engaged session) has at least 10 seconds in the foreground,
            2 or more page views or a conversion.
          </p>
        </details>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {([['Visitors', data.visitors], ['Visits', data.visits], ['Page views', data.pageviews]] as const).map(([label, value]) => (
            <div key={label}>
              <div className="text-2xl font-bold">{fmt(value)}</div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            ['Engaged visits', fmt(data.engagedVisits)],
            ['Engagement rate', pct(data.engagementRate)],
            ['Engaged visits per visitor', dec(data.engagedVisitsPerVisitor)],
            ['Average engagement time', duration(data.avgEngagementSeconds)],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {data.filteredHits > 0 && (
          <p className="text-xs text-muted-foreground">
            {fmt(data.filteredHits)} {data.filteredHits === 1 ? 'hit was' : 'hits were'} filtered out as bot bursts
            (several new direct visitors on one page within seconds) and are not counted above.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium">Sources</h4>
            {data.topSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Source</th><th className="py-1 text-right">Visits</th><th className="py-1 text-right">Visitors</th><th className="py-1 text-right">Engagement rate</th></tr></thead>
                  <tbody>
                    {data.topSources.map((r, i) => (
                      <tr key={`${i}:${r.label}`} className="border-t"><td className="py-1 break-all">{r.label}</td><td className="py-1 text-right">{fmt(r.visits)}</td><td className="py-1 text-right">{fmt(r.visitors)}</td><td className="py-1 text-right">{r.visits > 0 ? pct(r.engagedVisits / r.visits) : '–'}</td></tr>
                    ))}
                    {data.otherSources && (
                      <tr className="border-t italic text-muted-foreground"><td className="py-1">Other</td><td className="py-1 text-right">{fmt(data.otherSources.visits)}</td><td className="py-1 text-right">{fmt(data.otherSources.visitors)}</td><td className="py-1 text-right">{pct(data.otherSources.engagedVisits / data.otherSources.visits)}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">Top pages</h4>
            {data.topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Page</th><th className="py-1 text-right">Page views</th><th className="py-1 text-right">Entries</th></tr></thead>
                  <tbody>
                    {data.topPages.map((r, i) => (
                      <tr key={`${i}:${r.path}`} className="border-t"><td className="py-1 break-all">{r.path}</td><td className="py-1 text-right">{fmt(r.pageviews)}</td><td className="py-1 text-right">{fmt(r.entries)}</td></tr>
                    ))}
                    {data.otherPages && (
                      <tr className="border-t italic text-muted-foreground"><td className="py-1">Other</td><td className="py-1 text-right">{fmt(data.otherPages.pageviews)}</td><td className="py-1 text-right">–</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">Conversions by source</h4>
            {data.conversions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goal conversions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Goal</th><th className="py-1">Source</th><th className="py-1 text-right">Conversions</th></tr></thead>
                  <tbody>
                    {data.conversions.map((r, i) => (
                      <tr key={`${i}:${r.goalId}:${r.source}`} className="border-t"><td className="py-1">{r.goalName}</td><td className="py-1 break-all">{r.source}</td><td className="py-1 text-right">{fmt(r.conversions)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
