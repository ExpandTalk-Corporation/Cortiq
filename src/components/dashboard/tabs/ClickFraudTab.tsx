import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, ShieldCheck, Bot, Zap, Clock, AlertTriangle, DollarSign } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { GoogleAdsApiSetup } from '@/components/dashboard/GoogleAdsApiSetup';
import { useAcquisitionReadiness } from '@/hooks/useAcquisitionReadiness';
import { SetupChecklist } from '../setup/SetupChecklist';
import { googleAdsApiStep, paidMediumStep, trackingStep } from '../setup/acquisitionSteps';

interface ClickFraudTabProps {
  selectedSite: string;
  startDate?: string;
  endDate?: string;
  onNavigate?: (tab: string) => void;
}

interface Summary {
  total_paid_sessions: number;
  estimated_fraud_sessions: number;
  estimated_fraud_rate: number;
  total_campaigns_analyzed: number;
  bot_confirmed_sessions: number;
  zombie_sessions: number;
}

interface Campaign {
  campaign: string;
  source: string;
  medium: string;
  total_sessions: number;
  bot_sessions: number;
  zombie_sessions: number;
  suspicious_hour_sessions: number;
  fraud_rate: number;
  avg_fraud_score: number;
  risk_level: 'high' | 'medium' | 'low';
  ga_clicks: number | null;
  ga_invalid_clicks: number | null;
  ga_invalid_click_rate: number | null;
  ga_cost_micros: number | null;
}

interface HourBucket {
  hour: number;
  count: number;
  suspicious: boolean;
}

interface SuspiciousSession {
  session_id: string;
  campaign: string;
  duration_seconds: number;
  page_views: number;
  device_type: string;
  is_bot_confirmed: boolean;
  is_zombie: boolean;
  bot_type?: string;
  fraud_score: number;
}

const riskColor = {
  high: 'destructive' as const,
  medium: 'secondary' as const,
  low: 'outline' as const,
};

const riskLabel = {
  high: 'High risk',
  medium: 'Medium risk',
  low: 'Low risk',
};

export function ClickFraudTab({ selectedSite, startDate, endDate, onNavigate }: ClickFraudTabProps) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [timeDistribution, setTimeDistribution] = useState<HourBucket[]>([]);
  const [suspiciousSessions, setSuspiciousSessions] = useState<SuspiciousSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [googleAdsConnected, setGoogleAdsConnected] = useState(false);
  const [runCount, setRunCount] = useState(0);
  // ROI calculator state. Hooks stay above the early returns below (rules of hooks).
  const [monthlySpend, setMonthlySpend] = useState('');
  const [cpc, setCpc] = useState('');
  const { data: readiness } = useAcquisitionReadiness(selectedSite);

  useEffect(() => {
    if (!selectedSite) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);

      const { data, error: fnError } = await supabase.functions.invoke('click-fraud-analysis', {
        body: { siteId: selectedSite, startDate, endDate },
      });


      setLoading(false);

      if (fnError) {
        setError('Could not fetch fraud analysis: ' + fnError.message);
        return;
      }

      if (!data?.success) {
        setError(data?.error ?? 'Unknown error');
        return;
      }

      setSummary(data.summary);
      setCampaigns(data.campaigns ?? []);
      setTimeDistribution(data.time_distribution ?? []);
      setSuspiciousSessions(data.suspicious_sessions ?? []);
      setGoogleAdsConnected(!!data.google_ads_connected);
      if (data.message) setMessage(data.message);
    };

    run();
  }, [selectedSite, startDate, endDate, runCount]);

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

  if (message || !summary) {
    return (
      <div className="space-y-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            No ad visits in the selected period, so there is nothing to analyse. Click fraud is estimated from the behaviour of
            visits whose landing link has a paid utm_medium.
          </AlertDescription>
        </Alert>
        {readiness && (
          <SetupChecklist
            title="How to get click fraud analysis"
            steps={[trackingStep(readiness), paidMediumStep(readiness), googleAdsApiStep(readiness)]}
            onNavigate={onNavigate}
          />
        )}
        <GoogleAdsApiSetup
          siteId={selectedSite}
          onConfigured={() => setRunCount(n => n + 1)}
        />
      </div>
    );
  }

  const fraudPercent = summary.estimated_fraud_rate;
  const fraudRisk = fraudPercent > 15 ? 'high' : fraudPercent > 7 ? 'medium' : 'low';
  const hasGaColumns = campaigns.some(c => c.ga_invalid_clicks !== null);

  const roiSpend = parseFloat(monthlySpend) || 0;
  const roiCpc = parseFloat(cpc) || 0;
  const estimatedClicks = roiCpc > 0 ? Math.round(roiSpend / roiCpc) : 0;
  const wastedClicks = Math.round(estimatedClicks * (fraudPercent / 100));
  const wastedBudget = Math.round(wastedClicks * roiCpc);
  const annualWaste = wastedBudget * 12;

  return (
    <div className="space-y-6">

      {/* ROI Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-primary" />
            Wasted budget calculator
          </CardTitle>
          <CardDescription>
            Enter your monthly ad spend and average CPC to estimate what click fraud is costing you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="monthly-spend">Monthly ad spend</Label>
              <Input
                id="monthly-spend"
                type="number"
                placeholder="e.g. 50000"
                value={monthlySpend}
                onChange={e => setMonthlySpend(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpc">Avg. cost per click (CPC)</Label>
              <Input
                id="cpc"
                type="number"
                placeholder="e.g. 12"
                value={cpc}
                onChange={e => setCpc(e.target.value)}
              />
            </div>
          </div>
          {roiSpend > 0 && roiCpc > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3 text-center bg-muted/30">
                <p className="text-lg font-bold">{estimatedClicks.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-muted-foreground">Estimated clicks/mo</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-destructive/5 border-destructive/20">
                <p className="text-lg font-bold text-destructive">{wastedClicks.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-muted-foreground">Fraudulent clicks/mo</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-destructive/5 border-destructive/20">
                <p className="text-lg font-bold text-destructive">{wastedBudget.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-muted-foreground">Wasted budget/mo</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-destructive/10 border-destructive/30">
                <p className="text-lg font-bold text-destructive">{annualWaste.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-muted-foreground">Annual waste</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Ads API setup */}
      <GoogleAdsApiSetup
        siteId={selectedSite}
        onConfigured={() => setRunCount(n => n + 1)}
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <ShieldAlert className={`h-10 w-10 ${fraudRisk === 'high' ? 'text-destructive' : fraudRisk === 'medium' ? 'text-yellow-500' : 'text-green-500'}`} />
            <div>
              <p className="text-2xl font-bold">{summary.estimated_fraud_rate}%</p>
              <p className="text-sm text-muted-foreground">Estimated fraud rate</p>
              <Badge variant={riskColor[fraudRisk]} className="mt-1 text-xs">
                {riskLabel[fraudRisk]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <Bot className="h-10 w-10 text-primary" />
            <div>
              <p className="text-2xl font-bold">{summary.bot_confirmed_sessions}</p>
              <p className="text-sm text-muted-foreground">Bot-confirmed clicks</p>
              <p className="text-xs text-muted-foreground mt-1">Webdriver / Headless</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <Zap className="h-10 w-10 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{summary.zombie_sessions}</p>
              <p className="text-sm text-muted-foreground">Zombie-sessions</p>
              <p className="text-xs text-muted-foreground mt-1">&lt;5s + 1 page view</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <ShieldCheck className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{summary.total_paid_sessions}</p>
              <p className="text-sm text-muted-foreground">Total paid sessions</p>
              <p className="text-xs text-muted-foreground mt-1">{summary.total_campaigns_analyzed} campaigns</p>
              {googleAdsConnected && (
                <Badge variant="outline" className="mt-1 text-xs border-blue-500 text-blue-500">+ Google Ads API</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign risk table */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fraud risk per campaign</CardTitle>
            <CardDescription>
              Ranked by average fraud score. Bot-confirmed clicks count fully, zombie sessions count half.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left p-3">Campaign</th>
                    <th className="text-right p-3">Sessions</th>
                    <th className="text-right p-3">Bots</th>
                    <th className="text-right p-3">Zombies</th>
                    <th className="text-right p-3">Our fraud rate</th>
                    {hasGaColumns && <>
                      <th className="text-right p-3 text-blue-500">GA Invalid Clicks</th>
                      <th className="text-right p-3 text-blue-500">GA Invalid Rate</th>
                    </>}
                    <th className="text-right p-3">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      <td className="p-3">
                        <div className="font-medium">{c.campaign}</div>
                        <div className="text-xs text-muted-foreground">{c.source} / {c.medium}</div>
                      </td>
                      <td className="text-right p-3">{c.total_sessions}</td>
                      <td className="text-right p-3 text-destructive font-medium">{c.bot_sessions}</td>
                      <td className="text-right p-3 text-yellow-600 font-medium">{c.zombie_sessions}</td>
                      <td className="text-right p-3">{c.fraud_rate}%</td>
                      {hasGaColumns && <>
                        <td className="text-right p-3 font-medium">
                          {c.ga_invalid_clicks !== null ? c.ga_invalid_clicks.toLocaleString('sv-SE') : '—'}
                        </td>
                        <td className="text-right p-3">
                          {c.ga_invalid_click_rate !== null ? (
                            <Badge variant={c.ga_invalid_click_rate > 10 ? 'destructive' : c.ga_invalid_click_rate > 5 ? 'secondary' : 'outline'}>
                              {c.ga_invalid_click_rate}%
                            </Badge>
                          ) : '—'}
                        </td>
                      </>}
                      <td className="text-right p-3">
                        <Badge variant={riskColor[c.risk_level]}>{riskLabel[c.risk_level]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time of day chart */}
      {timeDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clicks per hour (UTC)</CardTitle>
            <CardDescription>
              Red bars = suspicious activity (hours 01–05 with unusually high traffic)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeDistribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={h => `${h}:00 UTC`}
                  formatter={(v) => [v, 'Sessions']}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {timeDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.suspicious ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Suspicious sessions */}
      {suspiciousSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suspicious sessions</CardTitle>
            <CardDescription>Sessions with fraud score ≥ 40 (bot-detected or zombie sessions)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left p-3">Session</th>
                    <th className="text-left p-3">Campaign</th>
                    <th className="text-right p-3">Duration</th>
                    <th className="text-right p-3">Pages</th>
                    <th className="text-right p-3">Device</th>
                    <th className="text-right p-3">Signal</th>
                    <th className="text-right p-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {suspiciousSessions.map((s, i) => (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      <td className="p-3 font-mono text-xs text-muted-foreground">{s.session_id}</td>
                      <td className="p-3">{s.campaign}</td>
                      <td className="text-right p-3">{s.duration_seconds}s</td>
                      <td className="text-right p-3">{s.page_views}</td>
                      <td className="text-right p-3">{s.device_type}</td>
                      <td className="text-right p-3">
                        {s.is_bot_confirmed && (
                          <Badge variant="destructive" className="text-xs mr-1">
                            {s.bot_type ?? 'Bot'}
                          </Badge>
                        )}
                        {s.is_zombie && (
                          <Badge variant="secondary" className="text-xs">Zombie</Badge>
                        )}
                      </td>
                      <td className="text-right p-3">
                        <span className={s.fraud_score >= 70 ? 'text-destructive font-bold' : s.fraud_score >= 40 ? 'text-yellow-600 font-medium' : ''}>
                          {s.fraud_score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            How the fraud score is calculated
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><span className="font-medium text-foreground">Bot confirmed (+60p):</span> Session matches your own bot signals (same session_id appears in AI bot tracker with webdriver/headless)</p>
          <p><span className="font-medium text-foreground">Webdriver (+20p):</span> Probe signal detected automation tools</p>
          <p><span className="font-medium text-foreground">Headless browser (+10p):</span> No visible browser window</p>
          <p><span className="font-medium text-foreground">Zombie session (+30p):</span> Duration under 5 seconds and only 1 page view</p>
          <p className="pt-2 border-t">Sessions with score ≥ 40 are counted as suspicious. Fraud rate is based on (bot sessions + zombie sessions × 0.5) / total paid sessions. Google Ads invalid click data (via Google Ads API) can be added in the next iteration.</p>
        </CardContent>
      </Card>
    </div>
  );
}
