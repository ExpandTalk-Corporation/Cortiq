// src/components/dashboard/overview/KpiRow.tsx
import { percentChange } from '@/lib/dashboard/filters';
import { Sparkline } from '@/components/dashboard/widgets/Sparkline';
import { WidgetCard } from '@/components/dashboard/widgets/WidgetCard';
import type { OverviewMetrics } from '@/hooks/useOverviewMetrics';

const fmt = new Intl.NumberFormat('en-US');

function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-xs text-muted-foreground">{current ? 'New' : '—'}</span>;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% <span className="font-normal text-muted-foreground">vs previous period</span>
    </span>
  );
}

export function KpiRow({ m, from, to }: { m: OverviewMetrics; from: string; to: string }) {
  const convRate = (t: { visits: number; conversions: number }) => (t.visits ? (t.conversions / t.visits) * 100 : 0);
  const tiles = [
    { label: 'Visits', cur: m.current.visits, prev: m.previous.visits, series: m.daily.map((d) => d.visits) },
    { label: 'Page views', cur: m.current.pageViews, prev: m.previous.pageViews, series: m.daily.map((d) => d.pageViews) },
    { label: 'Conversions', cur: m.current.conversions, prev: m.previous.conversions, series: m.daily.map((d) => d.conversions) },
    { label: 'Conversion rate', cur: convRate(m.current), prev: convRate(m.previous), series: null, pct: true },
    { label: 'AI visits', cur: m.current.ai.total, prev: m.previous.ai.total, series: m.daily.map((d) => d.ai) },
    { label: 'AI per 100 visits', cur: m.current.visits ? (m.current.ai.total / m.current.visits) * 100 : 0,
      prev: m.previous.visits ? (m.previous.ai.total / m.previous.visits) * 100 : 0, series: null },
  ];
  return (
    <WidgetCard title="Key figures" subtitle={`${from} – ${to}`}
      exportData={() => ({
        filename: `cortiq-overview-${from}-${to}`,
        columns: ['Date', 'Visits', 'Page views', 'Conversions', 'AI visits'],
        rows: m.daily.map((d) => [d.date, d.visits, d.pageViews, d.conversions, d.ai]),
      })}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="space-y-1">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{t.pct ? `${t.cur.toFixed(1)}%` : fmt.format(Math.round(t.cur * 10) / 10)}</p>
            <Delta current={t.cur} previous={t.prev} />
            {t.series && <Sparkline data={t.series} />}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
