import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, ShieldCheck, AlertTriangle, DollarSign, ExternalLink, Info, FileText } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { FinalUrlSuffixHint, GoogleAdsConnectHint } from '@/components/dashboard/GoogleAdsConnectCard';
import { useAcquisitionReadiness } from '@/hooks/useAcquisitionReadiness';
import { SetupChecklist } from '../setup/SetupChecklist';
import { googleAdsApiStep, paidMediumStep, trackingStep } from '../setup/acquisitionSteps';

interface ClickFraudTabProps {
  selectedSite: string;
  startDate?: string;
  endDate?: string;
  onNavigate?: (tab: string) => void;
}

// Same text as SUGGESTED_FINAL_URL_SUFFIX in supabase/functions/_shared/google-ads-setup.ts.
const FINAL_URL_SUFFIX = 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}';

// Mirrors supabase/functions/click-fraud-analysis (scores from _shared/click-fraud-score.ts).
type Level = 'low' | 'elevated' | 'high';
type Confidence = 'low' | 'medium' | 'high';

interface Signal {
  key: string;
  label: string;
  count: number;
  rate: number;
  points: number;
  max_points: number;
  reason: string;
  action?: string;
}

interface Scored {
  score: number;
  level: Level;
  confidence: Confidence;
  signals: Signal[];
}

interface Counts {
  paid_sessions: number;
  bot_sessions: number;
  reused_click_sessions: number;
  burst_sessions: number;
  zero_engagement_sessions: number;
  conversions: number;
}

interface AdsCounts {
  clicks: number;
  invalid_clicks: number;
  cost: number;
}

interface Day extends Counts, Scored {
  date: string;
  ads: AdsCounts | null;
}

interface Campaign extends Counts, Scored {
  campaign: string;
  sources: string[];
  ads: (AdsCounts & { id: string; name: string; conversions: number; targeted_countries: string[] }) | null;
}

interface Placement extends Counts, Scored {
  campaign: string;
  placement: string;
}

interface ExclusionCandidate {
  campaign: string;
  placement: string;
  display_name?: string | null;
  type?: string | null;
  clicks: number;
  cost: number;
  conversions: number;
  reason: string;
}

interface UnmatchedCampaign extends AdsCounts {
  id: string;
  name: string;
  conversions: number;
}

interface FraudResponse {
  success: true;
  from: string;
  to: string;
  summary: {
    total_paid_sessions: number;
    total_campaigns_analyzed: number;
    bot_confirmed_sessions: number;
    zombie_sessions: number;
    reused_click_sessions: number;
    burst_sessions: number;
    conversions: number;
    with_click_id: number;
    score: number;
    level: Level;
    confidence: Confidence;
  };
  signals: Signal[];
  days: Day[];
  campaigns: Campaign[];
  placements: Placement[];
  /** IANA zone of dates and hours: the Google Ads account time zone, or UTC without Ads. */
  timezone?: string;
  time_distribution: { hour: number; count: number }[];
  click_matching?: {
    available: boolean;
    reason?: string | null;
    days_queried?: number;
    gclids?: number;
    capped?: boolean;
    days_too_old?: number;
    days_over_limit?: number;
    matched_sessions?: number;
  };
  devices: Record<string, number>;
  ads: {
    connected: boolean;
    code: string | null;
    message: string | null;
    currency: string | null;
    totals: AdsCounts | null;
    unmatched_campaigns: UnmatchedCampaign[];
    exclusion_candidates: ExclusionCandidate[];
    errors: string[];
  };
  refund_guidance: {
    recommended: boolean;
    form_url: string;
    help_url: string;
    steps: string[];
    evidence: string[];
  };
  caveats: string[];
}

const LEVEL_BADGE: Record<Level, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
  high: { label: 'High', variant: 'destructive' },
  elevated: { label: 'Elevated', variant: 'secondary' },
  low: { label: 'Low', variant: 'outline' },
};

const levelColor = (l: Level) => (l === 'high' ? 'text-destructive' : l === 'elevated' ? 'text-yellow-600' : 'text-green-600');
const barColor = (score: number) => (score >= 60 ? 'hsl(var(--destructive))' : score >= 30 ? '#eab308' : 'hsl(var(--primary))');
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const money = (n: number | null | undefined, currency: string | null) =>
  `${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}${currency ? ` ${currency}` : ''}`;

function LevelBadge({ level, score }: { level: Level; score?: number }) {
  const b = LEVEL_BADGE[level];
  return <Badge variant={b.variant}>{score !== undefined ? `${score} · ` : ''}{b.label}</Badge>;
}

/** Signals with points, short form for table cells. */
function SignalChips({ signals }: { signals: Signal[] }) {
  const active = signals.filter((s) => s.points > 0);
  if (active.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map((s) => (
        <Badge key={s.key} variant="outline" className="text-xs" title={s.reason}>
          {s.label} +{s.points}
        </Badge>
      ))}
    </div>
  );
}

export function ClickFraudTab({ selectedSite, startDate, endDate, onNavigate }: ClickFraudTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FraudResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ROI calculator state. Hooks stay above the early returns below (rules of hooks).
  const [monthlySpend, setMonthlySpend] = useState('');
  const [cpc, setCpc] = useState('');
  const { data: readiness } = useAcquisitionReadiness(selectedSite);

  useEffect(() => {
    if (!selectedSite) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      const { data: res, error: fnError } = await supabase.functions.invoke('click-fraud-analysis', {
        body: { siteId: selectedSite, startDate, endDate },
      });
      if (cancelled) return;
      setLoading(false);

      if (fnError) {
        let message = fnError.message;
        try {
          const payload = await (fnError as any).context?.json?.();
          if (payload?.error) message = payload.error;
        } catch { /* keep the generic message */ }
        setError(message);
        return;
      }
      if (!res?.success) {
        setError(res?.error ?? 'Unknown error');
        return;
      }
      setData(res as FraudResponse);
    };

    run();
    return () => { cancelled = true; };
  }, [selectedSite, startDate, endDate]);

  if (!selectedSite) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Select a website to see click fraud analysis</AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Analyzing paid sessions...
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Click fraud analysis failed: {error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const { summary, ads } = data;
  const tzLabel = data.timezone || 'UTC';
  const adsClicks = ads.totals?.clicks ?? 0;
  const adsHint = !ads.connected && (
    <GoogleAdsConnectHint onNavigate={onNavigate}>
      {ads.code === 'not_configured'
        ? 'Google Ads is not set up on this CortIQ instance yet (developer token missing). Scores below use CortIQ sessions only.'
        : ads.code === 'no_customer'
          ? 'Google Ads is connected but no account is picked for this site. Pick one under Settings → Integrations → Google Ads.'
          : ads.code === 'token'
            ? 'Google Ads credentials need attention. Reconnect under Settings → Integrations → Google Ads.'
            : 'Connect Google Ads under Settings → Integrations → Google Ads to compare billed clicks with tracked sessions, see Google\'s invalid clicks, placements and location targets.'}
    </GoogleAdsConnectHint>
  );

  if (summary.total_paid_sessions === 0 && adsClicks === 0) {
    return (
      <div className="space-y-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            No ad visits in the selected period, so there is nothing to analyse. Click fraud is estimated from the behaviour of
            visits whose landing link has a paid utm_medium or a click id (gclid, msclkid, ...).
          </AlertDescription>
        </Alert>
        {readiness && (
          <SetupChecklist
            title="How to get click fraud analysis"
            steps={[trackingStep(readiness), paidMediumStep(readiness), googleAdsApiStep(readiness)]}
            onNavigate={onNavigate}
          />
        )}
        {adsHint}
      </div>
    );
  }

  // Waste estimate: share of paid sessions with a hard signal (automation or a reused click id).
  // Zero-engagement visits are left out on purpose: many are real people who bounced.
  const hardShare = summary.total_paid_sessions > 0
    ? Math.min(1, (summary.bot_confirmed_sessions + summary.reused_click_sessions) / summary.total_paid_sessions)
    : 0;
  const googleInvalidShare = ads.totals && ads.totals.clicks > 0 ? ads.totals.invalid_clicks / ads.totals.clicks : 0;
  const roiSpend = parseFloat(monthlySpend) || 0;
  const roiCpc = parseFloat(cpc) || 0;
  const estimatedClicks = roiCpc > 0 ? Math.round(roiSpend / roiCpc) : 0;
  const wastedClicks = Math.round(estimatedClicks * hardShare);
  const wastedBudget = Math.round(wastedClicks * roiCpc);

  const activeSignals = data.signals.filter((s) => s.points > 0 || s.key === 'google_invalid');
  const hasAdsColumns = data.campaigns.some((c) => c.ads);

  return (
    <div className="space-y-6">
      {adsHint}
      {ads.connected && ads.errors.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Some Google Ads reports could not be loaded: {ads.errors.join('; ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-2">
            <ShieldAlert className={`h-10 w-10 ${levelColor(summary.level)}`} />
            <p className="text-3xl font-bold">{summary.score}<span className="text-base text-muted-foreground">/100</span></p>
            <p className="text-sm text-muted-foreground">Invalid traffic score</p>
            <div className="flex gap-1">
              <LevelBadge level={summary.level} />
              <Badge variant="outline" className="text-xs">{summary.confidence} confidence</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center space-y-1">
            <p className="text-2xl font-bold">{num(summary.total_paid_sessions)}</p>
            <p className="text-sm text-muted-foreground">Paid sessions</p>
            <p className="text-xs text-muted-foreground">
              {summary.total_campaigns_analyzed} campaigns · {num(summary.with_click_id)} with click id · {num(summary.conversions)} conversions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center space-y-1">
            <p className="text-2xl font-bold text-destructive">{num(summary.bot_confirmed_sessions + summary.reused_click_sessions)}</p>
            <p className="text-sm text-muted-foreground">Hard signals</p>
            <p className="text-xs text-muted-foreground">
              {num(summary.bot_confirmed_sessions)} automated · {num(summary.reused_click_sessions)} reused click ids · {num(summary.burst_sessions)} in bursts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center space-y-1">
            {ads.connected && ads.totals ? (
              <>
                <p className="text-2xl font-bold">{num(ads.totals.clicks)}</p>
                <p className="text-sm text-muted-foreground">Google Ads clicks</p>
                <p className="text-xs text-muted-foreground">
                  {num(ads.totals.invalid_clicks)} invalid per Google ({pct(googleInvalidShare)}) · {money(ads.totals.cost, ads.currency)}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">{num(summary.zombie_sessions)}</p>
                <p className="text-sm text-muted-foreground">Zero-engagement sessions</p>
                <p className="text-xs text-muted-foreground">One page view, no click, scroll or form</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why this score</CardTitle>
          <CardDescription>Each signal adds up to its weight. Hover a chip in the tables below for the same reasons per day or campaign.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" /> No signal crossed its threshold in this period.
            </p>
          ) : activeSignals.map((s) => (
            <div key={s.key} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{s.label}</span>
                <Badge variant={s.points > 0 ? 'secondary' : 'outline'} className="text-xs shrink-0">
                  {s.key === 'google_invalid' ? 'info' : `+${s.points} / ${s.max_points}`}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{s.reason}</p>
              {s.action && <p className="text-sm"><span className="font-medium">Do: </span>{s.action}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per day */}
      {data.days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score per day</CardTitle>
            <CardDescription>Yellow ≥ 30 (elevated), red ≥ 60 (high). Days with Ads clicks but no tracked session are included.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.days} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [v, 'Score']} />
                <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                  {data.days.map((d) => <Cell key={d.date} fill={barColor(d.score)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {data.days.some((d) => d.score >= 30) && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Sessions</th>
                      {ads.connected && <th className="text-right p-2">Ads clicks</th>}
                      <th className="text-left p-2">Signals</th>
                      <th className="text-right p-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.filter((d) => d.score >= 30).sort((a, b) => b.score - a.score).slice(0, 14).map((d) => (
                      <tr key={d.date} className="border-b">
                        <td className="p-2 font-mono text-xs">{d.date}</td>
                        <td className="text-right p-2">{num(d.paid_sessions)}</td>
                        {ads.connected && <td className="text-right p-2">{d.ads ? num(d.ads.clicks) : '—'}</td>}
                        <td className="p-2"><SignalChips signals={d.signals} /></td>
                        <td className="text-right p-2"><LevelBadge level={d.level} score={d.score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per campaign */}
      {data.campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score per campaign</CardTitle>
            <CardDescription>
              With Google Ads connected, sessions match their campaign by gclid (Google Ads click_view, last 90 days) and
              otherwise by utm_campaign (campaign name or id).
              {data.click_matching?.available && data.click_matching.matched_sessions !== undefined
                ? ` ${num(data.click_matching.matched_sessions)} session(s) matched by gclid.`
                : ''}
              {data.click_matching?.reason === 'older_than_90_days' ? ' This range is older than 90 days, so only utm_campaign is used.' : ''}
              {(data.click_matching?.days_over_limit ?? 0) > 0
                ? ` gclid matching covered the latest ${data.click_matching?.days_queried} days with clicks; earlier days use utm_campaign.`
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left p-2">Campaign</th>
                    <th className="text-right p-2">Sessions</th>
                    <th className="text-right p-2">Conv.</th>
                    {hasAdsColumns && <>
                      <th className="text-right p-2">Ads clicks</th>
                      <th className="text-right p-2">Invalid (Google)</th>
                    </>}
                    <th className="text-left p-2">Signals</th>
                    <th className="text-right p-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.campaign} className="border-b hover:bg-muted/40 align-top">
                      <td className="p-2">
                        <div className="font-medium">{c.campaign}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.sources.join(', ')}{c.ads ? ` · Ads id ${c.ads.id}` : ''}
                        </div>
                      </td>
                      <td className="text-right p-2">{num(c.paid_sessions)}</td>
                      <td className="text-right p-2">{num(c.conversions)}</td>
                      {hasAdsColumns && <>
                        <td className="text-right p-2">{c.ads ? num(c.ads.clicks) : '—'}</td>
                        <td className="text-right p-2">
                          {c.ads ? `${num(c.ads.invalid_clicks)}${c.ads.clicks > 0 ? ` (${pct(c.ads.invalid_clicks / c.ads.clicks)})` : ''}` : '—'}
                        </td>
                      </>}
                      <td className="p-2"><SignalChips signals={c.signals} /></td>
                      <td className="text-right p-2"><LevelBadge level={c.level} score={c.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ads campaigns without utm_campaign */}
      {ads.unmatched_campaigns.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm space-y-1">
            <p>
              {ads.unmatched_campaigns.length} Google Ads {ads.unmatched_campaigns.length === 1 ? 'campaign has' : 'campaigns have'} clicks
              but no matching session in CortIQ (by gclid or utm_campaign): {ads.unmatched_campaigns.slice(0, 5).map((c) => `${c.name} (${num(c.clicks)} clicks)`).join(', ')}
              {ads.unmatched_campaigns.length > 5 ? ', ...' : ''}.
            </p>
            <FinalUrlSuffixHint suffix={FINAL_URL_SUFFIX}>
              <p>Add utm_campaign to the final URL suffix so visits match even when gclid matching is not available:</p>
            </FinalUrlSuffixHint>
          </AlertDescription>
        </Alert>
      )}

      {/* Placements */}
      {(ads.exclusion_candidates.length > 0 || data.placements.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suspicious placements</CardTitle>
            <CardDescription>
              Candidates to exclude in Google Ads → Content → Exclusions (Display, Video and Performance Max placements).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {ads.exclusion_candidates.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium mb-2">From Google Ads</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left p-2">Placement</th>
                      <th className="text-left p-2">Campaign</th>
                      <th className="text-right p-2">Clicks</th>
                      <th className="text-right p-2">Cost</th>
                      <th className="text-left p-2">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.exclusion_candidates.map((p) => (
                      <tr key={`${p.campaign}|${p.placement}`} className="border-b align-top">
                        <td className="p-2">
                          <div className="font-mono text-xs break-all">{p.placement}</div>
                          {p.display_name && p.display_name !== p.placement && <div className="text-xs text-muted-foreground">{p.display_name}</div>}
                        </td>
                        <td className="p-2">{p.campaign}</td>
                        <td className="text-right p-2">{num(p.clicks)}</td>
                        <td className="text-right p-2">{money(p.cost, ads.currency)}</td>
                        <td className="p-2 text-muted-foreground">{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.placements.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium mb-2">From CortIQ sessions (utm_content / utm_term)</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left p-2">Placement</th>
                      <th className="text-left p-2">Campaign</th>
                      <th className="text-right p-2">Sessions</th>
                      <th className="text-left p-2">Signals</th>
                      <th className="text-right p-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.placements.map((p) => (
                      <tr key={`${p.campaign}|${p.placement}`} className="border-b align-top">
                        <td className="p-2 font-mono text-xs break-all">{p.placement}</td>
                        <td className="p-2">{p.campaign}</td>
                        <td className="text-right p-2">{num(p.paid_sessions)}</td>
                        <td className="p-2"><SignalChips signals={p.signals} /></td>
                        <td className="text-right p-2"><LevelBadge level={p.level} score={p.score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Refund guidance */}
      <Card className={data.refund_guidance.recommended ? 'border-destructive/40' : undefined}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Ask Google for a refund
          </CardTitle>
          <CardDescription>
            {data.refund_guidance.recommended
              ? 'Some campaigns score elevated or high. Google reviews invalid-click reports and credits clicks it confirms as invalid.'
              : 'No campaign scores elevated in this period. Google already credits most invalid clicks automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal pl-5 space-y-1">
            {data.refund_guidance.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {data.refund_guidance.evidence.length > 0 && (
            <div>
              <p className="font-medium mb-1">Evidence to paste into the form</p>
              <pre className="whitespace-pre-wrap text-xs bg-muted/50 rounded p-3">{data.refund_guidance.evidence.join('\n')}</pre>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={data.refund_guidance.recommended ? 'default' : 'outline'}>
              <a href={data.refund_guidance.form_url} target="_blank" rel="noopener noreferrer">
                Invalid click form <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={data.refund_guidance.help_url} target="_blank" rel="noopener noreferrer">
                How Google handles invalid clicks <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hours */}
      {data.time_distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paid sessions per hour ({tzLabel})</CardTitle>
            <CardDescription>Sharp peaks at night local time often come from scheduled bots.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.time_distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(h) => `${h}:00 ${tzLabel}`} formatter={(v) => [v, 'Sessions']} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ROI calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-primary" />
            Wasted budget estimate
          </CardTitle>
          <CardDescription>
            Uses the share of paid sessions with a hard signal (automation or a reused click id): {pct(hardShare)}.
            Zero-engagement visits are not counted as waste.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="monthly-spend">Monthly ad spend</Label>
              <Input id="monthly-spend" type="number" placeholder="e.g. 50000" value={monthlySpend} onChange={(e) => setMonthlySpend(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpc">Avg. cost per click (CPC)</Label>
              <Input id="cpc" type="number" placeholder="e.g. 12" value={cpc} onChange={(e) => setCpc(e.target.value)} />
            </div>
          </div>
          {roiSpend > 0 && roiCpc > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3 text-center bg-muted/30">
                <p className="text-lg font-bold">{num(estimatedClicks)}</p>
                <p className="text-xs text-muted-foreground">Clicks/mo</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-destructive/5 border-destructive/20">
                <p className="text-lg font-bold text-destructive">{num(wastedClicks)}</p>
                <p className="text-xs text-muted-foreground">Likely invalid clicks/mo</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-destructive/5 border-destructive/20">
                <p className="text-lg font-bold text-destructive">{num(wastedBudget)}</p>
                <p className="text-xs text-muted-foreground">Budget/mo</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-destructive/10 border-destructive/30">
                <p className="text-lg font-bold text-destructive">{num(wastedBudget * 12)}</p>
                <p className="text-xs text-muted-foreground">Per year</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Caveats */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">How to read this</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-1">
            {data.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
