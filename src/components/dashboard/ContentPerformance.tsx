/**
 * Content Performance
 *
 * Two views:
 * - Pages (default when nothing is tagged): per-page views, visits, time on page, scroll reach,
 *   entry share and an engagement score, derived from page views and scroll milestones.
 * - Tagged blocks: impressions, clicks and CTR for elements marked data-cortiq-content.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportButton } from './ExportButton';
import { Eye, MousePointer, TrendingUp, FileText, Users, Clock } from 'lucide-react';
import { useContentPerformance, type ContentRow } from '@/hooks/useContentPerformance';
import { useContentPages } from '@/hooks/useContentPages';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { formatSeconds, MIN_VIEWS_FOR_SCORE, TIME_TARGET_SECONDS, type ContentPagesSummary } from '@/lib/contentPages';

interface ContentPerformanceProps {
  siteId: string;
}

type View = 'pages' | 'blocks';
type Range = { from: string; to: string };

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(v >= 10 ? 0 : 1)}%`);

function engagementClass(score: number) {
  if (score >= 60) return 'text-green-600 border-green-600/40';
  if (score >= 35) return 'text-amber-600 border-amber-600/40';
  return 'text-muted-foreground';
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function PagesView({ siteId, summary, loading, error, dateRange }: {
  siteId: string;
  summary: ContentPagesSummary | undefined;
  loading: boolean;
  error: unknown;
  dateRange: Range;
}) {
  const pages = summary?.pages ?? [];
  const timed = pages.filter((p) => p.avgTimeSeconds != null);
  const timedViews = timed.reduce((s, p) => s + p.views, 0);
  const avgTime = timedViews > 0
    ? Math.round(timed.reduce((s, p) => s + (p.avgTimeSeconds ?? 0) * p.views, 0) / timedViews)
    : null;
  const exportRows = pages.map((p) => ({
    path: p.path, title: p.title ?? '', views: p.views, visits: p.visits, entry_share_pct: p.entryShare,
    exit_rate_pct: p.exitRate, avg_time_seconds: p.avgTimeSeconds ?? '', reach_50_pct: p.reach50 ?? '',
    reach_75_pct: p.reach75 ?? '', reach_100_pct: p.reach100 ?? '', engagement: p.engagement ?? '',
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Eye} label="Page views" value={(summary?.pageViews ?? 0).toLocaleString()} />
        <StatCard icon={Users} label="Visits" value={(summary?.visits ?? 0).toLocaleString()} />
        <StatCard icon={Clock} label="Avg time on page" value={formatSeconds(avgTime)} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center gap-4">
            <CardTitle>Pages</CardTitle>
            <ExportButton
              config={{ reportType: 'content-pages', data: exportRows, siteId, dateRange, filename: 'content-pages' }}
              size="sm"
              variant="outline"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading pages...</div>
          ) : pages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{error ? 'Failed to load page data' : 'No page views in this period'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Avg time</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Scroll 50 / 75 / 100</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Entry share</TableHead>
                    <TableHead className="text-right">Engagement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((p) => (
                    <TableRow key={p.path}>
                      <TableCell className="max-w-[320px]">
                        <p className="font-medium truncate">{p.title || p.path}</p>
                        {p.title && <code className="text-xs text-muted-foreground truncate block">{p.path}</code>}
                      </TableCell>
                      <TableCell className="text-right">{p.views.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{p.visits.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatSeconds(p.avgTimeSeconds)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {p.reach50 == null ? '—' : `${pct(p.reach50)} / ${pct(p.reach75)} / ${pct(p.reach100)}`}
                      </TableCell>
                      <TableCell className="text-right">{pct(p.entryShare)}</TableCell>
                      <TableCell className="text-right">
                        {p.engagement == null
                          ? <span className="text-muted-foreground">—</span>
                          : <Badge variant="outline" className={engagementClass(p.engagement)}>{p.engagement}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            From page views of visitors who accepted analytics; URLs are grouped without query string.
            Time on page is the gap to the next page in the same visit, so the last page of a visit adds no time.
            Scroll reach uses the tracker&apos;s 25/50/75/100% milestones
            {summary && !summary.hasScroll ? ' (none recorded in this period)' : ''}.
            Engagement (0–100) averages continuing to another page, time on page (full marks at {TIME_TARGET_SECONDS}s)
            and 75% scroll reach; pages with fewer than {MIN_VIEWS_FOR_SCORE} views are not scored.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function BlocksView({ siteId, content, loading, error, dateRange }: {
  siteId: string;
  content: ContentRow[];
  loading: boolean;
  error: unknown;
  dateRange: Range;
}) {
  const totalImpressions = content.reduce((sum, c) => sum + c.impressions, 0);
  const totalClicks = content.reduce((sum, c) => sum + c.clicks, 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Eye} label="Total Impressions" value={totalImpressions.toLocaleString()} />
        <StatCard icon={MousePointer} label="Total Clicks" value={totalClicks.toLocaleString()} />
        <StatCard icon={TrendingUp} label="Average CTR" value={`${avgCTR.toFixed(2)}%`} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Tagged content blocks</CardTitle>
            <ExportButton
              config={{ reportType: 'content-performance', data: content, siteId, dateRange, filename: 'content-performance' }}
              size="sm"
              variant="outline"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading content performance...</div>
          ) : content.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{error ? 'Failed to load content performance' : 'No tagged content in this period'}</p>
              {!error && (
                <p className="text-sm mt-2 max-w-md mx-auto">
                  Add <code className="bg-muted px-2 py-1 rounded">data-cortiq-content="id"</code> to the elements you want
                  to measure (see the guide below). Counting needs tracking script 5.5.6 or later (WordPress plugin 5.5.6)
                  and only includes visitors who accepted analytics cookies.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Content</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.map((item) => (
                  <TableRow key={item.content_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.content_name || item.content_id}</p>
                        <code className="text-xs text-muted-foreground">{item.content_id}</code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.content_type || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{item.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={item.ctr >= 5 ? 'text-green-600 font-medium' : ''}>
                        {item.ctr.toFixed(2)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ContentPerformance({ siteId }: ContentPerformanceProps) {
  const { filters } = useDashboardFilters();
  const dateRange = { from: filters.from, to: filters.to };
  const blocks = useContentPerformance(siteId);
  const pages = useContentPages(siteId);
  const content = blocks.data ?? [];

  // Tagged blocks are shown first once a site has them; otherwise the first-party page view.
  const [chosen, setChosen] = useState<View | null>(null);
  const view: View = chosen ?? (content.length > 0 ? 'blocks' : 'pages');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setChosen(v as View)}>
          <TabsList>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="blocks">
              Tagged blocks{content.length > 0 ? ` (${content.length})` : ''}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {view === 'pages' && content.length === 0 && !blocks.isLoading && (
          <p className="text-xs text-muted-foreground max-w-md">
            For block-level impressions and clicks (banners, CTAs, videos), add{' '}
            <code className="bg-muted px-1 rounded">data-cortiq-content</code> to those elements.
          </p>
        )}
      </div>

      {view === 'pages' ? (
        <PagesView siteId={siteId} summary={pages.data} loading={pages.isLoading} error={pages.error} dateRange={dateRange} />
      ) : (
        <BlocksView siteId={siteId} content={content} loading={blocks.isLoading} error={blocks.error} dateRange={dateRange} />
      )}

      {/* Implementation Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Block-level tracking with data-cortiq-content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              The Pages view needs no setup. To measure individual elements, add the{' '}
              <code className="bg-muted px-2 py-1 rounded">data-cortiq-content</code> attribute:
            </p>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`<!-- Banner tracking -->
<div data-cortiq-content="hero-banner"
     data-cortiq-content-name="Hero CTA Banner"
     data-cortiq-content-type="banner">
  <button>Get Started</button>
</div>

<!-- CTA button tracking -->
<button data-cortiq-content="signup-cta"
        data-cortiq-content-name="Sign Up Button"
        data-cortiq-content-type="cta">
  Sign Up Now
</button>

<!-- Video tracking -->
<video data-cortiq-content="product-demo"
       data-cortiq-content-name="Product Demo Video"
       data-cortiq-content-type="video">
  <source src="demo.mp4">
</video>`}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Tracked Events</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Impression:</strong> at least half of the element is visible (once per element per page view)</li>
              <li>• <strong>Click:</strong> the element or anything inside it is clicked (once per element per page view)</li>
              <li>• Only aggregate counts per element and day are stored; no visitor identifiers.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
