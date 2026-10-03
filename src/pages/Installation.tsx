import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AddSiteForm } from '@/components/dashboard/AddSiteForm';
import { InstallationGuide } from '@/components/dashboard/InstallationGuide';
import { useSites } from '@/hooks/useSites';

export default function Installation() {
  const { sites, loadSites } = useSites();
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Default to the most recently created site once sites load.
  const activeSite =
    sites.find((s) => s.id === activeSiteId) ?? sites[0] ?? null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Install tracking</h1>
            <p className="text-muted-foreground">
              Add a website, then drop the tracking snippet on it to start collecting data.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        </div>

        {/* What you're installing — layer + privacy explainer */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium mb-1">🗄️ Data layer</p>
            <p className="text-xs text-muted-foreground">
              The ~13&nbsp;kB (gzipped) script sends page views, clicks and (with consent) heatmaps to your
              CortIQ project. It also detects AI bots. Cookie-free by default.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium mb-1">🔒 Privacy built in</p>
            <p className="text-xs text-muted-foreground">
              Visitor analytics start only after analytics consent; click IDs, fingerprinting and session
              replay need explicit consent too, verified server-side. AI-bot detection runs without consent. IPs anonymised at ingest.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium mb-1">🧠 AI layer (optional)</p>
            <p className="text-xs text-muted-foreground">
              The AI assistant and agent (MCP) API are a separate opt-in layer. They only ever read
              your own data — installing the tracker does not enable any AI access.
            </p>
          </div>
        </div>

        <AddSiteForm onSiteAdded={loadSites} />

        {sites.length > 0 && (
          <div className="space-y-4">
            {sites.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {sites.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant={activeSite?.id === s.id ? 'default' : 'outline'}
                    onClick={() => setActiveSiteId(s.id)}
                  >
                    {s.site_name}
                  </Button>
                ))}
              </div>
            )}
            <InstallationGuide selectedSite={activeSite} />
          </div>
        )}
      </div>
    </div>
  );
}
