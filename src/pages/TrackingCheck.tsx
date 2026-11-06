import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const navigate = useNavigate();
  // "Run again" passes the old run in router state. Read it once, then clear it: browser history keeps
  // router state across reloads and back/forward, so otherwise every later visit opens pre-filled.
  const [prefill, setPrefill] = useState(() => (location.state as { prefill?: RunRow } | null)?.prefill);
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

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
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Tracking Check</h1>
        <p className="mt-2 text-muted-foreground">Confirm your email address first: open the link in the email we sent when you created your account, then reload this page.</p>
      </main>
    );
  }
  const { limits, runsToday, tier } = access.data;
  const left = Math.max(0, limits.runsPerDay - runsToday);
  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Tracking Check</h1>
        <p className="mt-1 text-muted-foreground">
          A real browser opens each page before the cookie banner is answered, after "Reject all", after "Accept all" and with one category at a time, and records every request and cookie.{' '}
          <Link to="/tracking-check/" className="text-primary underline">How the check works</Link>
        </p>
      </div>
      {prefill && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 px-4 py-2 text-sm">
          <span>Pre-filled from the run on {prefill.target_url}</span>
          <Button variant="outline" size="sm" onClick={() => setPrefill(undefined)}>Start blank</Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {left} of {limits.runsPerDay} checks left in the last 24 hours.
        {tier === 'standard' && <> Need more? Contact <a className="text-primary underline" href="mailto:info@expandtalk.se">info@expandtalk.se</a>.</>}
      </p>
      <StartForm key={prefill?.id ?? 'new'} prefill={prefill} limits={limits} />
      <Card>
        <CardHeader><CardTitle>Your runs</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {runs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {runs.isError && (
            <div className="py-3">
              <p className="text-sm text-destructive">Could not load your runs: {(runs.error as Error).message}</p>
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
