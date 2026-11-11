// src/components/dashboard/PageFunnelAnalyzer.tsx
// Funnel for one page: visits → form interaction → submission, plus phone/email clicks.
// Follows the global date range. The URL filter limits which pages can be picked; the segment
// filter does not apply because heatmap clicks are not linked to a visit (see FILTER_NOTES).
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PageSelector } from '@/components/dashboard/PageSelector';
import { 
  Users, 
  MousePointer, 
  Send, 
  TrendingDown, 
  TrendingUp, 
  Eye,
  FormInput,
  Phone,
  ArrowRight,
  Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

interface FunnelData {
  pageVisits: number;
  formStarts: number;
  formSubmissions: number;
  phoneClicks: number;
  emailClicks: number;
  totalClicks: number;
  conversionRate: number;
  dropoffRate: number;
}

interface PageFunnelAnalyzerProps {
  siteId: string;
}

// Pages that usually carry a conversion; listed first.
const IMPORTANT_PAGE_HINTS = [
  '/kontakt', '/contact', '/boka', '/offert', '/lediga-jobb', '/karriar', '/jobs', '/ansok',
  '/tjanster', '/services', '/produkter', '/products', '/priser', '/pricing',
];

export function PageFunnelAnalyzer({ siteId }: PageFunnelAnalyzerProps) {
  const { filters } = useDashboardFilters();
  const p_from = filters.from;
  const p_to = filters.to;
  const p_path = filters.path;
  const [selectedUrl, setSelectedUrl] = useState('');
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [availablePages, setAvailablePages] = useState<{ url: string; detail: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (siteId && p_from && p_to) {
      loadAvailablePages();
    }
  }, [siteId, p_from, p_to, p_path]);

  useEffect(() => {
    if (selectedUrl && siteId && p_from && p_to) {
      loadFunnelData();
    } else {
      setFunnelData(null);
    }
  }, [selectedUrl, siteId, p_from, p_to]);

  const loadAvailablePages = async () => {
    try {
      // Most viewed pages in the date range under the URL filter (get_top_pages).
      const { data, error } = await (supabase as any).rpc('get_top_pages', {
        p_site_id: siteId, p_from, p_to, p_limit: 200, p_path,
      });

      if (error) throw error;

      const sorted: { url: string; views: number }[] = (data?.pages ?? []).map((p: { url: string; views: number }) => ({
        url: p.url, views: Number(p.views ?? 0),
      }));
      const isImportant = (url: string) => IMPORTANT_PAGE_HINTS.some((hint) => url.includes(hint));
      // Important pages first, then the most viewed.
      const finalPages = [...sorted.filter((p) => isImportant(p.url)), ...sorted.filter((p) => !isImportant(p.url))]
        .slice(0, 25);

      setAvailablePages(finalPages.map((p) => ({ url: p.url, detail: `${p.views.toLocaleString('en-US')} views` })));

      // Keep the selection while it is still in the list; otherwise default to the first page.
      setSelectedUrl((current) =>
        current && finalPages.some((p) => p.url === current) ? current : finalPages[0]?.url ?? '');
    } catch (error) {
      console.error('Error loading available pages:', error);
    }
  };

  const loadFunnelData = async () => {
    if (!selectedUrl) return;
    
    setIsLoading(true);
    try {
      // Counted in the database (get_page_funnel) for the global date range.
      const { data, error } = await (supabase as any).rpc('get_page_funnel', {
        p_site_id: siteId, p_url: selectedUrl, p_from, p_to,
      });

      if (error) throw error;

      const pageVisits = Number(data?.page_visits ?? 0);
      const totalClicks = Number(data?.total_clicks ?? 0);
      const formStarts = Number(data?.form_starts ?? 0);
      const formSubmissions = Number(data?.form_submissions ?? 0);
      const phoneClicks = Number(data?.phone_clicks ?? 0);
      const emailClicks = Number(data?.email_clicks ?? 0);

      const conversionRate = pageVisits > 0 ? (formSubmissions / pageVisits) * 100 : 0;
      const dropoffRate = formStarts > 0 ? ((formStarts - formSubmissions) / formStarts) * 100 : 0;

      setFunnelData({
        pageVisits,
        formStarts,
        formSubmissions,
        phoneClicks,
        emailClicks,
        totalClicks,
        conversionRate,
        dropoffRate
      });

    } catch (error) {
      console.error('Error loading funnel data:', error);
      toast({
        title: "Error",
        description: "Could not load funnel data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const FunnelStep = ({ 
    icon: Icon, 
    title, 
    value, 
    total, 
    color = "blue",
    description 
  }: {
    icon: any;
    title: string;
    value: number;
    total: number;
    color?: string;
    description: string;
  }) => {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-${color}-100`}>
            <Icon className={`h-5 w-5 text-${color}-600`} />
          </div>
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-sm text-muted-foreground">{description}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">
            {percentage.toFixed(1)}% of visitors
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-purple-500" />
            Conversion Funnel Analysis
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Analyze the full conversion flow for a specific page · {p_from} – {p_to}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="page-url">Select page to analyze</Label>
            <div className="space-y-2">
              <PageSelector
                siteId={siteId}
                selectedPage={selectedUrl}
                onPageChange={setSelectedUrl}
                pages={availablePages}
                placeholder="Select a page to analyze..."
              />
              <div className="text-xs text-muted-foreground">
                Pages viewed in the selected date range{p_path ? ` under ${p_path}` : ''}. Contact, jobs and service pages are listed first.
              </div>
            </div>
          </div>

          {selectedUrl && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm">
                <strong>Analyzing:</strong> {selectedUrl}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel Data */}
      {funnelData && (
        <>
          {/* Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="text-2xl font-bold">{funnelData.pageVisits}</div>
                    <div className="text-sm text-muted-foreground">Page visits</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <MousePointer className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="text-2xl font-bold">{funnelData.totalClicks}</div>
                    <div className="text-sm text-muted-foreground">Total clicks</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-purple-500" />
                  <div>
                    <div className="text-2xl font-bold">{funnelData.formSubmissions}</div>
                    <div className="text-sm text-muted-foreground">Forms submitted</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  <div>
                    <div className="text-2xl font-bold">{funnelData.conversionRate.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Conversion rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <p className="text-sm text-muted-foreground">
                Flow from page visit to conversion
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <FunnelStep
                icon={Eye}
                title="1. Page visits"
                value={funnelData.pageVisits}
                total={funnelData.pageVisits}
                color="blue"
                description="Number of unique visits to this page"
              />

              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              <FunnelStep
                icon={FormInput}
                title="2. Form interaction"
                value={funnelData.formStarts}
                total={funnelData.pageVisits}
                color="green"
                description="Started filling in form or clicked a field"
              />

              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              <FunnelStep
                icon={Send}
                title="3. Form submitted"
                value={funnelData.formSubmissions}
                total={funnelData.pageVisits}
                color="purple"
                description="Completed and submitted the form"
              />

              {/* Alternative conversions */}
              <div className="border-t pt-4 mt-6">
                <h4 className="font-medium mb-3">Alternative conversions</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <FunnelStep
                    icon={Phone}
                    title="Phone click"
                    value={funnelData.phoneClicks}
                    total={funnelData.pageVisits}
                    color="orange"
                    description="Clicked on phone number"
                  />

                  <FunnelStep
                    icon={Users}
                    title="Email click"
                    value={funnelData.emailClicks}
                    total={funnelData.pageVisits}
                    color="indigo"
                    description="Clicked on email address"
                  />
                </div>
              </div>

              {/* Insights */}
              <div className="border-t pt-4 mt-6">
                <h4 className="font-medium mb-3">Insights</h4>
                <div className="space-y-2">
                  {funnelData.dropoffRate > 50 && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                      <TrendingDown className="h-5 w-5 text-red-500" />
                      <div className="text-sm">
                        <strong>High drop-off rate:</strong> {funnelData.dropoffRate.toFixed(1)}% abandon the form.
                        Consider simplifying the form.
                      </div>
                    </div>
                  )}

                  {funnelData.conversionRate > 5 && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      <div className="text-sm">
                        <strong>Good conversion:</strong> {funnelData.conversionRate.toFixed(1)}% conversion rate is above average.
                      </div>
                    </div>
                  )}

                  {funnelData.phoneClicks > funnelData.formSubmissions && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                      <Phone className="h-5 w-5 text-blue-500" />
                      <div className="text-sm">
                        <strong>Phone preferred:</strong> More users click the phone number than submit the form.
                        Consider making the phone number more prominent.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Analyzing conversion funnel...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}