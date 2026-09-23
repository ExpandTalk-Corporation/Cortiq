import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, CheckCircle, XCircle, AlertTriangle, Activity, BarChart, Settings } from 'lucide-react';
import { useGDPRSettings, useUpdateGDPRSettings } from '@/hooks/useGDPR';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Site } from '@/types/dashboard';
import { ConsentImpact } from '@/components/dashboard/ConsentImpact';

interface CMPDashboardProps {
  selectedSite: Site;
}

export function CMPDashboard({ selectedSite }: CMPDashboardProps) {
  const { data: gdprSettings } = useGDPRSettings(selectedSite.id);
  const updateGDPRSettings = useUpdateGDPRSettings();
  const [serverSideConfig, setServerSideConfig] = useState<any>((selectedSite as any).server_side_tracking_config || {});
  const [trackingMode, setTrackingMode] = useState<string>((selectedSite as any).tracking_mode || 'full');
  const [consentStats, setConsentStats] = useState<any>(null);
  const [recentValidations, setRecentValidations] = useState<any[]>([]);

  React.useEffect(() => {
    loadConsentStats();
    loadRecentValidations();
  }, [selectedSite]);

  const loadConsentStats = async () => {
    try {
      const { data } = await supabase
        .from('cookie_consents')
        .select('consent_types, created_at')
        .eq('site_id', selectedSite.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        const stats = {
          total: data.length,
          analytics_granted: data.filter(c => (c.consent_types as any)?.analytics).length,
          marketing_granted: data.filter(c => (c.consent_types as any)?.marketing).length,
          all_rejected: data.filter(c => !(c.consent_types as any)?.analytics && !(c.consent_types as any)?.marketing).length,
          recent_24h: data.filter(c => new Date(c.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length
        };
        setConsentStats(stats);
      }
    } catch (error) {
      console.error('Error loading consent stats:', error);
    }
  };

  const loadRecentValidations = async () => {
    try {
      const { data } = await supabase
        .from('consent_validations')
        .select('*')
        .eq('site_id', selectedSite.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentValidations(data || []);
    } catch (error) {
      console.error('Error loading recent validations:', error);
    }
  };

  const updateServerSideConfig = async (newConfig: any) => {
    try {
      await supabase
        .from('sites')
        .update({ server_side_tracking_config: newConfig })
        .eq('id', selectedSite.id);
      
      setServerSideConfig(newConfig);
      toast.success('Server-side tracking configuration updated');
    } catch (error) {
      console.error('Error updating server-side config:', error);
      toast.error('Error updating configuration');
    }
  };

  const updateTrackingMode = async (mode: 'cookieless' | 'full') => {
    try {
      await supabase.from('sites').update({ tracking_mode: mode } as any).eq('id', selectedSite.id);
      setTrackingMode(mode);
      toast.success(mode === 'cookieless' ? 'Switched to cookieless mode' : 'Switched to full tracking');
    } catch (error) {
      console.error('Error updating tracking mode:', error);
      toast.error('Could not update tracking mode');
    }
  };

  const testConsentFlow = async () => {
    try {
      const testSessionId = `test_${Date.now()}`;
      
      const result = await supabase.functions.invoke('consent-check', {
        body: {
          site_id: selectedSite.id,
          session_id: testSessionId,
          consent_types: ['analytics', 'marketing'],
          integration_type: 'test'
        }
      });

      if (result.error) {
        toast.error('Test failed: ' + result.error.message);
      } else {
        toast.success('Consent flow is working correctly');
        loadRecentValidations();
      }
    } catch (error) {
      toast.error('Test failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CMP Dashboard</h1>
          <p className="text-muted-foreground">
            GDPR-compliant server-side tracking for {selectedSite.site_name}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="impact">Impact</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CMP Status</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  {serverSideConfig?.block_analytics_without_consent || serverSideConfig?.block_marketing_without_consent ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm font-medium">Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-500" />
                      <span className="text-sm font-medium">Inactive</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Server-side blocking {serverSideConfig?.block_analytics_without_consent ? 'enabled' : 'disabled'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Consents (24h)</CardTitle>
                <BarChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{consentStats?.recent_24h || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {consentStats?.total || 0} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Blocked Calls</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {recentValidations.filter(v => v.blocked_calls?.length > 0).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 20 validations
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Consent Statistics */}
          {consentStats && (
            <Card>
              <CardHeader>
                <CardTitle>Consent statistics</CardTitle>
                <CardDescription>Overview of user consents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {Math.round((consentStats.analytics_granted / consentStats.total) * 100) || 0}%
                    </div>
                    <p className="text-sm text-muted-foreground">Analytics consent</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round((consentStats.marketing_granted / consentStats.total) * 100) || 0}%
                    </div>
                    <p className="text-sm text-muted-foreground">Marketing consent</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {Math.round((consentStats.all_rejected / consentStats.total) * 100) || 0}%
                    </div>
                    <p className="text-sm text-muted-foreground">All rejected</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{consentStats.total}</div>
                    <p className="text-sm text-muted-foreground">Total consents</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="impact" className="space-y-6">
          <ConsentImpact selectedSite={selectedSite} />
        </TabsContent>

        <TabsContent value="configuration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tracking mode</CardTitle>
              <CardDescription>How CortIQ measures this site (server source of truth).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label>Cookieless</Label>
                  <p className="text-sm text-muted-foreground">
                    No device storage, no fingerprint, no cross-visit profile. Still requires
                    analytics consent. Recommended for privacy-first sites.
                  </p>
                </div>
                <Switch
                  checked={trackingMode === 'cookieless'}
                  onCheckedChange={(checked) => updateTrackingMode(checked ? 'cookieless' : 'full')}
                />
              </div>
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  {trackingMode === 'cookieless'
                    ? 'Cookieless: CortIQ analytics run without consent. GA4 and marketing tools still require consent.'
                    : 'Full: device fingerprint + returning-visitor profiling. Requires analytics consent.'}
                  {' '}Make sure the tracking script sends the matching mode — in the WordPress plugin, set Tracking mode to the same value.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Server-Side Tracking Configuration</CardTitle>
              <CardDescription>
                Configure how server-side tracking is blocked based on user consent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Block Analytics without consent</Label>
                    <p className="text-sm text-muted-foreground">
                      Block Google Analytics, Hotjar etc. without analytics consent
                    </p>
                  </div>
                  <Switch
                    checked={serverSideConfig?.block_analytics_without_consent || false}
                    onCheckedChange={(checked) =>
                      updateServerSideConfig({
                        ...serverSideConfig,
                        block_analytics_without_consent: checked
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Block Marketing without consent</Label>
                    <p className="text-sm text-muted-foreground">
                      Block Meta Pixel, Google Ads etc. without marketing consent
                    </p>
                  </div>
                  <Switch
                    checked={serverSideConfig?.block_marketing_without_consent || false}
                    onCheckedChange={(checked) =>
                      updateServerSideConfig({
                        ...serverSideConfig,
                        block_marketing_without_consent: checked
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require explicit consent</Label>
                    <p className="text-sm text-muted-foreground">
                      Block everything until the user has given explicit consent
                    </p>
                  </div>
                  <Switch
                    checked={serverSideConfig?.require_explicit_consent || false}
                    onCheckedChange={(checked) =>
                      updateServerSideConfig({
                        ...serverSideConfig,
                        require_explicit_consent: checked
                      })
                    }
                  />
                </div>
              </div>

              {/* Integration Status */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Active Integrations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedSite.ga_integration_enabled && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Google Analytics</span>
                      <Badge variant={serverSideConfig?.block_analytics_without_consent ? "default" : "secondary"}>
                        {serverSideConfig?.block_analytics_without_consent ? 'Protected' : 'Unprotected'}
                      </Badge>
                    </div>
                  )}
                  {(selectedSite as any).facebook_pixel_enabled && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Meta Pixel</span>
                      <Badge variant={serverSideConfig?.block_marketing_without_consent ? "default" : "secondary"}>
                        {serverSideConfig?.block_marketing_without_consent ? 'Protected' : 'Unprotected'}
                      </Badge>
                    </div>
                  )}
                  {(selectedSite as any).google_ads_enabled && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Google Ads</span>
                      <Badge variant={serverSideConfig?.block_marketing_without_consent ? "default" : "secondary"}>
                        {serverSideConfig?.block_marketing_without_consent ? 'Protected' : 'Unprotected'}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Consent Validations</CardTitle>
              <CardDescription>
                Real-time monitoring of consent checks and blocked calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentValidations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No validations found yet
                  </p>
                ) : (
                  recentValidations.map((validation) => (
                    <div key={validation.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          {validation.consent_status?.overall_allowed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-medium">
                            {validation.consent_status?.integration_type || 'Unknown'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(validation.created_at).toLocaleString('sv-SE')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex space-x-2 mb-1">
                          {validation.consent_status?.allowed_types?.map((type: string) => (
                            <Badge key={type} variant="default" className="text-xs">
                              {type}
                            </Badge>
                          ))}
                          {validation.consent_status?.blocked_types?.map((type: string) => (
                            <Badge key={type} variant="destructive" className="text-xs">
                              {type}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Session: {validation.session_id.substring(0, 8)}...
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Consent Flow</CardTitle>
              <CardDescription>
                Verify that consent checks are working correctly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={testConsentFlow} className="w-full">
                Run Consent Test
              </Button>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This will run a test validation and show the result.
                  Check the "Monitoring" tab to see the test result.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CMPDashboard;