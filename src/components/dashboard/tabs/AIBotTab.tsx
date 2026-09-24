import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, TrendingUp, FileText, Route, Monitor, Target, ClipboardList } from "lucide-react";
import { useAIBotTracking } from "@/hooks/useAIBotTracking";
import { useAIAgentJourney } from "@/hooks/useAIAgentJourney";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AIBotSecurityWidget } from "@/components/dashboard/AIBotSecurityWidget";
import { AIAgentFunnel } from "@/components/dashboard/AIAgentFunnel";
import { AIBrowserTypeBreakdown } from "@/components/dashboard/AIBrowserTypeBreakdown";
import { AgentRegistry } from "@/components/dashboard/AgentRegistry";
import { BotTrafficClassification } from "@/components/dashboard/BotTrafficClassification";
interface AIBotTabProps {
  selectedSite: {
    id: string;
    tracking_id: string;
    domain: string;
  };
}

export const AIBotTab = ({ selectedSite }: AIBotTabProps) => {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useAIBotTracking(selectedSite?.id, days);
  const { data: journeyData, isLoading: journeyLoading } = useAIAgentJourney(selectedSite?.id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Error loading AI bot data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const isEmpty = !data || data.totalTraffic === 0;

  return (
    <div className="space-y-6">
      {/* AI Security Widget */}
      <AIBotSecurityWidget siteId={selectedSite.id} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">AI Bot Intelligence</h2>
          <p className="text-muted-foreground mt-1">
            Track AI agents, their journeys, and conversions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="flex items-center gap-2">
            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            Live Monitoring
          </Badge>
        </div>
      </div>

      {/* Installation Instructions */}
      {isEmpty && (
        <Alert>
          <Bot className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">No AI bot activity detected yet</p>
              <p>
                The CortIQ tracking script already includes AI bot detection — install it from{' '}
                <strong>Settings → Setup &amp; tracking script</strong> (or use the WordPress plugin).
              </p>
              <p className="text-sm text-muted-foreground">
                Bot detection runs without visitor consent and only reports requests that look automated. Most training
                and citation crawlers never execute JavaScript, so connect Cloudflare logs under
                Server Logs to see them too.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="journey" className="flex items-center gap-2">
            <Route className="h-4 w-4" />
            Agent Journey
          </TabsTrigger>
          <TabsTrigger value="browser-types" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Browser Detection
          </TabsTrigger>
          <TabsTrigger value="registry" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Agent Registry
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total LLM Traffic</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.totalTraffic.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data?.botBreakdown.length || 0} unique AI models
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Citation Requests</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.citationRequests.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data && data.totalTraffic > 0 
                    ? `${Math.round((data.citationRequests / data.totalTraffic) * 100)}% of LLM traffic`
                    : '0% of LLM traffic'
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Training Crawlers</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.trainingCrawlers.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data && data.totalTraffic > 0 
                    ? `${((data.trainingCrawlers / data.totalTraffic) * 100).toFixed(1)}% of LLM traffic`
                    : '0% of LLM traffic'
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Agent Conversions</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{journeyData?.conversions || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {journeyData?.conversionRate.toFixed(1) || 0}% conversion rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Bot Traffic Classification */}
          {!isEmpty && data && (
            <BotTrafficClassification
              botBreakdown={data.botBreakdown}
              totalTraffic={data.totalTraffic}
            />
          )}

          {/* Bot Breakdown */}
          {!isEmpty && data && data.botBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>AI Bot Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.botBreakdown.map((bot) => (
                    <div key={bot.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{bot.name}</p>
                          <p className="text-sm text-muted-foreground">{bot.count} visits</p>
                        </div>
                      </div>
                      <Badge variant="secondary">{bot.percentage.toFixed(1)}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top URLs */}
          {!isEmpty && data && data.topUrls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Most Visited Pages by AI Bots</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.topUrls.map((page, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                      <p className="text-sm truncate flex-1">{page.url}</p>
                      <Badge variant="outline">{page.visits} visits</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Journey Tab */}
        <TabsContent value="journey" className="space-y-6">
          {journeyLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <>
              {/* Journey Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Agent Sessions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{journeyData?.totalSessions || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avg. pages/session</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{journeyData?.avgPagesPerSession.toFixed(1) || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avg. assets/session</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{journeyData?.avgAssetsPerSession.toFixed(1) || 0}</div>
                    <p className="text-xs text-muted-foreground">CSS, JS, images, fonts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Reaches conversion</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">{journeyData?.conversionRate.toFixed(1) || 0}%</div>
                  </CardContent>
                </Card>
              </div>

              {/* Funnel Visualization */}
              <AIAgentFunnel 
                funnel={journeyData?.funnel || []} 
                totalSessions={journeyData?.totalSessions || 0}
              />

              {/* Key Insight */}
              <Alert>
                <Route className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold">Why does this matter?</p>
                  <p className="text-sm mt-1">
                    Raw request volumes are a vanity metric. The real insight is in following
                    agents along their path through the site to the conversion page. If many requests
                    never reach the conversion path, the journey is broken for AI agents.
                  </p>
                </AlertDescription>
              </Alert>
            </>
          )}
        </TabsContent>

        {/* Browser Types Tab */}
        <TabsContent value="browser-types" className="space-y-6">
          {journeyLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <>
              <AIBrowserTypeBreakdown 
                breakdown={journeyData?.browserTypeBreakdown || []}
                totalSessions={journeyData?.totalSessions || 0}
              />

              {/* Explanation */}
              <Card>
                <CardHeader>
                  <CardTitle>Why does browser type matter?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                      <h4 className="font-medium text-green-700 dark:text-green-400">Visual Browser</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Accepts cookies ~78% of the time. Appears in GA4 but creates odd metrics
                        (desktop traffic spikes, Chrome surges, unusual engagement).
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <h4 className="font-medium text-amber-700 dark:text-amber-400">Headless Browser</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Executes JavaScript but does not render visually. Often used for
                        automation and training crawlers. Detectable via webdriver signals.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <h4 className="font-medium text-blue-700 dark:text-blue-400">Text-based Browser</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Completely invisible to cookie-based analytics. CANNOT be tracked by GA4.
                        Requires server-side or bot log analysis.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Agent Registry Tab */}
        <TabsContent value="registry" className="space-y-6">
          <AgentRegistry siteId={selectedSite.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
