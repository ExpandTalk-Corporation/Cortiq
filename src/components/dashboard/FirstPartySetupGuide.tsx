import React, { useState } from 'react';
import { DashboardCard } from './DashboardCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Globe, Shield, Zap, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FirstPartySetupGuideProps {
  selectedSite: {
    id: string;
    domain: string;
    tracking_id: string;
  };
}

export function FirstPartySetupGuide({ selectedSite }: FirstPartySetupGuideProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast({
        title: "Copied!",
        description: "The code has been copied to clipboard"
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const domain = selectedSite.domain.replace(/https?:\/\//, '').replace(/\/$/, '');

  const firstPartyScriptCode = `<!-- First-Party Analytics Setup -->
<script>
  window.analyticsConfig = {
    trackingId: '${selectedSite.tracking_id}',
    siteId: '${selectedSite.id}',
    domain: '${domain}',
    gdprEnabled: true,
    firstParty: true,
    apiEndpoint: '/api/analytics/track'
  };
</script>
<script src="/js/first-party-tracking.js" defer></script>`;

  const serverProxyCode = `// Server-side proxy (Express.js example)
// pixel-tracking stores nothing unless the body carries consent: { analytics: true },
// set only after the visitor has accepted analytics cookies.
app.post('/api/analytics/track', async (req, res) => {
  try {
    const response = await fetch('${process.env.SUPABASE_URL}/functions/v1/pixel-tracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error' });
  }
});`;

  const nginxConfig = `# Nginx proxy config
location /api/analytics/ {
    proxy_pass ${process.env.SUPABASE_URL}/functions/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Authorization "Bearer ${process.env.SUPABASE_ANON_KEY}";
}`;

  const cloudflareWorkerCode = `// Cloudflare Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/api/analytics/')) {
      const targetPath = url.pathname.replace('/api/analytics/', '');
      const targetUrl = \`\${env.SUPABASE_URL}/functions/v1/\${targetPath}\`;
      
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: {
          ...request.headers,
          'Authorization': \`Bearer \${env.SUPABASE_ANON_KEY}\`
        },
        body: request.body
      });
      
      return await fetch(modifiedRequest);
    }
    
    return await env.ASSETS.fetch(request);
  }
};`;

  return (
    <div className="space-y-6">
      <DashboardCard title="First-Party Analytics Setup" variant={2}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-green-500" />
            <Badge variant="secondary" className="bg-green-500/10 text-green-500">
              First-Party Tracking
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Configure first-party tracking to avoid ad blockers and improve performance. 
            First-party cookies are stored on your own domain and are not blocked by browsers.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="p-4 rounded-lg bg-card-elevated border">
              <Globe className="h-8 w-8 text-primary mb-2" />
              <h3 className="font-mono-bold text-sm">Same Domain</h3>
              <p className="text-xs text-muted-foreground">
                Cookies are stored on your domain instead of a third-party domain
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-card-elevated border">
              <Shield className="h-8 w-8 text-green-500 mb-2" />
              <h3 className="font-mono-bold text-sm">Ad-block Safe</h3>
              <p className="text-xs text-muted-foreground">
                Not blocked by ad blockers or tracking protection
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-card-elevated border">
              <Zap className="h-8 w-8 text-yellow-500 mb-2" />
              <h3 className="font-mono-bold text-sm">Faster</h3>
              <p className="text-xs text-muted-foreground">
                Less latency and better performance
              </p>
            </div>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard title="Implementation" variant={1}>
        <Tabs defaultValue="script" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="server">Server Proxy</TabsTrigger>
            <TabsTrigger value="nginx">Nginx</TabsTrigger>
            <TabsTrigger value="cloudflare">Cloudflare</TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="space-y-4">
            <div>
              <h3 className="font-mono-bold text-sm mb-2">1. Add script to &lt;head&gt;</h3>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                  <code>{firstPartyScriptCode}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(firstPartyScriptCode, 0)}
                >
                  {copiedIndex === 0 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <h3 className="font-mono-bold text-sm mb-2">2. Download tracking script</h3>
              <Button 
                variant="outline" 
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = '/first-party-tracking.js';
                  link.download = 'first-party-tracking.js';
                  link.click();
                }}
              >
                <Server className="h-4 w-4 mr-2" />
                Download first-party-tracking.js
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Place the file in the /js/ folder on your web server
              </p>
            </div>
          </TabsContent>

          <TabsContent value="server" className="space-y-4">
            <div>
              <h3 className="font-mono-bold text-sm mb-2">Server-side Proxy (Express.js)</h3>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                  <code>{serverProxyCode}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(serverProxyCode, 1)}
                >
                  {copiedIndex === 1 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="nginx" className="space-y-4">
            <div>
              <h3 className="font-mono-bold text-sm mb-2">Nginx Proxy Configuration</h3>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                  <code>{nginxConfig}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(nginxConfig, 2)}
                >
                  {copiedIndex === 2 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cloudflare" className="space-y-4">
            <div>
              <h3 className="font-mono-bold text-sm mb-2">Cloudflare Worker</h3>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                  <code>{cloudflareWorkerCode}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(cloudflareWorkerCode, 3)}
                >
                  {copiedIndex === 3 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DashboardCard>

      <DashboardCard title="Benefits of First-Party Tracking" variant={3}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-mono-bold text-sm text-green-500">✓ Benefits</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Not blocked by ad blockers</li>
                <li>• Faster laddningstider</li>
                <li>• Better cookie retention</li>
                <li>• More reliable data</li>
                <li>• GDPR-compatible</li>
                <li>• No CORS issues</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-mono-bold text-sm text-yellow-500">⚠ Requirements</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Server-side proxy required</li>
                <li>• Must be hosted on the same domain</li>
                <li>• Requires server configuration</li>
                <li>• Environment variables required</li>
              </ul>
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}