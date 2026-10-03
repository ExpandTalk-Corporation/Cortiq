import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Globe, Code, BarChart3, ArrowRight, Loader2, Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  { id: 1, label: 'Add site', icon: Globe },
  { id: 2, label: 'Install script', icon: Code },
  { id: 3, label: 'Start tracking', icon: BarChart3 },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [siteName, setSiteName] = useState('');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [newSiteId, setNewSiteId] = useState<string | null>(null);
  const [newTrackingId, setNewTrackingId] = useState('');
  const { user } = useAuth();

  const supabaseUrl = 'https://cxmkdtgfocgbfizawlwa.supabase.co';

  const handleAddSite = async () => {
    if (!siteName.trim() || !domain.trim()) {
      toast.error('Fill in both site name and domain.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sites')
        .insert({
          site_name: siteName.trim(),
          domain: domain.trim().replace(/^https?:\/\//, ''),
          user_id: user?.id ?? '',
          tracking_id: '',
          is_active: true,
          ga_integration_enabled: false,
          ga_enhanced_ecommerce: false,
          ip_exclusion_enabled: true,
          cookie_scanning_enabled: true,
          auto_categorize_cookies: true,
          ga_sync_events: [],
          excluded_ips: [],
          conversion_goals: [],
          screenshot_urls: {},
          navigation_config: {},
          form_tracking_config: {}
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Site creation failed.');

      setNewSiteId(data.id);
      setNewTrackingId(data.tracking_id ?? '');
      toast.success(`"${siteName}" added!`);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add site.');
    } finally {
      setLoading(false);
    }
  };

  // Same snippet as InstallationGuide: the tracker reads window.cortiqConfig only
  // (it ignores data-* attributes on its script tag).
  const scriptTag = newSiteId
    ? `<script>
  window.cortiqConfig = {
    apiUrl: '${import.meta.env.VITE_SUPABASE_URL}/functions/v1',
    siteId: '${newSiteId}',
    apiKey: '${newTrackingId}',
    cookieless: true
  };
</script>
<script src="https://cortiq.se/spa-tracking.js" defer></script>`
    : '';

  return (
    <div className="max-w-2xl mx-auto py-12 space-y-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center">
              <div className={`flex flex-col items-center gap-1`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done ? 'bg-primary border-primary text-primary-foreground' :
                  active ? 'border-primary text-primary' :
                  'border-muted text-muted-foreground'
                }`}>
                  {done ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-16 h-0.5 mb-5 mx-1 ${step > s.id ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Add site */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 1 of 3</Badge>
            </div>
            <CardTitle className="text-xl">Welcome to CortIQ</CardTitle>
            <CardDescription>
              Start by adding the website you want to track. You can add more sites later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site name</Label>
              <Input
                id="site-name"
                placeholder="My Company Website"
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSite()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="mycompany.com"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSite()}
              />
              <p className="text-xs text-muted-foreground">Without https:// — e.g. mycompany.com</p>
            </div>
            <Button onClick={handleAddSite} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? 'Creating...' : 'Add site'}
              {!loading && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>

            {/* USP highlights */}
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2 mt-2">
              <p className="text-xs font-medium text-muted-foreground">What you get:</p>
              <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-primary" /> AI agent tracking (ChatGPT, Perplexity, Claude)</div>
                <div className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> 100% cookie-free, GDPR-compliant analytics</div>
                <div className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-primary" /> Heatmaps, A/B testing, session recording</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Install script */}
      {step === 2 && newSiteId && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 2 of 3</Badge>
            </div>
            <CardTitle className="text-xl">Install the tracking script</CardTitle>
            <CardDescription>
              Paste this snippet before the closing <code className="bg-muted px-1 rounded text-xs">&lt;/body&gt;</code> tag on every page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto font-mono select-all">
                {scriptTag}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(scriptTag);
                  toast.success('Copied to clipboard!');
                }}
              >
                Copy
              </Button>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
              <p className="text-xs font-medium">WordPress?</p>
              <p className="text-xs text-muted-foreground">
                Use the CortIQ WordPress plugin for 1-click installation.
                Go to <strong>Settings → Setup</strong> after this wizard to download it.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                I've installed it <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 3 of 3</Badge>
            </div>
            <CardTitle className="text-xl flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              All set!
            </CardTitle>
            <CardDescription>
              CortIQ is configured. Your first data will appear within a few minutes after the first visit to your site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center py-2">
              <div className="border rounded-lg p-3 bg-muted/30">
                <p className="text-2xl font-bold text-primary">~1min</p>
                <p className="text-xs text-muted-foreground">First data</p>
              </div>
              <div className="border rounded-lg p-3 bg-muted/30">
                <p className="text-2xl font-bold text-primary">100%</p>
                <p className="text-xs text-muted-foreground">GDPR-safe</p>
              </div>
              <div className="border rounded-lg p-3 bg-muted/30">
                <p className="text-2xl font-bold text-primary">AI</p>
                <p className="text-xs text-muted-foreground">Agent ready</p>
              </div>
            </div>
            <Button onClick={onComplete} className="w-full">
              Go to dashboard <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
