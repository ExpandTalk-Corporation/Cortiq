import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useFormAnalytics, useFormPerformanceMetrics, useFormSessionMetrics } from '@/hooks/useFormAnalytics';
import type { Site } from '@/types/dashboard';
import type { DateRange } from 'react-day-picker';
import { 
  FileText, 
  Users, 
  Target, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Timer,
  BarChart3,
  Filter
} from 'lucide-react';

interface FormAnalyticsOverviewProps {
  selectedSite: Site;
  dateRange?: DateRange;
}

export function FormAnalyticsOverview({ selectedSite, dateRange }: FormAnalyticsOverviewProps) {
  const { data: forms, isLoading: formsLoading } = useFormAnalytics(selectedSite.id);
  const allTimeMetrics = useFormPerformanceMetrics(selectedSite.id);
  const rangeMetrics = useFormSessionMetrics(
    selectedSite.id,
    dateRange?.from?.toISOString(),
    dateRange?.to?.toISOString(),
  );

  const usingRange = !!(dateRange?.from && dateRange?.to);
  const metrics = usingRange
    ? (rangeMetrics.data ? { ...allTimeMetrics.data, ...rangeMetrics.data, formsCount: allTimeMetrics.data?.formsCount } : null)
    : allTimeMetrics.data;
  const metricsLoading = usingRange ? rangeMetrics.isLoading : allTimeMetrics.isLoading;

  if (formsLoading || metricsLoading) {
    return <div className="animate-pulse">Loading form analytics...</div>;
  }

  if (!forms || forms.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Form Analytics
          </CardTitle>
          <CardDescription>
            No forms detected. Make sure forms exist on the website and that the tracking script is installed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-orange-500" />
            <h3 className="text-lg font-semibold mb-2">No forms detected</h3>
            <p className="text-muted-foreground mb-4">
              For Contact Form 7: Make sure shortcodes like [contact-form-7 id="15a2a0e" title="Contact form 1"] exist on the page.
            </p>
            <p className="text-muted-foreground mb-4">
              For SentriSK: embed the form with the SentriSK WordPress plugin ([sentrisk_form id="..."]), the
              SentriSK block or sentrisk-embed.js. Submissions are counted as conversions once the CortIQ
              tracking script (5.5.4 or later) runs on the same page.
            </p>
            <Button
              variant="outline"
              onClick={() => window.open('/installation', '_blank')}
            >
              View installation guide
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getFormTypeIcon = (type: string) => {
    switch (type) {
      case 'contact_form_7':
        return '📝';
      case 'gravity_forms':
        return '⚡';
      case 'woocommerce_checkout':
        return '🛒';
      default:
        return '📋';
    }
  };

  const getFormTypeName = (type: string) => {
    switch (type) {
      case 'contact_form_7':
        return 'Contact Form 7';
      case 'gravity_forms':
        return 'Gravity Forms';
      case 'woocommerce_checkout':
        return 'WooCommerce Checkout';
      default:
        return 'Custom form';
    }
  };

  const getPerformanceColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const periodLabel = usingRange && dateRange?.from && dateRange?.to
    ? `${dateRange.from.toLocaleDateString('sv-SE')} – ${dateRange.to.toLocaleDateString('sv-SE')}`
    : 'All time';

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Period: {periodLabel}</p>
      {/* Performance Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total starts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalStarts.toLocaleString('sv-SE')}</div>
            <p className="text-xs text-muted-foreground">
              from {metrics?.formsCount} forms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average conversion</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getPerformanceColor(metrics?.avgConversionRate || 0)}`}>
              {metrics?.avgConversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics?.totalCompletions} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTime(metrics?.avgCompletionTime || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              to completion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abandonments</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {metrics?.totalAbandons.toLocaleString('sv-SE')}
            </div>
            <p className="text-xs text-muted-foreground">
              users abandoned
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Best/Worst Performers */}
      {metrics?.bestForm && metrics?.worstForm && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Best form
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{metrics.bestForm.form_name || metrics.bestForm.form_id}</p>
                  <p className="text-sm text-muted-foreground">
                    {getFormTypeName(metrics.bestForm.form_type)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">
                    {metrics.bestForm.conversion_rate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">conversion</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Needs improvement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{metrics.worstForm.form_name || metrics.worstForm.form_id}</p>
                  <p className="text-sm text-muted-foreground">
                    {getFormTypeName(metrics.worstForm.form_type)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600">
                    {metrics.worstForm.conversion_rate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">conversion</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Individual Form Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Form performance
          </CardTitle>
          <CardDescription>
            Detailed analysis of every form on your website
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {forms.map((form) => (
              <div key={form.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getFormTypeIcon(form.form_type)}</span>
                    <div>
                      <h4 className="font-medium">{form.form_name || form.form_id}</h4>
                      <p className="text-sm text-muted-foreground">
                        {getFormTypeName(form.form_type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={form.conversion_rate >= 70 ? 'default' : form.conversion_rate >= 40 ? 'secondary' : 'destructive'}>
                      {form.conversion_rate.toFixed(1)}% conversion
                    </Badge>
                    <Button variant="outline" size="sm">
                      Detail view
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Starts</p>
                    <p className="text-lg font-semibold">{form.total_starts.toLocaleString('sv-SE')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-lg font-semibold text-green-600">{form.total_completions.toLocaleString('sv-SE')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Abandonments</p>
                    <p className="text-lg font-semibold text-red-600">{form.total_abandons.toLocaleString('sv-SE')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Average time</p>
                    <p className="text-lg font-semibold">{formatTime(form.avg_completion_time)}</p>
                  </div>
                </div>

                <Separator className="my-3" />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Conversion</span>
                    <span className={getPerformanceColor(form.conversion_rate)}>
                      {form.conversion_rate.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={form.conversion_rate} className="h-2" />
                </div>

                {form.conversion_rate < 50 && (
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <p className="text-sm text-yellow-800">
                      Low conversion — consider analyzing field-specific data for improvement opportunities
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}