// src/components/dashboard/overview/KpiRow.tsx
import { comparePeriods } from '@/lib/dashboard/filters';
import { Sparkline } from '@/components/dashboard/widgets/Sparkline';
import { WidgetCard } from '@/components/dashboard/widgets/WidgetCard';
import type { OverviewMetrics } from '@/hooks/useOverviewMetrics';

const fmt = new Intl.NumberFormat('en-US');

function Delta({ current, previous, sample }: { current: number; previous: number; sample: number }) {
  const c = comparePeriods(current, previous, sample);
  if (c.kind === 'none') return <span className="text-xs text-muted-foreground">—</span>;
  if (c.kind === 'insufficient') {
    return <span className="text-xs text-muted-foreground" title="Too little data in the previous period to compare">No comparison</span>;
  }
  const up = c.pct >= 0;
  const pct = Math.abs(c.pct) > 999 ? '>999' : String(Math.abs(c.pct));
  return (
    <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`} title="Compared with the previous period of equal length">
      {up ? '▲' : '▼'} {pct}% <span className="font-normal text-muted-foreground">vs prev.</span>
    </span>
  );
}

export function KpiRow({ m, from, to, segmented = false, aggregateOnly = false }: {
  m: OverviewMetrics; from: string; to: string; segmented?: boolean; aggregateOnly?: boolean;
}) {
  const convRate = (t: { visits: number; conversions: number }) => (t.visits ? (t.conversions / t.visits) * 100 : 0);
  const prevVisits = m.previous.visits;
  const allTiles = [
    { label: 'Visits', cur: m.current.visits, prev: prevVisits, sample: prevVisits, series: m.daily.map((d) => d.visits) },
    { label: 'Page views', cur: m.current.pageViews, prev: m.previous.pageViews, sample: m.previous.pageViews, series: m.daily.map((d) => d.pageViews) },
    { label: 'Conversions', cur: m.current.conversions, prev: m.previous.conversions, sample: m.previous.conversions, series: m.daily.map((d) => d.conversions) },
    { label: 'Conversion rate', cur: convRate(m.current), prev: convRate(m.previous), sample: prevVisits, series: null, pct: true },
    { label: segmented ? 'AI visits (not segmented)' : 'AI visits', cur: m.current.ai.total, prev: m.previous.ai.total, sample: m.previous.ai.total, series: m.daily.map((d) => d.ai) },
    // Bots carry no UTM tags, so AI traffic ignores the segment; a ratio against
    // segmented visits would mix two populations.
    ...(segmented ? [] : [{ label: 'AI per 100 visits', cur: m.current.visits ? (m.current.ai.total / m.current.visits) * 100 : 0,
      prev: prevVisits ? (m.previous.ai.total / prevVisits) * 100 : 0, sample: prevVisits, series: null }]),
  ];
  // Visits, page views and conversions are recorded after consent; AI traffic is not.
  const tiles = aggregateOnly ? allTiles.filter((t) => t.label.startsWith('AI visits')) : allTiles;
  return (
    <WidgetCard title="Key figures" subtitle={`${from} – ${to}`}
      exportData={() => ({
        filename: `cortiq-overview-${from}-${to}`,
        columns: ['Date', 'Visits', 'Page views', 'Conversions', 'AI visits'],
        rows: m.daily.map((d) => [d.date, d.visits, d.pageViews, d.conversions, d.ai]),
      })}>
      {aggregateOnly && (
        <p className="mb-4 text-sm text-muted-foreground">
          No consented visits in this period. Visitor figures come from aggregate measurement above.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          // Fixed label height and a sparkline slot on every tile keep values, deltas and
          // sparklines on the same row however the labels wrap.
          <div key={t.label} className="flex flex-col gap-1">
            <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{t.pct ? `${t.cur.toFixed(1)}%` : fmt.format(Math.round(t.cur * 10) / 10)}</p>
            <div className="min-h-4 whitespace-nowrap"><Delta current={t.cur} previous={t.prev} sample={t.sample} /></div>
            {t.series ? <Sparkline data={t.series} /> : <div style={{ height: 40 }} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
