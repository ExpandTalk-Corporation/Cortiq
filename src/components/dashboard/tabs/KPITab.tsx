import React, { useState } from 'react';
import '@/styles/print.css';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useKPIDashboard } from '@/hooks/useKPIDashboard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface KPITabProps {
  selectedSite: Site;
}

export function KPITab({ selectedSite }: KPITabProps) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Debug logging for site selection
  console.log('🎯 KPI Tab rendered with site:', {
    siteId: selectedSite.id,
    siteName: selectedSite.site_name,
    domain: selectedSite.domain,
    timestamp: new Date().toISOString()
  });
  
  const {
    data,
    loading,
    error,
    hasData,
    usingFallback,
    refetch,
    monthlyOverview,
    channelBreakdown,
    aiTrafficInsights
  } = useKPIDashboard(selectedSite.id, selectedYear);

  const { toast } = useToast();
  const [checkingGA, setCheckingGA] = useState(false);

  const handleGA4Check = async () => {
    try {
      setCheckingGA(true);
      const { data, error } = await supabase.functions.invoke('ga4-monthly-kpi', {
        body: { siteId: selectedSite.id, year: selectedYear },
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
          startDate: `${selectedYear}-01-01`,
          endDate: `${selectedYear}-12-31`,
          comparisonStartDate: `${selectedYear - 1}-01-01`,
          comparisonEndDate: `${selectedYear - 1}-12-31`,
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
  const getTrendIcon = (growth?: number): React.ReactNode => {
    if (growth === undefined) return null;
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
            <h1 className="text-2xl font-bold">KPI Dashboard - {selectedYear}</h1>
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
                Active Users (year {selectedYear})
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
                Sessions (year {selectedYear})
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
                Page Views (year {selectedYear})
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

  // Calculate yearly totals
  const yearlyTotals = monthlyOverview.reduce((acc, month) => ({
    users: acc.users + month.uniqueUsers,
    sessions: acc.sessions + month.sessions,
    revenue: acc.revenue + month.revenue,
    avgDuration: acc.avgDuration + month.avgDuration,
    avgConversionRate: acc.avgConversionRate + month.conversionRate
  }), { users: 0, sessions: 0, revenue: 0, avgDuration: 0, avgConversionRate: 0 });

  const avgDuration = monthlyOverview.length > 0 ? yearlyTotals.avgDuration / monthlyOverview.length : 0;
  const avgConversionRate = monthlyOverview.length > 0 ? yearlyTotals.avgConversionRate / monthlyOverview.length : 0;

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              KPI Executive Dashboard
            </h1>
            <div className="flex items-center gap-4">
              <p className="text-lg text-muted-foreground">{selectedSite.site_name}</p>
              <Badge variant="secondary" className="text-sm">
                Report for {selectedYear}
              </Badge>
              {usingFallback && (
                <Badge variant="outline" className="text-sm border-amber-300 text-amber-700">
                  Source: CortIQ first-party data (GA4 not configured — conversions/revenue unavailable)
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Report period</p>
              <p className="font-semibold">Full year {selectedYear}</p>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger className="w-36 h-11">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                  <SelectItem value="2022">2022</SelectItem>
                  <SelectItem value="2021">2021</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGA4Check} variant="outline" className="h-11" disabled={checkingGA}>
                {checkingGA ? 'Testing...' : 'Test GA4 access'}
              </Button>
              <Button onClick={runDebugTest} variant="destructive" className="h-11" disabled={checkingGA}>
                Debug GA4 errors
              </Button>
              <Button onClick={runKPIDebug} variant="secondary" className="h-11" disabled={checkingGA}>
                Debug KPI sections
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center text-blue-700">
              <Users className="h-5 w-5 mr-2" />
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{formatNumber(yearlyTotals.users)}</div>
            <p className="text-sm text-blue-600/70 mt-1">Total for {selectedYear}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/50 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center text-green-700">
              <MousePointer className="h-5 w-5 mr-2" />
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-900">{formatNumber(yearlyTotals.sessions)}</div>
            <p className="text-sm text-green-600/70 mt-1">Total for {selectedYear}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center text-purple-700">
              <Clock className="h-5 w-5 mr-2" />
              Average Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-900">{formatDuration(avgDuration)}</div>
            <p className="text-sm text-purple-600/70 mt-1">Per session {selectedYear}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50/50 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center text-orange-700">
              <Target className="h-5 w-5 mr-2" />
              Conversion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900">{(avgConversionRate || 0).toFixed(1)}%</div>
            <p className="text-sm text-orange-600/70 mt-1">Average {selectedYear}</p>
          </CardContent>
        </Card>
      </div>

      {/* Executive KPI Table */}
      <Card className="shadow-lg border-0 bg-gradient-to-br from-background to-muted/10">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-foreground">
                Detailed Monthly Analysis {selectedYear}
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Complete KPI overview for board reports and stakeholder presentations
              </CardDescription>
            </div>
            <Button 
              onClick={handlePrintReport}
              variant="outline" 
              className="bg-white/50 hover:bg-white/70 flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">{/* Increased from text-xs */}
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="text-left p-3 sticky left-0 bg-slate-900 font-bold border-r border-slate-700">KPI</th>
                  {monthlyData.map((month) => (
                    <th key={month.month} className="text-center p-3 font-bold min-w-24 border-r border-slate-700">
                      {month.monthName.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Traffic Metrics */}
                <tr className="border-b hover:bg-muted/30 bg-blue-50/30">
                  <td className="p-2 font-medium sticky left-0 bg-blue-50/30 border-r">New Users</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.newUsers || 0)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Active Users</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.uniqueUsers)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Sessions</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.sessions)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Pages/Session</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{(month.pageViewsPerSession || 0).toFixed(1)}</td>
                  ))}
                </tr>
                
                {/* Engagement Metrics */}
                <tr className="border-b hover:bg-muted/30 bg-green-50/30">
                  <td className="p-2 font-medium sticky left-0 bg-green-50/30 border-r">Avg. Time</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatDuration(month.avgDuration)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Bounce rate</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{(month.bounceRate || 0).toFixed(1)}%</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Page views</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.pageViews || 0)}</td>
                  ))}
                </tr>
                
                {/* Conversion Metrics */}
                <tr className="border-b hover:bg-muted/30 bg-purple-50/30">
                  <td className="p-2 font-medium sticky left-0 bg-purple-50/30 border-r">Conversions</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.conversions || 0)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Conv. Rate</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{(month.conversionRate || 0).toFixed(1)}%</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Transactions</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.transactions || 0)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Total Revenue</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.revenue)} kr</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Purchase Revenue</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.purchaseRevenue || 0)} kr</td>
                  ))}
                </tr>
                
                {/* Event Metrics */}
                <tr className="border-b hover:bg-muted/30 bg-orange-50/30">
                  <td className="p-2 font-medium sticky left-0 bg-orange-50/30 border-r">Total Events</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{formatNumber(month.eventCount || 0)}</td>
                  ))}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="p-2 font-medium sticky left-0 bg-background border-r">Events/User</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">{(month.eventCountPerUser || 0).toFixed(1)}</td>
                  ))}
                </tr>
                
                {/* Growth Metrics */}
                <tr className="border-b hover:bg-muted/30 bg-yellow-50/30">
                  <td className="p-2 font-medium sticky left-0 bg-yellow-50/30 border-r">Growth %</td>
                  {monthlyData.map((month) => (
                    <td key={month.month} className="text-center p-2">
                      <div className="flex items-center justify-center gap-1">
                        {month.growth.users !== undefined && (
                          <>
                            {getTrendIcon(month.growth.users)}
                            <span className={month.growth.users >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {month.growth.users > 0 ? '+' : ''}{(month.growth.users || 0).toFixed(1)}%
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Users {selectedYear}</CardTitle>
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
            <CardTitle>Monthly Sessions {selectedYear}</CardTitle>
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
              Traffic sources & Performance {selectedYear}
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
              Social Media Traffic {selectedYear}
            </CardTitle>
            <CardDescription>Performance from social platforms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.social_media.data.slice(0, 10).map((social: any, index: number) => (
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
              AI Traffic {selectedYear}
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
              Events & Newsletter {selectedYear}
            </CardTitle>
            <CardDescription>Event performance and newsletter engagement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.nyhetsbrev_events.data.slice(0, 10).map((event: any, index: number) => (
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