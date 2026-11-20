import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DISCLAIMER } from '@/lib/jurisdiction';
import { MIN_COUNTRY_ANSWERS } from '@/lib/pixelReadiness';
import { useCoverageByCountry } from '@/hooks/useCoverageByCountry';
import type { Site } from '@/types/dashboard';

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
const SOURCE: Record<string, string> = { country: 'country rate', site: 'site rate', assumed: 'assumed', blocked: 'blocked by rules' };

export function CoverageByCountryCard({ selectedSite }: { selectedSite: Site | null }) {
  const [marketing, setMarketing] = useState(false);
  const q = useCoverageByCountry(selectedSite, marketing ? 'marketing' : 'analytics');
  if (!selectedSite) return null;
  const d = q.data;
  const stats = (d?.coverage ?? []).filter((r) => r.purpose === 'statistics');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coverage by country</CardTitle>
        <CardDescription>Last 30 days. Decisions are daily counts from CortIQ's rule engine; countries come from the signed edge location only. {DISCLAIMER}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {q.error && <p className="text-sm text-destructive">Could not load coverage: {(q.error as Error).message}</p>}

        <section>
          <h4 className="mb-2 text-sm font-medium">Statistics: share measured per country</h4>
          {stats.length === 0 ? <p className="text-sm text-muted-foreground">No decisions logged yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Country</th><th>Decisions</th><th>Measured</th><th>No answer</th><th>Refused</th><th>Stopped</th></tr></thead>
              <tbody>{stats.map((r) => (
                <tr key={r.country} className="border-t"><td>{r.country || 'Unknown'}</td><td>{r.decisions}</td><td>{pct(r.permitted, r.decisions)}</td>
                  <td>{pct(r.missing, r.decisions)}</td><td>{pct(r.refused + r.gpc, r.decisions)}</td><td>{r.enforcedDrops}</td></tr>))}
              </tbody>
            </table></div>)}
          <p className="mt-1 text-xs text-muted-foreground">Stopping is not switched on yet; this column stays 0 until it is.</p>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-medium">Banner answers per country and language</h4>
          {(d?.acceptanceByLang.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No banner answers in the ledger for this period.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Country</th><th>Language</th><th>Answers</th><th>Analytics accepted</th><th>Marketing accepted</th></tr></thead>
              <tbody>{d!.acceptanceByLang.map((r) => (
                <tr key={`${r.country}-${r.bannerLang}`} className="border-t"><td>{r.country || 'Unknown'}</td><td>{r.bannerLang || 'Older banner'}</td><td>{r.answers}</td>
                  <td>{pct(r.analyticsAccepted, r.answers)}</td><td>{pct(r.marketingAccepted, r.answers)}</td></tr>))}
              </tbody>
            </table></div>)}
          <p className="mt-1 text-xs text-muted-foreground">Answers are deleted when they expire, so older periods show fewer.</p>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Pixel readiness per country</h4>
            <div className="flex items-center gap-2"><Switch id="mkt" checked={marketing} onCheckedChange={setMarketing} /><Label htmlFor="mkt">Use marketing acceptance</Label></div>
          </div>
          {!d?.readiness ? (
            <p className="text-sm text-muted-foreground">Needs aggregate measurement on and a primary page-visit or form goal.</p>
          ) : (
            <>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th>Country</th><th>Conversions</th><th>Acceptance</th><th>Ad platform would see</th></tr></thead>
                <tbody>{d.readiness.rows.map((r) => (
                  <tr key={r.country} className="border-t"><td>{r.country || 'Unknown'}</td><td>{r.conversions}</td>
                    <td>{Math.round(r.acceptanceUsed * 100)}% ({SOURCE[r.acceptanceSource]})</td><td>{r.effectiveConversions}</td></tr>))}
                </tbody>
              </table></div>
              <p className="mt-2 text-sm">Total ≈ {d.readiness.totalEffective} per 30 days ({d.readiness.band.replace('_', ' ')}).</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verify: goal "{d.primaryGoalName ?? '—'}", {d.from} to {d.to}. A country's own rate is used from {MIN_COUNTRY_ANSWERS} answers, otherwise the site rate.
                US and Canadian states are not split out. Smart Bidding thresholds (~30/~50) are a rule of thumb; check Google Ads documentation.
              </p>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
