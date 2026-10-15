import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormAnalyticsOverview } from '../FormAnalyticsOverview';
import { FormFunnelVisualization } from '../FormFunnelVisualization';
import { FormTypeSelector } from '../FormTypeSelector';
import { SystemSpecificConfig } from '../SystemSpecificConfig';
import { ConversionGoalsConfig } from '../ConversionGoalsConfig';
import { FormDiscoveryWidget } from '../FormDiscoveryWidget';
import { useFormAnalytics } from '@/hooks/useFormAnalytics';
import type { Site } from '@/types/dashboard';
import type { DateRange } from 'react-day-picker';
import { 
  BarChart3, 
  TrendingDown, 
  Users, 
  FileText,
  Filter,
  Settings
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface FormAnalyticsTabProps {
  selectedSite: Site;
  dateRange?: DateRange;
}

export function FormAnalyticsTab({ selectedSite, dateRange }: FormAnalyticsTabProps) {
  const { data: forms } = useFormAnalytics(selectedSite.id);
  const { toast } = useToast();
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [selectedFormType, setSelectedFormType] = useState<string>('');
  const [systemConfigured, setSystemConfigured] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'setup' | 'config' | 'goals' | 'overview' | 'funnel'>('setup');

  // Auto-select first form and jump straight to overview when data exists
  React.useEffect(() => {
    if (forms && forms.length > 0) {
      if (!selectedFormId) setSelectedFormId(forms[0].form_id);
      setActiveView('overview');
    }
  }, [forms?.length]);

  const selectedForm = forms?.find(form => form.form_id === selectedFormId);

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
      case 'sentrisk':
        return 'SentriSK';
      default:
        return 'Custom form';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Form Analytics</h2>
          <p className="text-muted-foreground">
            Analyze performance for Contact Form 7, Gravity Forms, SentriSK and other forms
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {forms && forms.length > 0 && (
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select form to analyze" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((form) => (
                  <SelectItem key={form.form_id} value={form.form_id}>
                    <div className="flex items-center gap-2">
                      <span>{getFormTypeIcon(form.form_type)}</span>
                      <div>
                        <p className="font-medium">{form.form_name || form.form_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {getFormTypeName(form.form_type)}
                        </p>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
      </div>

      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="setup" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Select System
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2" disabled={!selectedFormType}>
            <Settings className="h-4 w-4" />
            Configure
          </TabsTrigger>
          <TabsTrigger value="goals" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Conversion Goals
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2" disabled={!systemConfigured}>
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="funnel" className="flex items-center gap-2" disabled={!selectedFormId}>
            <TrendingDown className="h-4 w-4" />
            Form Funnel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-6">
          <FormTypeSelector 
            onTypeSelect={(type) => {
              setSelectedFormType(type);
              setActiveView('config');
            }}
            selectedType={selectedFormType}
          />
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          {selectedFormType && (
            <SystemSpecificConfig
              systemType={selectedFormType}
              onConfigSave={(_config) => {
                setSystemConfigured(true);
                setActiveView('overview');
                toast({ title: 'Configuration saved', description: 'Form analytics is now configured.' });
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="goals" className="space-y-6">
          <FormDiscoveryWidget selectedSite={selectedSite} />
          <ConversionGoalsConfig selectedSite={selectedSite} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <FormAnalyticsOverview selectedSite={selectedSite} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="funnel" className="space-y-6">
          {selectedFormId ? (
            <FormFunnelVisualization 
              siteId={selectedSite.id} 
              formId={selectedFormId}
              formName={selectedForm?.form_name}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Select a form</CardTitle>
                <CardDescription>
                  Select a form from the dropdown above to see funnel analysis.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

      </Tabs>

      {/* Quick Stats Footer */}
      {forms && forms.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-4 text-center">
              <div>
                <div className="text-2xl font-bold">{forms.length}</div>
                <p className="text-sm text-muted-foreground">Active forms</p>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {forms.reduce((sum, form) => sum + form.total_starts, 0).toLocaleString('sv-SE')}
                </div>
                <p className="text-sm text-muted-foreground">Total starts</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {forms.reduce((sum, form) => sum + form.total_completions, 0).toLocaleString('sv-SE')}
                </div>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {forms.length > 0
                    ? (forms.reduce((sum, form) => sum + form.conversion_rate, 0) / forms.length).toFixed(1)
                    : 0}%
                </div>
                <p className="text-sm text-muted-foreground">Average conversion</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}