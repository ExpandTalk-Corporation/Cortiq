/**
 * Advanced Content Tracking Dashboard
 * Task #24: Content Tracking Advanced
 *
 * Element interactions, form analytics, heatmaps, and scroll depth
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExportButton } from './ExportButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { Zap, MousePointer, FormInput, TrendingUp, Eye } from 'lucide-react';

interface ContentPerformance {
  element_id: string;
  element_type: string;
  page_url: string;
  date: string;
  views: number;
  clicks: number;
  ctr: number;
  hover_rate: number;
  avg_view_duration: number;
  engagement_score: number;
}

interface FormAnalytics {
  form_name: string;
  field_name: string;
  field_type: string;
  date: string;
  impressions: number;
  interactions: number;
  completed: number;
  abandoned: number;
  validation_errors: number;
  avg_time_to_fill: number;
}

interface HeatmapPoint {
  x_coordinate: number;
  y_coordinate: number;
  intensity: number;
  count: number;
}

interface ContentTrackingAdvancedProps {
  siteId: string;
  dateRange: { from: string; to: string };
}

export function ContentTrackingAdvanced({
  siteId,
  dateRange,
}: ContentTrackingAdvancedProps) {
  const [contentPerformance, setContentPerformance] = useState<ContentPerformance[]>([]);
  const [formAnalytics, setFormAnalytics] = useState<FormAnalytics[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>();
  const [selectedForm, setSelectedForm] = useState<string>();
  const [selectedInteractionType, setSelectedInteractionType] = useState('click');
  const [loading, setLoading] = useState(true);

  const pages = [...new Set(contentPerformance.map((c) => c.page_url))];
  const forms = [...new Set(formAnalytics.map((f) => f.form_name))];

  useEffect(() => {
    loadData();
  }, [siteId, dateRange]);

  useEffect(() => {
    if (selectedPage) {
      loadHeatmapData();
    }
  }, [selectedPage, selectedInteractionType]);

  async function loadData() {
    try {
      setLoading(true);

      // Fetch page views for this site in the selected date range
      const { data: pvData } = await supabase
        .from('page_views')
        .select('id, url, viewed_at')
        .eq('site_id', siteId)
        .gte('viewed_at', dateRange.from)
        .lte('viewed_at', dateRange.to)
        .limit(500);

      const pvIds = (pvData || []).map(p => p.id);
      const pvUrlMap = new Map((pvData || []).map(p => [p.id, p.url as string]));

      if (pvIds.length > 0) {
        const { data: interactions } = await supabase
          .from('user_interactions')
          .select('element_id, element_tag, element_text, interaction_type, page_view_id, created_at')
          .in('page_view_id', pvIds.slice(0, 300));

        // Aggregate by element + page
        const elementMap = new Map<string, ContentPerformance>();
        for (const ia of interactions || []) {
          const pageUrl = pvUrlMap.get(ia.page_view_id) ?? 'Unknown';
          const elemId = ia.element_id || ia.element_tag || 'element';
          const key = `${pageUrl}::${elemId}`;
          if (!elementMap.has(key)) {
            elementMap.set(key, {
              element_id: elemId,
              element_type: ia.element_tag || 'element',
              page_url: pageUrl,
              date: ia.created_at.split('T')[0],
              views: 0, clicks: 0, ctr: 0,
              hover_rate: 0, avg_view_duration: 0, engagement_score: 0,
            });
          }
          const e = elementMap.get(key)!;
          // Tracker types: nav_navigation, button_click, link_click, element_click.
          if (ia.interaction_type === 'click' || ia.interaction_type.endsWith('_click') || ia.interaction_type === 'nav_navigation') e.clicks++;
          else e.views++;
        }
        const perfData = Array.from(elementMap.values()).map(e => ({
          ...e,
          ctr: e.views > 0 ? (e.clicks / e.views) * 100 : 0,
          hover_rate: e.views > 0 ? (e.views / (e.views + e.clicks + 1)) * 100 : 0,
          engagement_score: Math.min(100, e.clicks * 10 + e.views * 2),
        }));
        setContentPerformance(perfData);
        if (perfData.length > 0 && !selectedPage) {
          setSelectedPage(perfData[0].page_url);
        }
      }

      // Form field analytics from real table
      const { data: fieldData } = await supabase
        .from('form_field_analytics')
        .select('*')
        .eq('site_id', siteId);

      if (fieldData && fieldData.length > 0) {
        const formData: FormAnalytics[] = fieldData.map(f => ({
          form_name: f.form_id,
          field_name: f.field_name,
          field_type: f.field_type || 'text',
          date: new Date().toISOString().split('T')[0],
          impressions: f.total_interactions + f.total_skips,
          interactions: f.total_interactions,
          completed: f.total_interactions - f.total_errors,
          abandoned: f.total_skips,
          validation_errors: f.total_errors,
          avg_time_to_fill: f.avg_focus_time,
        }));
        setFormAnalytics(formData);
        if (!selectedForm) setSelectedForm(formData[0].form_name);
      }
    } catch (error) {
      console.error('Error loading content tracking data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadHeatmapData() {
    if (!selectedPage) return;
    try {
      const { data } = await supabase
        .from('heatmap_data')
        .select('x_coordinate, y_coordinate, intensity')
        .eq('site_id', siteId)
        .eq('url', selectedPage)
        .eq('interaction_type', selectedInteractionType)
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to)
        .limit(500);

      setHeatmapData((data || []).map(p => ({
        x_coordinate: p.x_coordinate,
        y_coordinate: p.y_coordinate,
        intensity: p.intensity,
        count: 1,
      })));
    } catch (error) {
      console.error('Error loading heatmap data:', error);
    }
  }

  const selectedPagePerf = selectedPage
    ? contentPerformance.filter((c) => c.page_url === selectedPage)
    : [];

  const selectedFormData = selectedForm
    ? formAnalytics.filter((f) => f.form_name === selectedForm)
    : [];

  const avgEngagementScore = selectedPagePerf.length > 0
    ? Math.round(selectedPagePerf.reduce((sum, c) => sum + c.engagement_score, 0) / selectedPagePerf.length)
    : 0;

  const avgCTR = selectedPagePerf.length > 0
    ? (selectedPagePerf.reduce((sum, c) => sum + c.ctr, 0) / selectedPagePerf.length).toFixed(2)
    : '0';

  const formCompletionRate = selectedFormData.length > 0
    ? selectedFormData.reduce((sum, f) => sum + (f.impressions > 0 ? (f.completed / f.impressions) * 100 : 0), 0) / selectedFormData.length
    : 0;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content Elements</TabsTrigger>
          <TabsTrigger value="forms">Form Analytics</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
        </TabsList>

        {/* Content Elements Tab */}
        <TabsContent value="content" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Avg. Engagement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{avgEngagementScore}/100</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MousePointer className="h-4 w-4" />
                  Avg. CTR
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{avgCTR}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Total Elements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {new Set(contentPerformance.map((c) => c.element_id)).size}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Element Performance</CardTitle>
                  <CardDescription>
                    Select a page to see element interaction metrics
                  </CardDescription>
                </div>
                <Select value={selectedPage} onValueChange={setSelectedPage}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pages.map((page) => (
                      <SelectItem key={page} value={page}>
                        {page}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading...
                </div>
              ) : selectedPagePerf.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No data available
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={selectedPagePerf.slice(-30)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="element_id" angle={-45} textAnchor="end" height={100} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="clicks" fill="#8884d8" name="Clicks" />
                      <Bar yAxisId="right" dataKey="ctr" fill="#82ca9d" name="CTR %" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Element</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                          <TableHead className="text-right">Clicks</TableHead>
                          <TableHead className="text-right">CTR</TableHead>
                          <TableHead className="text-right">Hover Rate</TableHead>
                          <TableHead className="text-right">Engagement</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPagePerf.map((perf) => (
                          <TableRow key={perf.element_id}>
                            <TableCell className="font-medium">{perf.element_id}</TableCell>
                            <TableCell className="text-right">{perf.views}</TableCell>
                            <TableCell className="text-right">{perf.clicks}</TableCell>
                            <TableCell className="text-right">{perf.ctr.toFixed(2)}%</TableCell>
                            <TableCell className="text-right">{perf.hover_rate.toFixed(1)}%</TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant={
                                  perf.engagement_score >= 70
                                    ? 'default'
                                    : perf.engagement_score >= 50
                                      ? 'secondary'
                                      : 'outline'
                                }
                              >
                                {perf.engagement_score}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forms Tab */}
        <TabsContent value="forms" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FormInput className="h-4 w-4" />
                  Completion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formCompletionRate.toFixed(1)}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Forms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{forms.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Form Field Analytics</CardTitle>
                <Select value={selectedForm} onValueChange={setSelectedForm}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {forms.map((form) => (
                      <SelectItem key={form} value={form}>
                        {form}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading...
                </div>
              ) : selectedFormData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No form data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Abandoned</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Avg. Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedFormData.map((field) => (
                      <TableRow key={field.field_name}>
                        <TableCell className="font-medium">{field.field_name}</TableCell>
                        <TableCell className="text-right">{field.impressions}</TableCell>
                        <TableCell className="text-right text-green-600">{field.completed}</TableCell>
                        <TableCell className="text-right text-orange-600">{field.abandoned}</TableCell>
                        <TableCell className="text-right text-red-600">{field.validation_errors}</TableCell>
                        <TableCell className="text-right">{field.avg_time_to_fill}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Heatmap Tab */}
        <TabsContent value="heatmap" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Interaction Heatmap</CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedPage} onValueChange={setSelectedPage}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select page" />
                    </SelectTrigger>
                    <SelectContent>
                      {pages.map((page) => (
                        <SelectItem key={page} value={page}>
                          {page}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedInteractionType} onValueChange={setSelectedInteractionType}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="click">Clicks</SelectItem>
                      <SelectItem value="hover">Hover</SelectItem>
                      <SelectItem value="scroll">Scroll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {heatmapData.length === 0 ? (
                <div className="flex items-center justify-center h-96 bg-gray-50 rounded border border-dashed">
                  <div className="text-center text-muted-foreground">
                    <MousePointer className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No heatmap data for this page</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-6 rounded border overflow-auto">
                  <svg
                    className="border border-gray-300 rounded"
                    viewBox="0 0 1920 1080"
                    width="100%"
                    height="auto"
                  >
                    {/* Background */}
                    <rect width="1920" height="1080" fill="white" />

                    {/* Heatmap points */}
                    {heatmapData.map((point, idx) => (
                      <circle
                        key={idx}
                        cx={point.x_coordinate}
                        cy={point.y_coordinate}
                        r={Math.max(5, (point.intensity / 100) * 20)}
                        fill={`hsl(${360 - (point.intensity * 3.6)}, 100%, 50%)`}
                        opacity={point.intensity / 100}
                      />
                    ))}
                  </svg>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
