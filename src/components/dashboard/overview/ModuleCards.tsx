// src/components/dashboard/overview/ModuleCards.tsx
import { Button } from '@/components/ui/button';
import { WidgetCard } from '@/components/dashboard/widgets/WidgetCard';
import { BOT_CATEGORY_META } from '@/lib/aiBotRegistry';
import type { OverviewMetrics } from '@/hooks/useOverviewMetrics';

type Issue = { goalName: string; issue: string };

export function ModuleCards({ m, goalIssues, goalCount, onNavigate }: {
  m: OverviewMetrics; goalIssues: Issue[]; goalCount: number; onNavigate: (tab: string) => void;
}) {
  const open = (tab: string, label = 'Open') => <Button variant="link" className="px-0" onClick={() => onNavigate(tab)}>{label} →</Button>;
  const ai = m.current.ai;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <WidgetCard title="AI agents" subtitle="Training, agentic and citation traffic"
        exportData={() => ({ filename: 'cortiq-ai-categories', columns: ['Category', 'Visits'],
          rows: [['Training', ai.training], ['Agentic', ai.agentic], ['Citation', ai.citation]] })}>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(['training', 'agentic', 'citation'] as const).map((k) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{BOT_CATEGORY_META[k]?.label ?? k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{ai[k]}</dd></div>
          ))}
        </dl>
        {open('ai-bots')}
      </WidgetCard>

      <WidgetCard title="Conversions" subtitle={goalCount ? `${goalCount} goals configured` : 'No goals configured'}>
        {goalCount === 0
          ? <p className="text-sm">Not set up. {open('conversion-goals', 'Set up goals')}</p>
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
