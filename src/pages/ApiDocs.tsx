/**
 * API Documentation Landing Page
 * Task #5: Publikt REST API med dokumentation
 */

import { Link } from 'react-router-dom';
import PublicNavigation from '@/components/PublicNavigation';
import { useSEO } from '@/hooks/useSEO';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Code,
  Key,
  ExternalLink,
  BookOpen,
  Zap,
  Shield,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Bot,
  Database,
} from 'lucide-react';

export default function ApiDocs() {
  useSEO({
    title: 'API Documentation — CortIQ',
    description: 'CortIQ read-only REST API: sessions, page views, referrers, AI agent sessions, conversions and heatmaps as JSON or CSV. OpenAPI spec, API key authentication.',
  });
  const features = [
    {
      icon: <Zap className="h-6 w-6" />,
      title: 'Fast & Reliable',
      description: 'Served by a Supabase Edge Function in the same project as your data',
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'Secure',
      description: 'API key authentication with rate limiting and usage tracking',
    },
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: 'Site-scoped',
      description: 'Each API key reads data for exactly one site',
    },
    {
      icon: <Bot className="h-6 w-6" />,
      title: 'AI Agent Analytics',
      description: 'Dedicated endpoint for AI agent sessions (agentic browsers)',
    },
  ];

  const API_BASE = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/public-api';

  const endpoints = [
    { method: 'GET', path: '/sites', description: 'The site this key is scoped to' },
    { method: 'GET', path: '/sites/{id}/visits', description: 'Sessions' },
    { method: 'GET', path: '/sites/{id}/pages', description: 'Page views' },
    { method: 'GET', path: '/sites/{id}/referrers', description: 'Sessions per referrer hostname' },
    { method: 'GET', path: '/sites/{id}/agents', description: 'AI agent sessions' },
    { method: 'GET', path: '/sites/{id}/conversions', description: 'Conversion events' },
    { method: 'GET', path: '/sites/{id}/heatmaps', description: 'Click and scroll heatmap points' },
  ];

  const codeExample = `curl ${API_BASE}/sites/YOUR_SITE_ID/visits \\
  -H "Authorization: Bearer ck_live_your_api_key_here" \\
  -G --data-urlencode "date_from=2026-01-01" \\
     --data-urlencode "date_to=2026-01-31" \\
     --data-urlencode "format=json"`;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <PublicNavigation />

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 px-4 py-2 text-base">
              <Code className="h-4 w-4 mr-2" />
              Public REST API
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold text-gradient-primary mb-6">
              CortIQ Developer API
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Powerful REST API for accessing your analytics data programmatically.
              Build custom dashboards, automate reports, and integrate with your tools.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <a href="/api-docs/index.html" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
                <BookOpen className="mr-2 h-5 w-5" />
                View API Documentation
              </Button>
            </a>
            <Link to="/dashboard?tab=cortiq-api">
              <Button size="lg" variant="outline" className="hover-lift">
                <Key className="mr-2 h-5 w-5" />
                Create API Key
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Two API layers */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Two ways to access CortIQ</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              CortIQ separates the <strong>Data Layer</strong> (your analytics) from the
              <strong> Agentic Layer</strong> (AI access). Each has its own API and its own key —
              so you can give an AI agent read access without exposing anything else.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Data Layer API */}
            <Card className="glass border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" /> Data Layer — REST API
                </CardTitle>
                <CardDescription>Read your analytics programmatically (dashboards, reports, exports)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Read sessions, page views, referrers, AI agent sessions, conversions and heatmap points. JSON or CSV.</p>
                <code className="block p-3 bg-muted rounded font-mono text-xs overflow-x-auto">
                  GET /functions/v1/public-api/sites/&#123;site_id&#125;/pages?date_from=…
                  <br />Authorization: Bearer ck_live_…
                </code>
                <p className="text-xs">Auth: CortIQ API key · scoped to one site · default 1,000 requests/hour.</p>
              </CardContent>
            </Card>

            {/* Agentic Layer API */}
            <Card className="glass border-accent/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-accent" /> Agentic Layer — MCP Server
                </CardTitle>
                <CardDescription>Let AI agents query your analytics with tool-use</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>A Model Context Protocol server exposing 23 read tools, so Claude, ChatGPT or
                your own agent can answer questions grounded in your real data.</p>
                <code className="block p-3 bg-muted rounded font-mono text-xs overflow-x-auto">
                  POST /functions/v1/mcp-server
                  <br />Authorization: Bearer ck_live_…
                </code>
                <p className="text-xs">Auth: same API-key model · read-only tools · per-key rate limit · queries scoped to the key's site.</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Security model:</strong> both APIs authenticate with a
              CortIQ API key that is stored only as a SHA-256 hash. Each key is scoped to one site, and every
              query is filtered to that site server-side. Keys are rate-limited per key and can expire or be
              deactivated.
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover-lift glass">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-muted-foreground">
              Simple authentication, comprehensive data access
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Authentication */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  1. Authentication
                </CardTitle>
                <CardDescription>
                  Send your CortIQ API key as a Bearer token on every request
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">HTTP Header:</p>
                  <code className="block p-3 bg-muted rounded text-sm font-mono">
                    Authorization: Bearer ck_live_your_api_key
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Each key is scoped to one site. Create keys in the dashboard under{' '}
                    <Link to="/dashboard?tab=cortiq-api" className="text-primary hover:underline">Settings → CortIQ API &amp; MCP</Link>.
                    The full key is shown once; only its SHA-256 hash is stored.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Example Request */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5 text-primary" />
                  2. Make a Request
                </CardTitle>
                <CardDescription>
                  Simple REST API with JSON or CSV responses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Base URL:</p>
                  <code className="block p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
                    {API_BASE}
                  </code>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Example cURL:</p>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
                    {codeExample}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Available Endpoints
            </h2>
            <p className="text-xl text-muted-foreground">
              7 read-only GET endpoints
            </p>
          </div>

          <Card className="glass">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {endpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="font-mono font-bold">
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono text-primary">
                        {endpoint.path}
                      </code>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {endpoint.description}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <a href="/api-docs/index.html" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="hover-lift">
                View Full API Reference
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features Highlight */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Why CortIQ API?
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">AI Agent Sessions</h3>
                    <p className="text-muted-foreground">
                      Sessions from agentic browsers such as ChatGPT agent and Perplexity Comet, as a separate endpoint
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Consent-Gated Data</h3>
                    <p className="text-muted-foreground">
                      Visitor analytics are collected only after analytics consent, in both cookieless and full
                      mode. Only the bot/security layer runs without consent.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Export Formats</h3>
                    <p className="text-muted-foreground">
                      JSON by default, CSV with format=csv on every endpoint
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Rate Limiting</h3>
                    <p className="text-muted-foreground">
                      Per-key limit, default 1,000 successful requests per rolling hour; 429 with Retry-After when exceeded
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Pagination</h3>
                    <p className="text-muted-foreground">
                      Up to 1,000 rows per request; page with limit and offset
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Card className="glass p-8">
              <h3 className="text-2xl font-bold mb-6 text-center">
                Ready to Build?
              </h3>
              <div className="space-y-4">
                <Link to="/dashboard?tab=cortiq-api" className="block">
                  <Button className="w-full bg-gradient-primary hover-scale hover-glow" size="lg">
                    Create an API Key
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <a
                  href="/api-docs/index.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button variant="outline" className="w-full hover-lift" size="lg">
                    <BookOpen className="mr-2 h-5 w-5" />
                    Read Documentation
                  </Button>
                </a>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Need help? <Link to="/#contact" className="text-primary hover:underline">Contact our team</Link>
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
