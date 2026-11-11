// src/components/dashboard/overview/ModuleCards.tsx
import { Button } from '@/components/ui/button';
import { WidgetCard } from '@/components/dashboard/widgets/WidgetCard';
import { BOT_CATEGORY_META } from '@/lib/aiBotRegistry';
import type { OverviewMetrics } from '@/hooks/useOverviewMetrics';
import { KEY_PAGE_LABELS, type KeyPageSummary } from '@/hooks/useKeyPageVisits';

const fmt = new Intl.NumberFormat('en-US');

type Issue = { goalName: string; issue: string };

function KeyPages({ pages }: { pages: KeyPageSummary[] }) {
  if (pages.length === 0) {
    return <p className="text-xs text-muted-foreground">No visits to contact, cart or checkout pages in this period.</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {pages.map((p) => (
        <div key={p.category} className="flex flex-col"
          title={p.paths.slice(0, 5).map((r) => `${r.path}: ${r.visits} visits`).join('\n')}>
          <dt className="min-h-[2rem] text-xs leading-4 text-muted-foreground">{KEY_PAGE_LABELS[p.category]}</dt>
          <dd className="text-xl font-semibold tabular-nums">{fmt.format(p.visits)}</dd>
          <dd className="text-xs text-muted-foreground">visits</dd>
        </div>
      ))}
    </dl>
  );
}

export function ModuleCards({ m, goalIssues, goalCount, keyPages, onNavigate }: {
  m: OverviewMetrics; goalIssues: Issue[]; goalCount: number; keyPages: KeyPageSummary[]; onNavigate: (tab: string) => void;
}) {
  const open = (tab: string, label = 'Open') => <Button variant="link" className="px-0" onClick={() => onNavigate(tab)}>{label} →</Button>;
  const ai = m.current.ai;
  // Headless automation and hits no rule placed; the RPC keeps them out of the AI total.
  const unclassified = ai.unclassified ?? Math.max(0, ai.total - ai.training - ai.agentic - ai.citation);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <WidgetCard title="AI agents" subtitle="Training, agentic and citation traffic"
        exportData={() => ({ filename: 'cortiq-ai-categories', columns: ['Category', 'Visits'],
          rows: [['Training', ai.training], ['Agentic', ai.agentic], ['Citation', ai.citation], ['Unclassified', unclassified]] })}>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(['training', 'agentic', 'citation'] as const).map((k) => (
            // Fixed label height keeps the numbers level when a label wraps to two lines.
            <div key={k} className="flex flex-col">
              <dt className="flex min-h-[2rem] items-end justify-center text-xs leading-4 text-muted-foreground">{BOT_CATEGORY_META[k]?.label ?? k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{fmt.format(ai[k])}</dd></div>
          ))}
        </dl>
        {unclassified > 0 && <p className="text-xs text-muted-foreground">{unclassified} automated or unclassified, not counted as AI visits</p>}
        {open('ai-bots')}
      </WidgetCard>

      <WidgetCard title="Conversions" subtitle={goalCount ? `${goalCount} goals configured` : 'No goals configured — key pages recognised by URL'}>
        <KeyPages pages={keyPages} />
        {goalCount === 0
          ? <p className="text-sm">Goals count form submissions and phone clicks too. {open('conversion-goals', 'Set up goals')}</p>
          : goalIssues.length === 0
            ? <p className="text-sm">All goals look healthy. {open('conversion-goals')}</p>
            : <ul className="space-y-1 text-sm">{goalIssues.map((g) => (
                <li key={g.goalName + g.issue}><span className="font-medium">{g.goalName}</span>: {g.issue.replace(/_/g, ' ')}</li>))}
                <li>{open('conversion-goals', 'Fix in Goals')}</li></ul>}
      </WidgetCard>

      <WidgetCard title="Heatmaps & forms" subtitle="Clicks, scroll depth and form drop-off">
        <p className="text-sm text-muted-foreground">Recorded after analytics consent.</p>
        <div className="flex gap-4">{open('heatmap', 'Heatmaps')}{open('forms', 'Forms')}</div>
      </WidgetCard>

      <WidgetCard title="Server-side measurement" subtitle="AI crawlers that never run JavaScript">
        {m.serverHits > 0
          ? <p className="text-sm"><span className="text-xl font-semibold tabular-nums">{m.serverHits}</span> server-side hits in this period. {open('server-logs')}</p>
          : <p className="text-sm">Not set up — most AI crawlers are invisible without it. {open('server-logs', 'Install the adapter')}</p>}
      </WidgetCard>
    </div>
  );
}
