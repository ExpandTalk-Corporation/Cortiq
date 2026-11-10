import React, { useState } from 'react';
import '@/styles/print.css';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { percentChange } from '@/lib/dashboard/filters';
import {
  Users, 
  MousePointer, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  Calendar,
  Target,
  Globe,
  Bot,
  Mail,
  CreditCard,
  Share2,
  Printer
} from 'lucide-react';
import type { Site } from '@/types/dashboard';
import { useKPIDashboard, type MonthlyKPI } from '@/hooks/useKPIDashboard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface KPITabProps {
  selectedSite: Site;
  onNavigateToIntegrations?: () => void;
  onNavigate?: (tab: string) => void;
}

type KpiRow = {
  label: string;
  value: (m: MonthlyKPI) => number;
  format: (n: number) => string;
  /** How to start measuring it; shown when the row is zero in every month. */
  setup?: { text: string; tab?: string; action?: string };
};

type KpiGroup = { title: string; rows: KpiRow[] };

export function KPITab({ selectedSite, onNavigate }: KPITabProps) {
  // The report follows the global date range and compares with the same period last year.
  const { filters } = useDashboardFilters();
  const periodLabel = `${filters.from} – ${filters.to}`;

  const {
    data,
    loading,
    error,
    hasData,
    usingFallback,
    refetch,
    comparisonRange,
    foldedMonths,
    totals,
    monthlyOverview,
    channelBreakdown,
    aiTrafficInsights
  } = useKPIDashboard(selectedSite.id, { from: filters.from, to: filters.to });

  const { toast } = useToast();
  const [checkingGA, setCheckingGA] = useState(false);

  const handleGA4Check = async () => {
    try {
      setCheckingGA(true);
      const { data, error } = await supabase.functions.invoke('ga4-monthly-kpi', {
        body: {
          siteId: selectedSite.id,
          startDate: filters.from,
          endDate: filters.to,
          comparisonStartDate: comparisonRange.from,
          comparisonEndDate: comparisonRange.to,
        },
      });
      if (error || !data?.success) {
        console.error('GA4 permission check failed:', error || data);
        toast({
          title: 'GA4 access failed',
          description: (error?.message || data?.error || 'Unknown error'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'GA4 access OK',
          description: `Successfully fetched data (${data.totals?.sessions || 0} sessions).`,
        });
      }
    } finally {
      setCheckingGA(false);
    }
  };

  const runDebugTest = async () => {
    if (!selectedSite.id) {
      toast({
        title: 'No site selected',
        description: 'Select a site first',
        variant: 'destructive',
      });
      return;
    }

    setCheckingGA(true);
    try {
      const { data, error } = await supabase.functions.invoke('ga4-search-terms-debug', {
        body: { siteId: selectedSite.id }
      });

      if (error) {
        toast({
          title: 'Debug function failed',
          description: error.message,
          variant: 'destructive',
        });
        console.error('Debug error:', error);
      } else if (data?.ok === false) {
        // Debug function returned structured error
        const { error: debugError, debugId } = data;
        toast({
          title: `Error in step: ${debugError.step}`,
          description: `${debugError.message} (Debug ID: ${debugId})`,
          variant: 'destructive',
        });
        console.error(`🔍 Debug ID ${debugId}:`, data);

        // Show helpful tips in console
        if (debugError.tips?.length > 0) {
          console.log('🛠️ Debug tips:', debugError.tips);
        }
      } else {
        toast({
          title: 'Debug succeeded!',
          description: `GA4 connection is working (Debug ID: ${data.debugId})`,
        });
        console.log('✅ Debug success:', data);
      }
    } catch (err) {
      toast({
        title: 'Debug test failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      console.error('Debug exception:', err);
    } finally {
      setCheckingGA(false);
    }
  };

  const runKPIDebug = async () => {
    if (!selectedSite.id) {
      toast({
        title: 'No site selected',
        description: 'Select a site first',
        variant: 'destructive',
      });
      return;
    }

    setCheckingGA(true);
    try {
      const { data, error } = await supabase.functions.invoke('ga4-kpi-dashboard-debug', {
        body: { 
          siteId: selectedSite.id,
          startDate: filters.from,
          endDate: filters.to,
          comparisonStartDate: comparisonRange.from,
          comparisonEndDate: comparisonRange.to,
          sections: ["overall", "channels", "ai"], // Testa bara några sektioner först
          sectionTimeoutMs: 4000
        }
      });

      if (error) {
        toast({
          title: 'KPI Debug failed',
          description: error.message,
          variant: 'destructive',
        });
        console.error('KPI Debug error:', error);
      } else if (data?.ok === false) {
        // Strukturerat fel från debug-funktionen
        const { error: debugError, debugId } = data;
        toast({
          title: `KPI error in step: ${debugError.step}`,
          description: `${debugError.message} (Debug ID: ${debugId})`,
          variant: 'destructive',
        });
        console.error(`🔍 KPI Debug ID ${debugId}:`, data);
      } else {
        // Succeeded — show results
        const successSections = Object.keys(data.results || {});
        const failedSections = Object.keys(data.errors || {});
        
        if (failedSections.length === 0) {
          toast({
            title: 'KPI Debug succeeded!',
            description: `All sections working: ${successSections.join(', ')}`,
          });
        } else {
          toast({
            title: 'KPI partially succeeded',
            description: `Working: ${successSections.join(', ')}. Failing: ${failedSections.join(', ')}`,
            variant: 'destructive',
          });
        }
        
        console.log('✅ KPI Debug results:', {
          successful: data.results,
          failed: data.errors,
          debugId: data.debugId
        });
        
        // Show details for failed sections
        if (failedSections.length > 0) {
          failedSections.forEach(section => {
            const err = data.errors[section];
            console.error(`❌ Section ${section} failed:`, err);
          });
        }
      }
    } catch (err) {
      toast({
        title: 'KPI Debug exception',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      console.error('KPI Debug exception:', err);
    } finally {
      setCheckingGA(false);
    }
  };

  // PDF Export function
  const handlePrintReport = () => {
    window.print();
  };
  // Helper function to get trend icon
  const getTrendIcon = (growth?: number | null): React.ReactNode => {
    if (growth == null) return null;
    return growth >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  // Helper function to format numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  // Helper function to format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Monthly data - use the complete data structure from hook
  const monthlyData = monthlyOverview;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">KPI Dashboard - {periodLabel}</h1>
            <p className="text-muted-foreground">Fetching data from Google Analytics...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && (!monthlyData || monthlyData.length === 0)) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="text-center py-8">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-4">Could not fetch KPI data</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => refetch()} variant="outline">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasData) {
    // Neither GA4 nor the first-party fallback produced anything — show N/A + debug button.
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">KPI</h1>
              <p className="text-muted-foreground">No GA4 data available right now. Run the test below.</p>
            </div>
            <Button onClick={handleGA4Check} variant="outline" className="h-11" disabled={checkingGA}>
              {checkingGA ? 'Testing...' : 'Test GA4 access'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center text-blue-700">
                <Users className="h-5 w-5 mr-2" />
                Active Users ({periodLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900">N/A</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/50 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center text-green-700">
                <MousePointer className="h-5 w-5 mr-2" />
                Sessions ({periodLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900">N/A</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center text-purple-700">
                <BarChart3 className="h-5 w-5 mr-2" />
                Page Views ({periodLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900">N/A</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Period totals; averages are weighted by sessions.
  const periodSessions = monthlyOverview.reduce((s, m) => s + m.sessions, 0);
  const avgDuration = periodSessions > 0
    ? monthlyOverview.reduce((s, m) => s + m.avgDuration * m.sessions, 0) / periodSessions : 0;
  const avgConversionRate = periodSessions > 0
    ? monthlyOverview.reduce((s, m) => s + m.conversions, 0) / periodSessions * 100 : 0;

  const periodPageViews = monthlyOverview.reduce((s, m) => s + m.pageViews, 0);
  const hasConversions = monthlyOverview.some((m) => m.conversions > 0);

  const num = (n: number) => formatNumber(Math.round(n));
  const kr = (n: number) => `${formatNumber(Math.round(n))} kr`;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const dec = (n: number) => n.toFixed(1);
  const connectGa4 = { text: 'Comes from GA4. Connect a GA4 property under Integrations to include it.', tab: 'integrations', action: 'Connect GA4' };
  const goals = {
    text: usingFallback
      ? 'Connect GA4 with key events, or set up conversion goals in CortIQ (form submissions, phone and email clicks, thank-you pages).'
      : 'GA4 reports no key events. Mark the events that matter (e.g. generate_lead, form_submit) as key events in GA4, or set up conversion goals in CortIQ.',
    tab: 'conversion-goals', action: 'Set up goals',
  };
  const ecommerce = usingFallback
    ? { text: 'Comes from GA4 e-commerce tracking (the purchase event with value and transaction_id). Connect GA4 and enable it in the shop or tag manager.', tab: 'integrations', action: 'Connect GA4' }
    : { text: 'GA4 receives no purchase events. Enable e-commerce tracking in the shop or tag manager so purchase is sent with value and transaction_id.', tab: 'ecommerce', action: 'Open e-commerce' };

  // Bounce rate is left out: GA4 replaced it with engagement rate and the column was always 0 here.
  const groups: KpiGroup[] = [
    { title: 'Traffic', rows: [
      { label: 'Active users', value: (m) => m.uniqueUsers, format: num },
      { label: 'New users', value: (m) => m.newUsers, format: num,
        setup: usingFallback ? { ...connectGa4, text: 'New vs returning users comes from GA4; CortIQ keeps no persistent visitor ID. Connect GA4 to include it.' } : undefined },
      { label: 'Sessions', value: (m) => m.sessions, format: num },
    ] },
    { title: 'Engagement', rows: [
      { label: 'Page views', value: (m) => m.pageViews, format: num },
      { label: 'Pages per session', value: (m) => m.pageViewsPerSession, format: dec },
      { label: 'Average time', value: (m) => m.avgDuration, format: formatDuration },
      { label: 'Events', value: (m) => m.eventCount, format: num, setup: connectGa4 },
      { label: 'Events per user', value: (m) => m.eventCountPerUser, format: dec, setup: connectGa4 },
    ] },
    { title: 'Conversions', rows: [
      { label: 'Conversions', value: (m) => m.conversions, format: num, setup: goals },
      { label: 'Conversion rate', value: (m) => m.conversionRate, format: pct, setup: goals },
    ] },
    { title: 'Revenue', rows: [
      { label: 'Transactions', value: (m) => m.transactions, format: num, setup: ecommerce },
      { label: 'Total revenue', value: (m) => m.revenue, format: kr, setup: ecommerce },
      { label: 'Purchase revenue', value: (m) => m.purchaseRevenue, format: kr, setup: ecommerce },
    ] },
  ];
  const isEmpty = (r: KpiRow) => monthlyOverview.every((m) => !r.value(m));
  const visibleGroups = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !isEmpty(r)) }))
    .filter((g) => g.rows.length > 0);
  // One line per setup step, listing every KPI it unlocks.
  const missingSetups = Object.values(
    groups.flatMap((g) => g.rows).filter(isEmpty).reduce<Record<string, { labels: string[]; text: string; tab?: string; action?: string }>>((acc, r) => {
      const setup = r.setup ?? { text: 'No data in this period.' };
      (acc[setup.text] ??= { ...setup, labels: [] }).labels.push(r.label);
      return acc;
    }, {}),
  );

  // Change against the same period one year earlier.
  const yoyLabel = (current: number, previous: number) => {
    const pct = percentChange(current, previous);
    return pct === null ? 'No data same period last year' : `${pct > 0 ? '+' : ''}${pct}% vs same period last year`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">KPI report</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSite.site_name} · {periodLabel} · compared with {comparisonRange.from} – {comparisonRange.to}
          </p>
          {usingFallback && (
            <p className="text-xs text-muted-foreground">
              Source: CortIQ tracking. GA4 is not connected, so new users, events and revenue are not available.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button onClick={handlePrintReport} variant="outline" size="sm" className="gap-2">
            <Printer className="h-4 w-4" /> Export PDF
          </Button>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              GA4 diagnostics
            </summary>
            <div className="absolute right-0 z-20 mt-1 flex w-48 flex-col gap-1 rounded-md border bg-popover p-1 shadow-md">
              <Button onClick={handleGA4Check} variant="ghost" size="sm" className="justify-start" disabled={checkingGA}>
                {checkingGA ? 'Testing...' : 'Test GA4 access'}
              </Button>
              <Button onClick={runDebugTest} variant="ghost" size="sm" className="justify-start" disabled={checkingGA}>
                Debug GA4 errors
              </Button>
              <Button onClick={runKPIDebug} variant="ghost" size="sm" className="justify-start" disabled={checkingGA}>
                Debug KPI sections
              </Button>
            </div>
          </details>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { icon: <Users className="h-4 w-4" />, label: 'Active users', value: formatNumber(totals.current.users), note: yoyLabel(totals.current.users, totals.previous.users) },
          { icon: <MousePointer className="h-4 w-4" />, label: 'Sessions', value: formatNumber(totals.current.sessions), note: yoyLabel(totals.current.sessions, totals.previous.sessions) },
          { icon: <Clock className="h-4 w-4" />, label: 'Average time', value: formatDuration(avgDuration), note: 'Per session' },
          hasConversions
            ? { icon: <Target className="h-4 w-4" />, label: 'Conversion rate', value: `${avgConversionRate.toFixed(1)}%`, note: 'Conversions per session' }
            : { icon: <BarChart3 className="h-4 w-4" />, label: 'Pages per session', value: (periodSessions > 0 ? periodPageViews / periodSessions : 0).toFixed(1), note: 'No conversions measured yet' },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{c.icon}{c.label}</span>
              <span className="text-2xl font-semibold tabular-nums">{c.value}</span>
              <span className="text-xs text-muted-foreground">{c.note}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly table: only KPIs with data; the rest are listed with how to start measuring them. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Month by month</CardTitle>
          <CardDescription>
            Growth compares each month with the same month one year earlier.
            {foldedMonths && ' The range touches the same calendar month in two years; that column combines both.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                  <th className="sticky left-0 bg-muted px-4 py-2 text-left font-medium">KPI</th>
                  {monthlyData.map((month) => (
                    <th key={month.month} className="min-w-20 px-4 py-2 text-right font-medium">{month.monthName.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => (
                  <React.Fragment key={group.title}>
                    <tr>
                      <td colSpan={monthlyData.length + 1} className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 bg-card px-4 py-2">{row.label}</td>
                        {monthlyData.map((month) => (
                          <td key={month.month} className="px-4 py-2 text-right tabular-nums">{row.format(row.value(month))}</td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr>
                  <td className="sticky left-0 bg-card px-4 py-2">Users vs last year</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="px-4 py-2 text-right tabular-nums">
                      {month.growth.users == null ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 ${month.growth.users >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {getTrendIcon(month.growth.users)}
                          {month.growth.users > 0 ? '+' : ''}{month.growth.users.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {missingSetups.length > 0 && (
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Not measured yet</CardTitle>
            <CardDescription>These KPIs are zero for the whole period. This is what the site needs to report them.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {missingSetups.map((m) => (
                <li key={m.text} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{m.labels.join(', ')}</p>
                    <p className="text-muted-foreground">{m.text}</p>
                  </div>
                  {m.tab && onNavigate && (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => onNavigate(m.tab!)}>{m.action}</Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Monthly Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Users {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthName" tickFormatter={(value) => value.slice(0, 3)} />
                <YAxis />
                <Tooltip formatter={(value) => [formatNumber(Number(value)), 'Users']} />
                <Bar dataKey="uniqueUsers" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Sessions {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthName" tickFormatter={(value) => value.slice(0, 3)} />
                <YAxis />
                <Tooltip formatter={(value) => [formatNumber(Number(value)), 'Sessions']} />
                <Line type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Sources Analysis */}
      {channelBreakdown.length > 0 && (
        <Card className="shadow-md bg-gradient-to-br from-background to-blue-50/30">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50/50 to-transparent">
            <CardTitle className="text-lg font-bold flex items-center text-blue-900">
              <Globe className="h-5 w-5 mr-3" />
              Traffic sources & Performance {periodLabel}
            </CardTitle>
            <CardDescription className="text-blue-700/70">
              Analysis of the most valuable traffic channels
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4">{/* Changed from space-y-4 to grid gap-4 */}
              {channelBreakdown.slice(0, 10).map((channel: any, index: number) => (
                <div key={channel.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-semibold">{index + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium">{channel.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(channel.users)} users
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatNumber(channel.sessions)}</p>
                    <p className="text-sm text-muted-foreground">{(channel.conversionRate || 0).toFixed(1)}% conv.</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social Media Traffic */}
      {data?.social_media?.data && data.social_media.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Share2 className="h-5 w-5 mr-2" />
              Social Media Traffic {periodLabel}
            </CardTitle>
            <CardDescription>Performance from social platforms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.social_media.data.filter((row: any) => (row.metrics.sessions?.current || 0) > 0).slice(0, 10).map((social: any, index: number) => (
                <div key={social.dimensions.sessionSource} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Share2 className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{social.dimensions.sessionSource}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(social.metrics.activeUsers?.current || 0)} users
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatNumber(social.metrics.sessions?.current || 0)}</p>
                    <p className="text-sm text-muted-foreground">
                      {((social.metrics.conversions?.current || 0) / (social.metrics.sessions?.current || 1) * 100).toFixed(1)}% conv.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Traffic Insights */}
      {aiTrafficInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bot className="h-5 w-5 mr-2" />
              AI Traffic {periodLabel}
            </CardTitle>
            <CardDescription>Traffic from AI platforms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {aiTrafficInsights.map((platform: any, index: number) => (
                <div key={platform.platform} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Bot className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium capitalize">{platform.platform}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(platform.users)} users
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatNumber(platform.sessions)}</p>
                    <p className="text-sm text-muted-foreground">sessions</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Newsletter & Events Performance */}
      {data?.nyhetsbrev_events?.data && data.nyhetsbrev_events.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Events & Newsletter {periodLabel}
            </CardTitle>
            <CardDescription>Event performance and newsletter engagement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.nyhetsbrev_events.data.filter((row: any) => (row.metrics.eventCount?.current || 0) > 0).slice(0, 10).map((event: any, index: number) => (
                <div key={event.dimensions.eventName || index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">{event.dimensions.eventName || 'Custom Event'}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(event.metrics.eventCount?.current || 0)} events
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatNumber(event.metrics.activeUsers?.current || 0)}</p>
                    <p className="text-sm text-muted-foreground">users</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}