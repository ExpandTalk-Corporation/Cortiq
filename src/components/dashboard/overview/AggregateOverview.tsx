import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAggregateStats } from '@/hooks/useAggregateStats';

const fmt = (n: number) => n.toLocaleString('sv-SE');

export function AggregateOverview({ siteId, from, to }: { siteId: string; from: string; to: string }) {
  const { data, isLoading, error } = useAggregateStats(siteId, from, to, true);
  if (isLoading) return <div className="h-32 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (error || !data) return <p className="rounded-lg border p-4 text-sm">Could not load aggregate measurement.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All visitors (aggregate)</CardTitle>
        <CardDescription>
          Counted without consent: no cookies, no device storage, no persistent IDs. Visitors are counted
          per day, so someone who returns on two days counts twice.
        </CardDescription>
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
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium">Sources</h4>
            {data.topSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Source</th><th className="py-1 text-right">Visits</th><th className="py-1 text-right">Visitors</th></tr></thead>
                <tbody>
                  {data.topSources.map((r) => (
                    <tr key={r.label} className="border-t"><td className="py-1 break-all">{r.label}</td><td className="py-1 text-right">{fmt(r.visits)}</td><td className="py-1 text-right">{fmt(r.visitors)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">Conversions by source</h4>
            {data.conversions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goal conversions in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Goal</th><th className="py-1">Source</th><th className="py-1 text-right">Conversions</th></tr></thead>
                <tbody>
                  {data.conversions.map((r) => (
                    <tr key={`${r.goalId} ${r.source}`} className="border-t"><td className="py-1">{r.goalName}</td><td className="py-1 break-all">{r.source}</td><td className="py-1 text-right">{fmt(r.conversions)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
