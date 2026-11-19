// Measurement health tab (spec 2026-11-19 §4): status strip + checks (HealthSummary) and the signal
// inventory (SignalTable). Both read the same cached get_measurement_health query.
import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react';
import sriManifest from '@/lib/sri-manifest.json';
import { useMeasurementHealth } from '@/hooks/useMeasurementHealth';
import {
  CHECKS, SIGNALS, checkSentence, trackerVersionStatus,
  type CheckStatus, type SriManifest,
} from '../../../../supabase/functions/_shared/measurement-health.ts';

const ICON: Record<CheckStatus, JSX.Element> = {
  ok: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />,
  warning: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />,
  broken: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />,
  unknown: <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />,
};
const STRIP: Record<'ok' | 'warning' | 'broken', string> = {
  ok: 'border-green-500/40 bg-green-500/10',
  warning: 'border-amber-500/50 bg-amber-500/10',
  broken: 'border-red-500/50 bg-red-500/10',
};
const WORD = { ok: 'Measurement works', warning: 'Measurement needs attention', broken: 'Measurement is broken' } as const;
const rank = { ok: 0, warning: 1, broken: 2 } as const;
const time = (iso: string) => new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

export function HealthSummary({ siteId, onNavigate }: { siteId: string; onNavigate?: (tab: string) => void }) {
  const { data, isLoading, isError } = useMeasurementHealth(siteId);
  if (isLoading) return <div className="rounded-lg border p-4 text-sm text-muted-foreground">Checking measurement…</div>;
  if (isError || !data) return <div className="rounded-lg border p-4 text-sm text-muted-foreground">Measurement health could not be loaded.</div>;

  const tracker = trackerVersionStatus(data.checks.find((c) => c.key === 'uptime')?.evidence?.snippet_version, sriManifest as SriManifest);
  const status = tracker && tracker.status !== 'ok' && rank[tracker.status] > rank[data.status] ? tracker.status : data.status;
  const issues = data.checks.filter((c) => c.status === 'warning' || c.status === 'broken').length
    + (tracker && tracker.status !== 'ok' ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 text-sm ${STRIP[status]}`}>
        <p className="font-medium">{WORD[status]}{issues ? ` · ${issues} open ${issues === 1 ? 'issue' : 'issues'}` : ''}</p>
        <p className="text-muted-foreground">Checked {time(data.checked_at)}</p>
      </div>
      <ul className="divide-y rounded-lg border text-sm">
        {data.checks.map((c) => (
          <li key={c.key} className="flex gap-2 p-3">
            {ICON[c.status]}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{CHECKS[c.key]?.label ?? c.key}</p>
              <p className="text-muted-foreground">{checkSentence(c)}</p>
            </div>
            {(() => {
              const fixTab = CHECKS[c.key]?.fixTab;
              return (c.status === 'warning' || c.status === 'broken') && onNavigate && fixTab ? (
                <button className="shrink-0 self-start text-xs underline" onClick={() => onNavigate(fixTab)}>Fix</button>
              ) : null;
            })()}
          </li>
        ))}
        {tracker && (
          <li className="flex gap-2 p-3">
            {ICON[tracker.status]}
            <div className="min-w-0 flex-1">
              <p className="font-medium">Tracker version</p>
              <p className="text-muted-foreground">{tracker.message}</p>
            </div>
            {tracker.status !== 'ok' && onNavigate && (
              <button className="shrink-0 self-start text-xs underline" onClick={() => onNavigate('setup')}>Fix</button>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

export function SignalTable({ siteId }: { siteId: string }) {
  const { data } = useMeasurementHealth(siteId);
  if (!data) return null;
  return (
    <div className="rounded-lg border text-sm">
      <p className="border-b p-3 font-medium">Signals arriving</p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="p-3 font-normal">Signal</th><th className="p-3 text-right font-normal">7 days</th><th className="p-3 text-right font-normal">28 days</th><th className="p-3 font-normal">Last seen</th></tr>
          </thead>
          <tbody>
            {data.signals.map((s) => {
              const never = !s.last_seen;
              return (
                <tr key={s.signal} className={`border-t ${never ? 'text-muted-foreground' : ''}`}>
                  <td className="p-3">{SIGNALS[s.signal] ?? s.signal}</td>
                  <td className="p-3 text-right tabular-nums">{Number(s.count_7d).toLocaleString('en-US')}</td>
                  <td className="p-3 text-right tabular-nums">{Number(s.count_28d).toLocaleString('en-US')}</td>
                  <td className="p-3">{never ? 'Not in 28 days' : time(s.last_seen!)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
