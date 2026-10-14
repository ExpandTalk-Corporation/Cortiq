import { Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StartForm } from '@/components/tracking-check/StartForm';
import { useRuns, useTrackingCheckAccess, type RunRow } from '@/hooks/useTrackingCheck';
import PublicLayout from "@/components/PublicLayout";

function TrackingCheckBody() {
  const access = useTrackingCheckAccess();
  const runs = useRuns();
  const prefill = (useLocation().state as { prefill?: RunRow } | null)?.prefill;

  if (access.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" /></div>;
  if (access.isError) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Tracking Check</h1>
        <p className="mt-2 text-destructive">Could not load Tracking Check: {(access.error as Error).message}</p>
        <Button className="mt-4" variant="outline" onClick={() => access.refetch()}>Retry</Button>
      </main>
    );
  }
  if (!access.data?.allowed) {
    return <main className="container mx-auto max-w-2xl px-4 py-16"><h1 className="text-2xl font-semibold">Tracking Check</h1><p className="mt-2 text-muted-foreground">Tracking Check is an internal tool. Ask an administrator for access.</p></main>;
  }
  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Tracking Check</h1>
        <p className="mt-1 text-muted-foreground">Verify UTM and click IDs, tags, CSP and consent behaviour before a site goes live.</p>
      </div>
      <StartForm key={prefill?.id ?? 'new'} prefill={prefill} />
      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {runs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {runs.isError && (
            <div className="py-3">
              <p className="text-sm text-destructive">Could not load recent runs: {(runs.error as Error).message}</p>
              <Button className="mt-2" variant="outline" size="sm" onClick={() => runs.refetch()}>Retry</Button>
            </div>
          )}
          {runs.data?.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {runs.data?.map((r) => (
            <Link key={r.id} to={`/tracking-check/${r.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:underline">
              <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              <Badge variant="outline">{r.mode === 'comparison' ? 'Comparison' : 'Policy'}</Badge>
              <span className="flex-1 truncate">{r.mode === 'comparison' ? `${r.baseline_url} → ${r.target_url}` : r.target_url}</span>
              <span className="text-sm">{r.status === 'done' ? r.summary?.headline : r.status === 'failed' ? 'Failed' : 'Running…'}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

export default function TrackingCheck() {
  return (
    <PublicLayout>
      <TrackingCheckBody />
    </PublicLayout>
  );
}
