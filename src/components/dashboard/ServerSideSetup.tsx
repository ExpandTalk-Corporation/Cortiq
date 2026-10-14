import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useServerSideCoverage } from '@/hooks/useServerSideCoverage';

interface ServerSideSetupProps {
  siteId: string;
  trackingKey: string;
  apiBase: string;
  origin: string;
}

const HONEYPOT = `<a href="/cortiq-trap/" rel="nofollow" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">.</a>`;

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-muted text-foreground p-4 rounded-md font-mono text-xs mt-2 overflow-x-auto whitespace-pre">{children}</pre>
  );
}

// Server-side agent measurement: adapters run on the customer's server/edge and send only
// bot/agent requests, robots.txt / llms.txt fetches and honeypot hits to `server-hit`.
export function ServerSideSetup({ siteId, trackingKey, apiBase, origin }: ServerSideSetupProps) {
  const endpoint = `${apiBase}/server-hit`;
  const helperUrl = `${origin}/cortiq-server.mjs`;
  const { data: coverage } = useServerSideCoverage(siteId);

  const nextjs = `// middleware.ts (Next.js 16: proxy.ts, export function proxy)
// Copy ${helperUrl} to lib/cortiq-server.mjs
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { createCortiq } from './lib/cortiq-server.mjs';

const cortiq = createCortiq({ siteKey: process.env.CORTIQ_SITE_KEY, endpoint: '${endpoint}' });

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p);
  if (cortiq.isTrap(request)) return cortiq.trapResponse(request, waitUntil);
  cortiq.report(request, { waitUntil });
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

// .env: CORTIQ_SITE_KEY=${trackingKey}
// app/layout.tsx, inside <body>: the honeypot link below
// app/robots.ts: rules: [{ userAgent: '*', disallow: '/cortiq-trap/' }]`;

  const netlify = `// netlify/edge-functions/cortiq.ts
// Copy ${helperUrl} to lib/cortiq-server.mjs
import { createCortiq } from '../../lib/cortiq-server.mjs';

const cortiq = createCortiq({ siteKey: Netlify.env.get('CORTIQ_SITE_KEY'), endpoint: '${endpoint}' });

export default async (request: Request, context: { next: () => Promise<Response>; waitUntil: (p: Promise<unknown>) => void }) => {
  const waitUntil = (p: Promise<unknown>) => context.waitUntil(p);
  if (cortiq.isTrap(request)) return cortiq.trapResponse(request, waitUntil);
  const response = await context.next();
  cortiq.report(request, { status: response.status, waitUntil });
  return response;
};

export const config = { path: '/*', excludedPath: ['/*.css', '/*.js', '/*.png', '/*.jpg', '/*.svg', '/*.webp', '/*.woff2'] };

// Site settings → Environment variables: CORTIQ_SITE_KEY=${trackingKey}
// Add the honeypot link to your HTML template and "Disallow: /cortiq-trap/" to robots.txt.`;

  const cloudflare = `1. Cloudflare → Workers & Pages → Create Worker
2. Paste ${origin}/cloudflare-worker.js and deploy
3. Settings → Variables: CORTIQ_SITE_KEY = ${trackingKey}
4. Triggers → Add route: your-domain.com/*

The Worker adds the honeypot link to HTML and the Disallow line to robots.txt itself.`;

  const node = `// Node 18+ / Express. Copy ${helperUrl} next to your server.
import express from 'express';
import { createCortiq, cortiqExpress } from './cortiq-server.mjs';

const app = express();
app.use(cortiqExpress(createCortiq({ siteKey: process.env.CORTIQ_SITE_KEY, endpoint: '${endpoint}' })));
// …your routes. CORTIQ_SITE_KEY=${trackingKey}
// Behind a proxy, make sure X-Forwarded-For reaches the app (IP is truncated before sending).`;

  const http = `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer ${trackingKey}' \\
  -H 'Content-Type: application/json' \\
  -d '{"hits":[{"url":"https://your-domain.com/page","userAgent":"Mozilla/5.0 (compatible; GPTBot/1.2)","ip":"203.0.113.0","status":200}]}'

# Send only bot/agent requests, /robots.txt, /llms.txt and /cortiq-trap/ hits.
# Truncate the IP (a.b.c.0, or the first three IPv6 groups) and drop the query string
# before sending. Up to 100 hits per request.`;

  return (
    <div className="space-y-3">
      <div>
        <Label>Server-side agent measurement (recommended for AI crawlers)</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Most AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) never run JavaScript, so no browser
          script sees them. These adapters run on your server or edge and send CortIQ only bot/agent requests,
          <code> robots.txt</code> / <code>llms.txt</code> fetches and hits on a hidden honeypot link — with the IP
          truncated and without query strings. Human requests are never sent and nothing runs in the visitor's browser,
          so no consent banner is involved. It is still personal data under GDPR: mention it in your privacy policy.
        </p>
        {coverage && (
          <p className="text-xs mt-2">
            {coverage.serverLog > 0
              ? `✅ Server-side: ${coverage.serverLog} AI-bot requests in 30 days (robots.txt ${coverage.robotsTxt}, llms.txt ${coverage.llmsTxt}, honeypot ${coverage.honeypot}) · browser tag: ${coverage.jsTag}`
              : '⏳ No server-side data yet for this site — install one of the adapters below.'}
          </p>
        )}
      </div>

      <Tabs defaultValue="nextjs">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="nextjs">Next.js / Vercel</TabsTrigger>
          <TabsTrigger value="netlify">Netlify</TabsTrigger>
          <TabsTrigger value="cloudflare">Cloudflare</TabsTrigger>
          <TabsTrigger value="node">Node / Express</TabsTrigger>
          <TabsTrigger value="wordpress">WordPress</TabsTrigger>
          <TabsTrigger value="http">Any server</TabsTrigger>
        </TabsList>
        <TabsContent value="nextjs"><Code>{nextjs}</Code></TabsContent>
        <TabsContent value="netlify"><Code>{netlify}</Code></TabsContent>
        <TabsContent value="cloudflare"><Code>{cloudflare}</Code></TabsContent>
        <TabsContent value="node"><Code>{node}</Code></TabsContent>
        <TabsContent value="wordpress">
          <p className="text-sm text-muted-foreground mt-2">
            Built into the CortIQ plugin from version 5.5.0 and on by default once the Tracking ID is filled in
            (Settings → CortIQ → Server-side agent measurement). It also adds the honeypot link and the robots.txt line.
            With full-page caching WordPress doesn't see every request — add the Cloudflare Worker for full coverage.
          </p>
        </TabsContent>
        <TabsContent value="http"><Code>{http}</Code></TabsContent>
      </Tabs>

      <div>
        <Label className="text-xs">Honeypot link (Next.js, Netlify, Node, any server — put it once in your HTML template)</Label>
        <Code>{HONEYPOT}</Code>
      </div>

      <p className="text-xs text-muted-foreground">
        Built with Lovable, Bolt, v0 or another AI site builder? v0 apps are Next.js — use that tab. Static exports on
        Netlify — use Netlify. Anything else, including builder-hosted sites: put the domain behind Cloudflare and use the Worker.
      </p>
    </div>
  );
}
