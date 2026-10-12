import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Link2, Loader2, RotateCcw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportView } from '@/components/tracking-check/ReportView';
import { RunProgress } from '@/components/tracking-check/RunProgress';
import { useAuth } from '@/hooks/useAuth';
import { shareUrl, useFindings, useRun, useRunStatus, useShareRun, useVerifyFinding } from '@/hooks/useTrackingCheck';
import { toCsv } from '../../supabase/functions/_shared/tracking-check/report.ts';

export default function TrackingCheckRun() {
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
  if (!run.data) return <main className="container mx-auto px-4 py-16"><p>Run not found.</p><Link to="/tracking-check" className="underline">Back</Link></main>;
  const r = run.data;

  const downloadCsv = () => {
    const blob = new Blob([toCsv(findings.data ?? [])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tracking-check-${new URL(r.target_url).hostname}-${r.created_at.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copyShare = async () => {
    const token = r.share_token ?? (await share.mutateAsync(null)).token;
    await navigator.clipboard.writeText(shareUrl(token));
    toast.success('Share link copied');
  };

  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-10">
      <Link to="/tracking-check" className="text-sm text-muted-foreground hover:underline">← Tracking Check</Link>
      {active && <RunProgress status={status.data?.status ?? r.status} progress={status.data?.progress} />}
      {r.status === 'failed' && <p className="rounded-md border border-destructive p-4">The check failed: {r.error ?? 'unknown error'}. Start it again from the Tracking Check page.</p>}
      {r.status === 'done' && r.summary && findings.data && (
        <ReportView
          summary={r.summary} findings={findings.data} mode={r.mode} baselineUrl={r.baseline_url} targetUrl={r.target_url} finishedAt={r.finished_at}
          onVerify={(f, verified) => f.id && verify.mutate({ id: f.id, verified, email: user?.email ?? null })}
          actions={<>
            <Button variant="outline" onClick={downloadCsv}><Download className="mr-2 h-4 w-4" aria-hidden />Export CSV</Button>
            <Button variant="outline" onClick={copyShare} disabled={share.isPending}><Link2 className="mr-2 h-4 w-4" aria-hidden />{r.share_token ? 'Copy share link' : 'Create share link'}</Button>
            {r.share_token && <Button variant="ghost" onClick={() => revoke.mutate()}><Unlink className="mr-2 h-4 w-4" aria-hidden />Revoke link</Button>}
            <Button variant="ghost" onClick={() => navigate('/tracking-check', { state: { prefill: r } })}><RotateCcw className="mr-2 h-4 w-4" aria-hidden />Run again</Button>
          </>}
        />
      )}
    </main>
  );
}
