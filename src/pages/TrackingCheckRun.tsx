import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Link2, Loader2, RotateCcw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportView } from '@/components/tracking-check/ReportView';
import { RunProgress } from '@/components/tracking-check/RunProgress';
import { ScheduleControl } from '@/components/tracking-check/ScheduleControl';
import { useAuth } from '@/hooks/useAuth';
import { shareUrl, useFindings, useRun, useRunStatus, useShareRun, useVerifyFinding } from '@/hooks/useTrackingCheck';
import { toCsv } from '../../supabase/functions/_shared/tracking-check/report.ts';
import { trackingCheckXlsx } from '@/lib/trackingCheckXlsx';
import PublicLayout from "@/components/PublicLayout";

function TrackingCheckRunBody() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const run = useRun(runId);
  const active = run.data?.status === 'running' || run.data?.status === 'assessing';
  const status = useRunStatus(runId, !!active);
  const findings = useFindings(runId, run.data?.status === 'done');
  const { share, revoke } = useShareRun(runId);
  const verify = useVerifyFinding(runId);

  if (run.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" /></div>;
  if (run.isError) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <p className="text-destructive">Could not load this run: {(run.error as Error).message}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => run.refetch()}>Retry</Button>
          <Link to="/tracking-check/new" className="self-center text-sm underline">Back</Link>
        </div>
      </main>
    );
  }
  if (!run.data) return <main className="container mx-auto px-4 py-16"><p>Run not found.</p><Link to="/tracking-check/new" className="underline">Back</Link></main>;
  const r = run.data;

  const download = (blob: Blob, ext: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tracking-check-${new URL(r.target_url).hostname}-${r.created_at.slice(0, 10)}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  };
  const downloadCsv = () => download(new Blob([toCsv(findings.data ?? [])], { type: 'text/csv;charset=utf-8' }), 'csv');
  const downloadXlsx = async () => {
    if (!r.summary || !findings.data) return;
    try {
      download(await trackingCheckXlsx({ summary: r.summary, findings: findings.data, mode: r.mode, baselineUrl: r.baseline_url, targetUrl: r.target_url, finishedAt: r.finished_at }), 'xlsx');
    } catch (e) {
      toast.error(`Could not create the Excel file: ${(e as Error).message}`);
    }
  };
  const copyShare = async () => {
    const token = r.share_token ?? (await share.mutateAsync(null)).token;
    await navigator.clipboard.writeText(shareUrl(token));
    toast.success('Share link copied');
  };

  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-10">
      <Link to="/tracking-check/new" className="text-sm text-muted-foreground hover:underline">← Tracking Check</Link>
      {active && (
        <>
          {status.isError && (
            <div className="rounded-md border border-destructive p-4">
              <p className="text-destructive">Could not refresh progress: {(status.error as Error).message}</p>
              <Button className="mt-2" variant="outline" size="sm" onClick={() => status.refetch()}>Retry</Button>
            </div>
          )}
          <RunProgress status={status.data?.status ?? r.status} progress={status.data?.progress} />
        </>
      )}
      {r.status === 'failed' && <p className="rounded-md border border-destructive p-4">The check failed: {r.error ?? 'unknown error'}. Start it again from the Tracking Check page.</p>}
      {r.status === 'done' && r.summary && findings.isError && (
        <div className="rounded-md border border-destructive p-4">
          <p className="text-destructive">Could not load the findings: {(findings.error as Error).message}</p>
          <Button className="mt-2" variant="outline" size="sm" onClick={() => findings.refetch()}>Retry</Button>
        </div>
      )}
      {r.status === 'done' && r.summary && findings.data && (
        <ReportView
          summary={r.summary} findings={findings.data} mode={r.mode} baselineUrl={r.baseline_url} targetUrl={r.target_url} finishedAt={r.finished_at}
          onVerify={(f, verified) => f.id && verify.mutate({ id: f.id, verified, email: user?.email ?? null })}
          actions={<>
            <Button variant="outline" onClick={downloadCsv}><Download className="mr-2 h-4 w-4" aria-hidden />Export CSV</Button>
            <Button variant="outline" onClick={downloadXlsx}><FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />Export Excel</Button>
            <Button variant="outline" onClick={copyShare} disabled={share.isPending}><Link2 className="mr-2 h-4 w-4" aria-hidden />{r.share_token ? 'Copy share link' : 'Create share link'}</Button>
            {r.share_token && <Button variant="ghost" onClick={() => revoke.mutate()}><Unlink className="mr-2 h-4 w-4" aria-hidden />Revoke link</Button>}
            <Button variant="ghost" onClick={() => navigate('/tracking-check/new', { state: { prefill: r } })}><RotateCcw className="mr-2 h-4 w-4" aria-hidden />Run again</Button>
          </>}
        />
      )}
      {r.status === 'done' && <ScheduleControl run={r} />}
    </main>
  );
}

export default function TrackingCheckRun() {
  return (
    <PublicLayout>
      <TrackingCheckRunBody />
    </PublicLayout>
  );
}
