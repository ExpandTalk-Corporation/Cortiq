import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScheduleRun, useSchedules, useTrackingCheckAccess, type Frequency, type RunRow } from '@/hooks/useTrackingCheck';

const LABEL: Record<Frequency | 'off', string> = { off: 'Off', weekly: 'Weekly', monthly: 'Monthly' };

/** Off / Weekly / Monthly reruns of a finished run. Shown to the run's owner only. */
export function ScheduleControl({ run }: { run: RunRow }) {
  const schedules = useSchedules();
  const access = useTrackingCheckAccess();
  const mutation = useScheduleRun(run.id);
  const schedule = run.schedule_id ? schedules.data?.find((s) => s.id === run.schedule_id) : undefined;
  const value: Frequency | 'off' = schedule?.enabled ? schedule.frequency : 'off';
  const cap = access.data?.schedules;
  const full = !!cap && value === 'off' && cap.active >= cap.max;

  if (run.requires_auth) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        This check used login credentials, so it can't be scheduled. Credentials are deleted after each run.
      </p>
    );
  }

  const change = (next: string) => {
    mutation.mutate(next as Frequency | 'off', {
      onSuccess: (res) => toast.success(res.frequency === 'off'
        ? 'Scheduled check turned off'
        : `Scheduled ${LABEL[res.frequency].toLowerCase()}. Next check ${res.nextRunAt ? new Date(res.nextRunAt).toLocaleDateString() : 'soon'}.`),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-2 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarClock className="h-4 w-4" aria-hidden />
        <span className="font-medium">Re-run this check</span>
        <Select value={value} onValueChange={change} disabled={mutation.isPending || schedules.isLoading}>
          <SelectTrigger className="w-36" aria-label="Schedule"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="weekly" disabled={full}>Weekly</SelectItem>
            <SelectItem value="monthly" disabled={full}>Monthly</SelectItem>
          </SelectContent>
        </Select>
        {schedule?.enabled && <span className="text-sm text-muted-foreground">Next check {new Date(schedule.next_run_at).toLocaleDateString()}</span>}
      </div>
      <p className="text-sm text-muted-foreground">
        Scheduled checks re-run the same public pages and show what changed since the previous check. Checks that used login credentials can't be scheduled.
        Scheduled checks don't count against your daily limit.
        {cap && <> {cap.active} of {cap.max} scheduled checks in use.</>}
      </p>
    </div>
  );
}
