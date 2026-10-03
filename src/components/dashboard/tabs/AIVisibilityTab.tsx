import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSites } from '@/hooks/useSites';
import { GSCAIPerformanceSection } from '@/components/dashboard/GSCAIPerformanceSection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  RefreshCw, Globe, FileText, Code2, Bot, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Sparkles, CalendarClock, ExternalLink, Quote,
} from 'lucide-react';

interface PassageScore {
  heading: string;
  wordCount: number;
  total: number;
  grade: string;
  preview: string;
}

interface GeoAudit {
  id: string;
  url: string;
  overall_score: number;
  content_score: number;
  technical_score: number;
  schema_score: number;
  crawler_score: number;
  freshness_score: number;
  page_last_modified: string | null;
  findings: Record<string, unknown>;
  recommendations: Array<{ priority: string; category: string; issue: string; fix: string }>;
  schema_types: string[];
  crawler_access: Record<string, string>;
  has_llms_txt: boolean;
  citability_analysis: string | null;
  // Score model v2 (geo-analyze SCORE_VERSION); null/1 on older audits.
  citability_score: number | null;
  citability_details: { passages: number; optimalLengthPassages: number; top: PassageScore[]; bottom: PassageScore[] } | null;
  score_version: number;
  audit_duration_ms: number;
  created_at: string;
}

interface PageSummary {
  url: string;
  overall_score: number;
  freshness_score: number;
  page_last_modified: string | null;
  created_at: string;
}

interface AIVisibilityTabProps {
  siteId: string;
  onNavigateToIntegrations?: () => void;
}

const SCORE_COLOR = (score: number) =>
  score >= 75 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';

const SCORE_BG = (score: number) =>
  score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low:    'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const CRAWLER_ICON = (status: string) =>
  status === 'allowed'
    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
    : status === 'blocked'
    ? <XCircle className="h-4 w-4 text-red-400" />
    : <Clock className="h-4 w-4 text-muted-foreground" />;

// The crawlers that feed AI search answers (geo-analyze CITATION_CRAWLERS).
const KEY_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'GPTBot', 'Google-Extended'];

export function AIVisibilityTab({ siteId, onNavigateToIntegrations }: AIVisibilityTabProps) {
  const { selectedSite } = useSites();
  const defaultUrl = selectedSite?.domain
    ? (selectedSite.domain.startsWith('http') ? selectedSite.domain : `https://${selectedSite.domain}`)
    : '';

  const [audit, setAudit] = useState<GeoAudit | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [auditUrl, setAuditUrl] = useState(defaultUrl);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    const [{ data: latestAudit }, { data: allAudits }] = await Promise.all([
      supabase
        .from('geo_audits')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('geo_audits')
        .select('url, overall_score, freshness_score, page_last_modified, created_at')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false }),
    ]);
    setAudit(latestAudit ?? null);
    // Deduplicate: keep latest audit per URL
    const seen = new Set<string>();
    const deduped: PageSummary[] = [];
    for (const row of allAudits ?? []) {
      if (!seen.has(row.url)) {
        seen.add(row.url);
        deduped.push(row as PageSummary);
      }
    }
    setPages(deduped);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  async function runAudit() {
    const url = auditUrl.trim();
    if (!url) { toast.error('Enter the URL to analyze.'); return; }
    const normalized = `https://${url.replace(/^https?:\/\//i, '')}`;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('geo-analyze', {
        body: { siteId, url: normalized },
      });
      if (error || !data?.success) {
        let msg = data?.error ?? error?.message ?? 'Audit failed';
        try {
          const body = await (error as any)?.context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      setAudit(data.audit);
      // Refresh pages list with new entry
      setPages(prev => {
        const updated = prev.filter(p => p.url !== data.audit.url);
        return [{ url: data.audit.url, overall_score: data.audit.overall_score, freshness_score: data.audit.freshness_score, page_last_modified: data.audit.page_last_modified, created_at: data.audit.created_at }, ...updated];
      });
      toast.success('AI Visibility audit complete');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            AI Visibility
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Measures how likely AI systems (ChatGPT, Claude, Perplexity) are to cite your site.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/sidan-att-analysera"
            value={auditUrl}
            onChange={e => setAuditUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !running && runAudit()}
            disabled={running}
            className="max-w-lg"
          />
          <Button onClick={runAudit} disabled={running || !auditUrl.trim()} className="shrink-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Analyzing…' : audit ? 'Run new audit' : 'Run audit'}
          </Button>
        </div>
      </div>

      {!audit ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-30" />
            <p className="font-medium">No audit yet</p>
            <p className="text-sm mt-1">Click "Run audit" to analyze AI visibility.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Score cards */}
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
            <Card className="col-span-2 lg:col-span-1 bg-card border-border">
              <CardContent className="pt-6 text-center">
                <div className={`text-5xl font-bold ${SCORE_COLOR(audit.overall_score)}`}>
                  {audit.overall_score}
                </div>
                <div className="text-xs text-muted-foreground mt-1">GEO Score</div>
                <Progress value={audit.overall_score} className={`mt-3 h-1.5 [&>div]:${SCORE_BG(audit.overall_score)}`} />
              </CardContent>
            </Card>

            {[
              ...(audit.citability_score != null
                ? [{ label: 'Citability', score: audit.citability_score, icon: Quote, desc: `${audit.citability_details?.passages ?? 0} passages scored` }]
                : []),
              { label: 'Content', score: audit.content_score, icon: FileText, desc: 'Headings, word count, structure' },
              { label: 'Technical', score: audit.technical_score, icon: Code2, desc: audit.score_version >= 2 ? 'Meta, HTML rendering, security headers' : 'Meta, canonical, HTTPS' },
              { label: 'Schema', score: audit.schema_score, icon: Globe, desc: 'JSON-LD structured data' },
              { label: 'AI access', score: audit.crawler_score, icon: Bot, desc: audit.score_version >= 2 ? 'AI search crawlers and llms.txt' : 'Robots.txt AI access' },
              { label: 'Freshness', score: audit.freshness_score, icon: CalendarClock, desc: audit.page_last_modified ? `Updated ${new Date(audit.page_last_modified).toLocaleDateString('en-GB')}` : 'No date signal found' },
            ].map(({ label, score, icon: Icon, desc }) => (
              <Card key={label} className="bg-card border-border">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <div className={`text-3xl font-bold ${SCORE_COLOR(score)}`}>{score}</div>
                  <Progress value={score} className={`mt-2 h-1 [&>div]:${SCORE_BG(score)}`} />
                  <p className="text-xs text-muted-foreground mt-2">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Crawler access */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" /> AI Crawler access
                </CardTitle>
                <CardDescription>
                  {audit.has_llms_txt
                    ? <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> llms.txt found</span>
                    : <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> No llms.txt</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {KEY_CRAWLERS.map(crawler => (
                  <div key={crawler} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30">
                    <span className="text-sm font-mono">{crawler}</span>
                    <div className="flex items-center gap-2">
                      {CRAWLER_ICON(audit.crawler_access[crawler] ?? 'unknown')}
                      <span className="text-xs text-muted-foreground capitalize">
                        {audit.crawler_access[crawler] ?? 'unknown'}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Schema types */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-4 w-4" /> Schema.org markup
                </CardTitle>
                <CardDescription>Structured data that helps AI understand the content</CardDescription>
              </CardHeader>
              <CardContent>
                {audit.schema_types.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {audit.schema_types.map(type => (
                      <Badge key={type} variant="secondary">{type}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    No JSON-LD found
                  </p>
                )}
                {(audit.findings.wordCount as number) > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Word count</span>
                      <span>{audit.findings.wordCount as number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">H1 headings</span>
                      <span>{audit.findings.h1Count as number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">H2 headings</span>
                      <span>{audit.findings.h2Count as number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Meta description</span>
                      <span>{(audit.findings.metaDescription as string)?.length > 0 ? '✓' : '—'}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Passage citability (score v2) */}
          {audit.citability_details && audit.citability_details.top.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Quote className="h-4 w-4" /> Most citable passages
                </CardTitle>
                <CardDescription>
                  How likely an AI answer is to quote each section: a direct answer early, concrete numbers and sources,
                  and text that makes sense on its own. {audit.citability_details.optimalLengthPassages} of {audit.citability_details.passages} passages
                  are in the 134–167 word range AI answers quote most. Scoring patterns are tuned for English text.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {audit.citability_details.top.slice(0, 3).map((p, i) => (
                  <div key={i} className="rounded-md bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm font-medium truncate">{p.heading}</span>
                      <span className={`text-sm font-semibold ${SCORE_COLOR(p.total)}`}>{p.total} · {p.grade}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.preview}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Claude citability analysis */}
          {audit.citability_analysis && (
            <Card className="border-purple-500/20 bg-purple-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" /> Claude Citability Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{audit.citability_analysis}</p>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {audit.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Actions ({audit.recommendations.length})
                </CardTitle>
                <CardDescription>Sorted by priority — fix High issues first</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {audit.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border bg-card overflow-hidden">
                    <button
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                      onClick={() => setExpanded(expanded === `rec-${i}` ? null : `rec-${i}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge className={`shrink-0 text-xs border ${PRIORITY_BADGE[rec.priority] ?? ''}`}>
                          {rec.priority.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium truncate">{rec.issue}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">{rec.category}</Badge>
                        {expanded === `rec-${i}` ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>
                    {expanded === `rec-${i}` && (
                      <>
                        <Separator />
                        <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/20">
                          <span className="font-medium text-foreground">Fix: </span>
                          {rec.fix}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Footer metadata */}
          <p className="text-xs text-muted-foreground text-right">
            Last audit: {new Date(audit.created_at).toLocaleString('en-GB')}
            {audit.audit_duration_ms && ` · ${(audit.audit_duration_ms / 1000).toFixed(1)}s`}
            {' · '}<span className="font-mono">{audit.url}</span>
          </p>
        </>
      )}

      {/* Audited pages */}
      {pages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Audited pages
            </CardTitle>
            <CardDescription>Last-modified date extracted from each page — freshness at a glance</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left px-4 py-2 font-medium">Page</th>
                    <th className="text-center px-4 py-2 font-medium w-24">GEO</th>
                    <th className="text-center px-4 py-2 font-medium w-24">Freshness</th>
                    <th className="text-left px-4 py-2 font-medium w-36">Last modified</th>
                    <th className="text-left px-4 py-2 font-medium w-36">Audited</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map(page => (
                    <tr key={page.url} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline flex items-center gap-1 max-w-xs truncate"
                        >
                          <span className="truncate">{page.url.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                        </a>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-semibold ${SCORE_COLOR(page.overall_score)}`}>{page.overall_score}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-semibold ${SCORE_COLOR(page.freshness_score)}`}>{page.freshness_score}</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {page.page_last_modified
                          ? new Date(page.page_last_modified).toLocaleDateString('en-GB')
                          : <span className="text-xs opacity-50">not found</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {new Date(page.created_at).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Search Console – Generative AI Performance */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Google AI Search Performance</h3>
        <p className="text-sm text-muted-foreground">
          Impressions from AI Overviews, AI Mode, and Discover AI — fetched from your GSC connection.
        </p>
        <GSCAIPerformanceSection siteId={siteId} onNavigateToIntegrations={onNavigateToIntegrations} />
      </div>
    </div>
  );
}
