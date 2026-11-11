import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDismissScheduleAlert, useScheduleAlerts, type ScheduleAlert } from '@/hooks/useTrackingCheck';

const describe = (a: ScheduleAlert) => [
  a.newProblems ? `${a.newProblems} new ${a.newProblems === 1 ? 'problem' : 'problems'}` : '',
  a.newVendors ? `${a.newVendors} new ${a.newVendors === 1 ? 'tool' : 'tools'}` : '',
  a.newCookies ? `${a.newCookies} new ${a.newCookies === 1 ? 'cookie' : 'cookies'}` : '',
].filter(Boolean).join(', ');

/**
 * In-app notice for scheduled Tracking Checks that found new problems. Account-wide (schedules are not
 * tied to a dashboard site); renders nothing when there is nothing to report or the data is unavailable.
 */
export function TrackingCheckAlerts() {
  const alerts = useScheduleAlerts();
  const dismiss = useDismissScheduleAlert();
  if (!alerts.data?.length) return null;
  return (
    <div className="space-y-2" role="status">
      {alerts.data.map((a) => (
        <div key={a.scheduleId} className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="flex-1">
            Scheduled Tracking Check of {a.targetUrl}{a.finishedAt && ` (${new Date(a.finishedAt).toLocaleDateString()})`}: {describe(a) || 'new problems'}.{' '}
            <Link to={`/tracking-check/${a.runId}`} className="font-medium text-primary underline">See what changed</Link>
          </p>
          <Button size="sm" variant="ghost" className="h-auto p-1" aria-label="Dismiss" disabled={dismiss.isPending} onClick={() => dismiss.mutate(a.scheduleId)}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
