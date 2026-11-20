import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Info, TrendingUp, Bot, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface AIBotSecurityWidgetProps {
  siteId: string;
  /** Global dashboard date filter, inclusive YYYY-MM-DD. */
  from: string;
  to: string;
}

// Mirrors supabase/functions/_shared/bot-threat.ts (BotSource, ThreatAssessment, AiReview).
interface BotSource {
  name: string;
  userAgent: string;
  scanner: { name: string; kind: string } | null;
  visits: number;
  firstSeen: string;
  lastSeen: string;
  countries: Record<string, number>;
  uniquePages: number;
  topPages: string[];
  peakPerMinute: number;
  jsExecuted: number;
  webdriver: number;
  headless: number;
  automation: number;
}

interface ThreatIndicators {
  rapidFireRequests: number;
  ipConcentration: number;
  urlScanningPattern: number;
  automationScore: number;
  headlessRatio: number;
}

type Assessment =
  | { assessed: true; scoredVisits: number; score: number; level: 'Low' | 'Medium' | 'High'; indicators: ThreatIndicators }
  | { assessed: false; scoredVisits: number; reason: string };

interface AnalysisResult {
  totalVisits: number;
  truncated: boolean;
  assessment: Assessment;
  sources: BotSource[];
  review: { summary: string; findings: { title: string; detail: string }[]; actions: string[] } | null;
  reviewError: string | null;
}

const LEVEL_COLOR = { Low: 'bg-green-600', Medium: 'bg-yellow-500', High: 'bg-red-600' } as const;

const INDICATORS: { key: keyof ThreatIndicators; label: string; hint: string }[] = [
  { key: 'rapidFireRequests', label: 'Request rate', hint: 'Busiest bot per minute; above 10/min starts to count' },
  { key: 'urlScanningPattern', label: 'Page scanning', hint: 'Most distinct pages one bot requested; above 20 starts to count' },
  { key: 'ipConcentration', label: 'IP concentration', hint: 'Share of visits from one network range' },
  { key: 'automationScore', label: 'Automation', hint: 'Visits with 3+ automation signals' },
  { key: 'headlessRatio', label: 'Headless', hint: 'Visits from headless browsers' },
];

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });

const countryList = (countries: Record<string, number>) =>
  Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c === 'unknown' ? 'Not recorded' : c} (${n})`)
    .join(', ');

function signalList(s: BotSource): string[] {
  const out: string[] = [];
  if (s.webdriver) out.push(`webdriver flag on ${s.webdriver} of ${s.visits}`);
  if (s.headless) out.push(`headless on ${s.headless} of ${s.visits}`);
  if (s.automation) out.push(`3+ automation signals on ${s.automation} of ${s.visits}`);
  if (s.peakPerMinute > 10) out.push(`${s.peakPerMinute} requests in one minute`);
  if (s.uniquePages > 20) out.push(`${s.uniquePages} distinct pages`);
  return out;
}

function SourceRow({ source }: { source: BotSource }) {
  const signals = signalList(source);
  return (
    <div className="rounded-md border p-3 space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{source.name}</span>
        {source.scanner && <Badge variant="secondary">{source.scanner.kind}</Badge>}
        <span className="text-muted-foreground">
          {source.visits} {source.visits === 1 ? 'visit' : 'visits'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground break-all">{source.userAgent || 'No User-Agent'}</p>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Country</dt>
        <dd>{countryList(source.countries)}</dd>
        <dt className="text-muted-foreground">When</dt>
        <dd>
          {source.firstSeen === source.lastSeen
            ? formatTime(source.firstSeen)
            : `${formatTime(source.firstSeen)} – ${formatTime(source.lastSeen)}`}
        </dd>
        <dt className="text-muted-foreground">Pages</dt>
        <dd className="break-all">
          {source.topPages.join(', ')}
          {source.uniquePages > source.topPages.length && ` and ${source.uniquePages - source.topPages.length} more`}
        </dd>
        <dt className="text-muted-foreground">Signals</dt>
        <dd>{signals.length ? signals.join('; ') : 'None'}</dd>
      </dl>
    </div>
  );
}

export function AIBotSecurityWidget({ siteId, from, to }: AIBotSecurityWidgetProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // A result belongs to the range it was run for; drop it when the site or range changes.
  useEffect(() => { setAnalysis(null); }, [siteId, from, to]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-bot-behavior-analysis', {
        body: { siteId, startDate: from, endDate: to }
      });

      if (error) throw error;

      setAnalysis(data as AnalysisResult);
      toast.success('Analysis complete');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Could not run the analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const assessment = analysis?.assessment;

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-primary rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle>Bot security analysis</CardTitle>
              <CardDescription>
                Which bots visited, from where, and whether any of them behaves like a scraper
              </CardDescription>
            </div>
          </div>
          <Button onClick={runAnalysis} disabled={analyzing} className="bg-gradient-primary">
            {analyzing ? (
              <>
                <Activity className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Bot className="mr-2 h-4 w-4" />
                Run analysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {!analysis || !assessment ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Lists every bot in the selected period with its User-Agent, country, pages and the signals it triggered.
            A threat level is given from 20 visits by bots that are not known scanners.
          </p>
        ) : (
          <div className="space-y-6">
            {assessment.assessed ? (
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">Threat level</h3>
                    <p className="text-sm text-muted-foreground">
                      {assessment.scoredVisits} bot visits scored, {from} to {to}. Known scanners are listed but not scored.
                    </p>
                  </div>
                  <Badge className={`${LEVEL_COLOR[assessment.level]} text-white px-3 py-1`}>
                    {assessment.level} · {assessment.score.toFixed(0)}/100
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {INDICATORS.map(({ key, label, hint }) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{label}</span>
                        <span>{assessment.indicators[key].toFixed(0)}</span>
                      </div>
                      <Progress value={assessment.indicators[key]} className="h-1.5" />
                      <p className="text-[11px] text-muted-foreground">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {'reason' in assessment && assessment.reason} Nothing here needs blocking, robots.txt changes or rate limiting.
                </AlertDescription>
              </Alert>
            )}

            {analysis.review && (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 font-semibold">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  AI review
                </h3>
                <p className="text-sm">{analysis.review.summary}</p>
                {analysis.review.findings.map((f, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium">{f.title}</p>
                    <p className="text-muted-foreground">{f.detail}</p>
                  </div>
                ))}
                {analysis.review.actions.length > 0 && (
                  <div className="text-sm">
                    <p className="font-medium">Suggested actions</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {analysis.review.actions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Generated by AI from the bot list below. Check each point against that list before acting.
                </p>
              </div>
            )}
            {analysis.reviewError && (
              <p className="text-xs text-muted-foreground">AI review unavailable: {analysis.reviewError}</p>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">
                Bots in this period ({analysis.totalVisits} {analysis.totalVisits === 1 ? 'visit' : 'visits'}
                {analysis.truncated ? ', latest 500' : ''})
              </h3>
              {analysis.sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bot visits recorded in this period.</p>
              ) : (
                analysis.sources.map((s) => <SourceRow key={`${s.name}|${s.userAgent}`} source={s} />)
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
