import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress as ProgressBar } from '@/components/ui/progress';
import type { Progress, RunStatus } from '@/hooks/useTrackingCheck';

export function RunProgress({ status, progress }: { status: RunStatus | undefined; progress: Progress | undefined }) {
  const finished = progress ? progress.done + progress.failed : 0;
  const pct = progress?.total ? Math.round((finished / progress.total) * 100) : 0;
  return (
    <Card>
      <CardHeader><CardTitle>{status === 'assessing' ? 'Building the report…' : 'Checking the site…'}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={pct} aria-label="Progress" />
        <p className="text-sm text-muted-foreground">
          {progress ? `${finished} of ${progress.total} checks done${progress.failed ? ` · ${progress.failed} could not be loaded` : ''}` : 'Starting…'}
        </p>
        <p className="text-sm text-muted-foreground">You can close this tab. The report is saved and listed under Recent runs.</p>
      </CardContent>
    </Card>
  );
}
