import { Link } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress as ProgressBar } from '@/components/ui/progress';
import type { Progress, RunStatus } from '@/hooks/useTrackingCheck';

export function RunProgress({ status, progress }: { status: RunStatus | undefined; progress: Progress | undefined }) {
  const finished = progress ? progress.done + progress.failed : 0;
  const pct = progress?.total ? Math.round((finished / progress.total) * 100) : 0;
  const assessing = status === 'assessing';
  const steps = [
    { label: 'Start the check', done: !!progress },
    { label: 'Visit each page: without answering the banner, after "Reject all" and after "Accept all"', done: assessing, active: !!progress && !assessing },
    { label: 'Build the report', done: false, active: assessing },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{assessing ? 'Building the report…' : 'Checking the site…'}</CardTitle>
        <CardDescription>This usually takes 1–3 minutes. The report opens on this page when it is ready.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2 text-sm">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              {s.done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" aria-hidden />
                : s.active ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border" aria-hidden />}
              <span className={s.done || s.active ? '' : 'text-muted-foreground'}>{s.label}</span>
            </li>
          ))}
        </ol>
        <ProgressBar value={assessing ? 100 : pct} aria-label="Progress" />
        <p className="text-sm text-muted-foreground">
          {progress ? `${finished} of ${progress.total} page visits done${progress.failed ? ` · ${progress.failed} could not be loaded` : ''}` : 'Starting…'}
        </p>
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">No need to wait here: the check keeps running and the report is saved under Your runs.</p>
          <Button asChild variant="outline" size="sm"><Link to="/tracking-check/new">Go to Your runs</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
