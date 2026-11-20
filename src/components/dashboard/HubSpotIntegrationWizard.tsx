import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, ExternalLink, ArrowRight, Shield, UploadCloud, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLeadQualityPipeline } from '@/hooks/useLeadQualityPipeline';
import type { Site } from '@/types/dashboard';

interface HubSpotIntegrationWizardProps {
  selectedSite: Site;
  webhookSecret?: string;
  isConfigured?: boolean;
}

const STEPS = [
  { id: 1, title: 'Create HubSpot webhook' },
  { id: 2, title: 'Paste webhook secret' },
  { id: 3, title: 'Map lead quality property' },
  { id: 4, title: 'Test connection' },
  { id: 5, title: 'Confirm' },
];

const QUALITY_ENDPOINT = `${window.location.origin.replace('localhost:8080', 'cxmkdtgfocgbfizawlwa.supabase.co')}/functions/v1/hubspot-lead-webhook`;

export function HubSpotIntegrationWizard({ selectedSite, isConfigured = false }: HubSpotIntegrationWizardProps) {
  const [step, setStep] = useState(1);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [qualityProperty, setQualityProperty] = useState('lead_quality');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { data: pipelineStats } = useLeadQualityPipeline(selectedSite.id);

  const webhookUrl = `https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/hubspot-lead-webhook?site_id=${selectedSite.id}`;

  const handleTestConnection = async () => {
    setTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-lead-webhook', {
        body: {
          site_id: selectedSite.id,
          _test: true,
          webhook_secret: webhookSecret,
        },
      });
      setTestStatus(error ? 'fail' : 'ok');
    } catch {
      setTestStatus('fail');
    }
  };

  const handleSave = async () => {
    if (!webhookSecret) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sites')
        .update({
          hubspot_webhook_secret: webhookSecret,
          hubspot_quality_property: qualityProperty,
          hubspot_lead_webhook_enabled: true,
        } as any)
        .eq('id', selectedSite.id);
      if (error) throw error;
      toast({ title: 'HubSpot lead quality loop activated' });
      setStep(5);
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isConfigured && pipelineStats) {
    return (
      <div className="space-y-3 mt-3 p-3 bg-muted/40 rounded-lg text-sm">
        <div className="flex items-center gap-2 font-medium text-green-600">
          <CheckCircle className="h-4 w-4" />
          Lead quality loop active
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold">{pipelineStats.totalClassified}</div>
            <div className="text-xs text-muted-foreground">Classified (30d)</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-500">{pipelineStats.uploaded}</div>
            <div className="text-xs text-muted-foreground">Uploaded to Ads</div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-500">{pipelineStats.skippedNoConsent}</div>
            <div className="text-xs text-muted-foreground">Skipped (no consent)</div>
          </div>
        </div>
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Emails are hashed with SHA-256 before storage. Raw email addresses are never stored in CortIQ.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Step progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-1 text-xs ${step === s.id ? 'text-primary font-medium' : step > s.id ? 'text-green-500' : 'text-muted-foreground'}`}>
              {step > s.id ? <CheckCircle className="h-3 w-3" /> : <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]">{s.id}</span>}
              <span className="hidden sm:inline">{s.title}</span>
            </div>
            {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            In HubSpot, go to <strong>Settings → Integrations → Webhooks</strong> and create a new webhook subscription.
          </p>
          <div className="p-3 bg-muted rounded font-mono text-xs break-all">{webhookUrl}</div>
          <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
            <li>Event type: <strong>contact.propertyChange</strong></li>
            <li>Property: <strong>lead_quality</strong> (or your custom property)</li>
            <li>Copy the <strong>Client Secret</strong> — you'll need it in step 2</li>
          </ul>
          <Button size="sm" className="gap-2" onClick={() => window.open('https://app.hubspot.com/settings/integrations/webhooks', '_blank')}>
            Open HubSpot Webhooks <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={() => setStep(2)} className="ml-2">Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Label>HubSpot Client Secret (webhook signature key)</Label>
          <Input
            type="password"
            value={webhookSecret}
            onChange={e => setWebhookSecret(e.target.value)}
            placeholder="Paste HubSpot client secret"
          />
          <p className="text-xs text-muted-foreground">
            Used to validate that incoming webhook requests are genuinely from HubSpot. Never shared or logged.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>Back</Button>
            <Button size="sm" onClick={() => setStep(3)} disabled={!webhookSecret}>Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Label>HubSpot contact property that stores lead quality</Label>
          <Input
            value={qualityProperty}
            onChange={e => setQualityProperty(e.target.value)}
            placeholder="lead_quality"
          />
          <p className="text-xs text-muted-foreground">
            CortIQ expects values: <strong>Priority</strong>, <strong>Qualified</strong>, or <strong>Challenge</strong>.
            These map to conversion values 300, 100, and 0 for Smart Bidding.
          </p>
          <p className="text-xs text-muted-foreground">
            Also ask &quot;how did you hear about us?&quot; in HubSpot? Set that property up separately under Self-reported source on
            this page. It must be a different property, ideally a dropdown or radio select.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>Back</Button>
            <Button size="sm" onClick={() => setStep(4)}>Next</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Send a test ping to verify the webhook endpoint and HMAC signature.</p>
          <Button
            size="sm"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test connection'}
          </Button>
          {testStatus === 'ok' && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" /> Connection verified
            </div>
          )}
          {testStatus === 'fail' && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" /> Test failed — verify the client secret and webhook URL
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep(3)}>Back</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || testStatus === 'testing'}>
              {isSaving ? 'Saving...' : 'Activate lead quality loop'}
            </Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <CheckCircle className="h-4 w-4" />
            Webhook active
          </div>
          <p className="text-sm text-muted-foreground">
            CortIQ will receive lead quality updates within 24h of SDR classification.
            Classified leads with a Google Ads click ID will be uploaded daily to Google Ads Enhanced Conversions.
          </p>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-xs">
              GDPR: Email addresses are hashed with SHA-256 before storage. Only visitors who gave marketing consent have their gclid stored, and only those are eligible for upload.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
