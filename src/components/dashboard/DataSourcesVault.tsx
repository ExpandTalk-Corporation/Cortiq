import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ShieldCheck, ShieldAlert, ChevronDown, ChevronUp,
  Bot, BarChart3, Search, Megaphone, KeyRound, RefreshCw, MapPin, CheckSquare, Info,
} from 'lucide-react';
import { integrations, type IntegrationConcept } from '@/ontology/integrations';
import {
  useCompanyIntegrations,
  useSaveIntegration,
  useDisconnectIntegration,
  type CompanyIntegration,
} from '@/hooks/useCompanyIntegrations';

/* ── Field definitions per integration ─────────────────────────────────────── */

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  required?: boolean;
}

const FIELDS: Record<string, FieldDef[]> = {
  anthropic: [
    { key: 'api_key', label: 'API Key', placeholder: 'sk-ant-...', secret: true, required: true },
  ],
  openai: [
    { key: 'api_key', label: 'API Key', placeholder: 'sk-...', secret: true, required: true },
  ],
  // google_ads_api: per-site OAuth in Settings → Integrations → Google Ads (GoogleAdsConnectCard).
  meta_ads_api: [
    { key: 'access_token',  label: 'Access Token',  placeholder: 'EAAxxxxx...', secret: true, required: true },
    { key: 'ad_account_id', label: 'Ad Account ID', placeholder: 'act_123456789', required: true },
    { key: 'app_id',        label: 'App ID',        placeholder: '1234567890' },
    { key: 'app_secret',    label: 'App Secret',    placeholder: 'abc123...', secret: true },
  ],
  linkedin_ads_api: [
    { key: 'access_token',  label: 'Access Token',  placeholder: 'AQXxxxx...', secret: true, required: true },
    { key: 'account_id',    label: 'Ad Account ID', placeholder: '123456789', required: true },
  ],
  dataforseo: [
    { key: 'username', label: 'Username (email)', placeholder: 'user@example.com', required: true },
    { key: 'password', label: 'API Password',     placeholder: '••••••••', secret: true, required: true },
  ],
  google_analytics_4: [
    { key: 'property_id',  label: 'GA4 Property ID (numeric)', placeholder: '123456789', required: true },
    { key: 'client_email', label: 'Service Account Email',      placeholder: 'cortiq@your-project.iam.gserviceaccount.com', required: true },
    { key: 'private_key',  label: 'Private Key',                placeholder: '-----BEGIN RSA PRIVATE KEY-----', secret: true, required: true },
  ],
};

/* ── Category icons ─────────────────────────────────────────────────────────── */

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ai_provider:          Bot,
  paid_advertising:     Megaphone,
  seo_tools:            Search,
  analytics_platforms:  BarChart3,
};

/* ── Single integration card ─────────────────────────────────────────────────── */

interface IntegrationCardProps {
  concept: IntegrationConcept;
  existing: CompanyIntegration | undefined;
  companyId: string;
}

function IntegrationCard({ concept, existing, companyId }: IntegrationCardProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const save = useSaveIntegration();
  const disconnect = useDisconnectIntegration();

  const isConnected = existing?.status === 'connected';
  const isPlanned = concept.status === 'planned';
  const fields = FIELDS[concept.id] ?? [];

  const handleOpen = () => {
    // Pre-fill with non-secret values already stored
    if (existing?.credentials) {
      const prefilled: Record<string, string> = {};
      fields.forEach(f => {
        if (!f.secret && existing.credentials[f.key]) {
          prefilled[f.key] = existing.credentials[f.key];
        }
      });
      setValues(prefilled);
    }
    setOpen(v => !v);
  };

  const handleSave = () => {
    const required = fields.filter(f => f.required && !values[f.key]?.trim());
    if (required.length > 0) {
      setValidationError('Required fields missing: ' + required.map(f => f.label).join(', '));
      return;
    }
    setValidationError(null);

    const trimmed = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim()])
    );
    // Merge with previously-saved values so optional non-secret fields survive round-trips
    const merged = { ...(existing?.credentials ?? {}), ...trimmed };

    save.mutate(
      { companyId, integrationType: concept.id, credentials: merged },
      { onSuccess: () => setOpen(false) }
    );
  };

  const handleDisconnect = () => {
    disconnect.mutate({ companyId, integrationType: concept.id });
    setValues({});
  };

  return (
    <Card className={isConnected ? 'border-green-500/40' : isPlanned ? 'border-amber-500/30 bg-amber-500/5' : 'border-dashed'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {isConnected ? (
              <ShieldCheck className="h-5 w-5 text-green-500" />
            ) : isPlanned ? (
              <MapPin className="h-5 w-5 text-amber-500" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            )}
            <CardTitle className="text-base">{concept.label}</CardTitle>

            {isConnected ? (
              <Badge variant="default" className="bg-green-600 text-xs">Connected</Badge>
            ) : isPlanned ? (
              <Badge className="text-xs bg-amber-500 text-white border-0">Roadmap</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Not configured</Badge>
            )}

            {concept.authType === 'oauth2' && (
              <Badge variant="outline" className="text-xs gap-1">
                <RefreshCw className="h-2.5 w-2.5" /> OAuth 2.0
              </Badge>
            )}
            {concept.authType === 'api_key' && (
              <Badge variant="outline" className="text-xs gap-1">
                <KeyRound className="h-2.5 w-2.5" /> API Key
              </Badge>
            )}
          </div>

          {!isPlanned && (
            <div className="flex gap-2">
              {isConnected && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                  className="text-muted-foreground text-xs"
                >
                  Disconnect
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleOpen}>
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {isConnected ? 'Edit' : 'Configure'}
              </Button>
            </div>
          )}
        </div>

        <CardDescription className="text-sm">{concept.description}</CardDescription>

        {/* Roadmap tasks — shown inline so developers/stakeholders see exactly what's needed */}
        {isPlanned && concept.roadmapTasks && concept.roadmapTasks.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" />
              Required before going live:
            </p>
            <ol className="space-y-1">
              {concept.roadmapTasks.map((task, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-amber-500 font-bold shrink-0">{i + 1}.</span>
                  {task}
                </li>
              ))}
            </ol>
          </div>
        )}

        {existing?.last_synced_at && (
          <p className="text-xs text-muted-foreground">
            Last synced: {new Date(existing.last_synced_at).toLocaleString('sv-SE')}
          </p>
        )}
        {existing?.status === 'error' && existing.error_message && (
          <p className="text-xs text-destructive">{existing.error_message}</p>
        )}
      </CardHeader>

      <Collapsible open={open}>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {concept.authType === 'oauth2' && (
              <Alert>
                <RefreshCw className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  This integration uses OAuth 2.0. Generate a refresh token via{' '}
                  <a
                    href="https://developers.google.com/oauthplayground"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    OAuth Playground
                  </a>{' '}
                  and enter the credentials manually below. A one-click OAuth flow is planned.
                </AlertDescription>
              </Alert>
            )}

            {concept.id === 'google_analytics_4' && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-medium">This enables server-side import of historical GA4 data into your KPI dashboard.</p>
                  <ol className="space-y-1 text-xs list-decimal pl-4 text-muted-foreground">
                    <li>Go to <strong>Google Cloud Console</strong> → IAM &amp; Admin → Service Accounts</li>
                    <li>Create a service account (e.g. <em>cortiq-ga4</em>) and download the JSON key file</li>
                    <li>In <strong>Google Analytics</strong> → Admin → Property Access Management, add the service account email with <em>Viewer</em> role</li>
                    <li>Copy the <strong>Property ID</strong> from GA4 Admin → Property Settings (numeric, e.g. 123456789)</li>
                    <li>Paste the service account email and the full contents of the private_key field from the JSON file</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    The basic GA4 tracking setup (Measurement ID) is configured separately under <strong>Integrations → Google Analytics 4</strong> in the site settings.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {fields.map(field => (
                <div
                  key={field.key}
                  className={fields.length === 1 || field.key === 'private_key' ? 'md:col-span-2' : ''}
                >
                  <div className="space-y-1.5">
                    <Label>
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      type={field.secret ? 'password' : 'text'}
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ''}
                      onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>

            {validationError && (
              <Alert variant="destructive">
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? 'Saving...' : isConnected ? 'Update' : 'Save & connect'}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ── Main component ──────────────────────────────────────────────────────────── */

interface DataSourcesVaultProps {
  companyId: string;
}

// Categories to render, in order
const CATEGORIES = ['ai_provider', 'paid_advertising', 'seo_tools', 'analytics_platforms'] as const;

export function DataSourcesVault({ companyId }: DataSourcesVaultProps) {
  const { data: saved = [], isLoading } = useCompanyIntegrations(companyId);

  // Index existing integrations by type for O(1) lookup
  const savedByType = Object.fromEntries(saved.map(s => [s.integration_type, s]));

  // Group ontology instances by their parent category
  const byCategory = CATEGORIES.reduce<Record<string, IntegrationConcept[]>>((acc, cat) => {
    acc[cat] = Object.values(integrations).filter(
      c => c.kind === 'integration-instance' && c.parent === cat && !!FIELDS[c.id]
    ) as IntegrationConcept[];
    return acc;
  }, {});

  const categoryLabel: Record<string, string> = {
    ai_provider:         'AI Providers',
    paid_advertising:    'Paid Advertising',
    seo_tools:           'SEO Tools',
    analytics_platforms: 'Analytics',
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold">Data Sources</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your own accounts. Credentials are stored per company and used by background
          import jobs — never shared between tenants.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading integrations...</div>
      ) : (
        CATEGORIES.map(cat => {
          const Icon = CATEGORY_ICONS[cat] ?? KeyRound;
          const items = byCategory[cat] ?? [];
          if (items.length === 0) return null;

          return (
            <div key={cat} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                <Icon className="h-4 w-4" />
                {categoryLabel[cat]}
              </div>
              <div className="space-y-3">
                {items.map(concept => (
                  <IntegrationCard
                    key={concept.id}
                    concept={concept}
                    existing={savedByType[concept.id]}
                    companyId={companyId}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
