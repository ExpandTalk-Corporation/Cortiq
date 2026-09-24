import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import { 
  MousePointer,
  BarChart3,
  FormInput,
  Shield,
  Cookie,
  Users,
  Globe,
  Zap,
  Eye,
  TrendingUp,
  Settings,
  Database,
  Lock,
  Smartphone,
  Monitor,
  Navigation,
  Target,
  FileText,
  Search,
  Layers,
  CheckCircle,
  AlertTriangle,
  Link2,
  ArrowUpDown,
  Upload
} from "lucide-react";

export default function Features() {
  useSEO({
    title: 'Features — CortIQ Analytics Platform',
    description: 'Full feature overview: AI bot classification, server-side bot ingestion, click and scroll heatmaps, form analytics, conversion attribution, an MCP server and a built-in consent banner (CMP).',
  });
  const coreFeatures = [
    {
      icon: <MousePointer className="h-8 w-8" />,
      title: "Visual Analytics",
      description: "Visualize where users click and how far they scroll on your website",
      features: ["Click heatmaps", "Scroll-depth heatmaps (25/50/75/100%)", "Device-specific views", "Desktop, tablet and mobile"]
    },
    {
      icon: <BarChart3 className="h-8 w-8" />,
      title: "Real-Time Analysis",
      description: "Get real-time insights about your visitors and their behavior",
      features: ["Live users", "Session data", "Conversion statistics", "Traffic flows"]
    },
    {
      icon: <FormInput className="h-8 w-8" />,
      title: "Form Analytics",
      description: "Understand how users interact with your forms and optimize conversions",
      features: ["Form funnel", "Drop-off points", "Field analysis", "Completion rate"]
    },
    {
      icon: <Link2 className="h-8 w-8" />,
      title: "Link Click Counter",
      description: "Cookieless, aggregate click counts per link and button — no visitor ID attached",
      features: ["Counts per link and button", "Per page and device type", "No cookies or visitor IDs", "Starts after analytics consent"]
    }
  ];

  const cmpFeatures = [
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Privacy by Design",
      description: "Consent-first cookie handling, built for GDPR",
      features: ["Automatic categorization", "Consent records", "Data handling", "User rights"]
    },
    {
      icon: <Cookie className="h-8 w-8" />,
      title: "Cookie Management",
      description: "Professional cookie management with user-friendly consent banner",
      features: ["Automatic cookie detection", "Categorization", "Consent tracking", "Banner customization"]
    },
    {
      icon: <Eye className="h-8 w-8" />,
      title: "Transparency & Control",
      description: "Give users full control over their data and cookie preferences",
      features: ["Cookie settings", "Data portability", "Deletion requests", "Activity log"]
    },
    {
      icon: <Lock className="h-8 w-8" />,
      title: "Data Security",
      description: "Secure handling and storage of all user data according to EU regulations",
      features: ["Encryption", "Anonymization", "Secure storage", "Data retention"]
    }
  ];

  const integrationFeatures = [
    {
      icon: <Globe className="h-8 w-8" />,
      title: "Google Analytics 4",
      description: "Keep the GA4 reporting you know — GA4 fires only after analytics consent (Consent Mode v2, basic mode) — and add cookieless and AI-agent analytics on top",
      features: ["GA4 data import", "Two-way conversion sync", "Traffic sources & segments", "Search-term data"]
    },
    {
      icon: <Search className="h-8 w-8" />,
      title: "Google Search Console",
      description: "Pull search visibility into CortIQ — including a dedicated AI-search view of how your content performs for AI-driven queries",
      features: ["Impressions, clicks & position", "Query-level data", "AI-search performance"]
    },
    {
      icon: <Target className="h-8 w-8" />,
      title: "Google Ads — Enhanced Conversions",
      description: "Send CRM-qualified lead quality back to Google Ads to sharpen Smart Bidding — emails hashed, consent-gated",
      features: ["Conversion Adjustments API", "SHA-256 hashed email", "Consent-gated upload", "Lead-quality scoring"]
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "HubSpot CRM",
      description: "Connect HubSpot so lead quality flows into your attribution — closing the ad-spend-to-revenue loop",
      features: ["Lead-quality webhook (HMAC)", "Attribution-gap dashboard", "Enhanced Conversions feed", "Form GUID detection"]
    },
    {
      icon: <Layers className="h-8 w-8" />,
      title: "Tag Manager & Consent Mode v2",
      description: "Deploy via Google Tag Manager and propagate consent to Google tags — reads Cookiebot consent directly",
      features: ["GTM compatibility", "Consent Mode v2", "Cookiebot consent", "Custom triggers"]
    },
    {
      icon: <Settings className="h-8 w-8" />,
      title: "WordPress Plugin",
      description: "WordPress plugin — paste your Site ID and Tracking ID",
      features: ["Paste Site ID and Tracking ID", "Cookieless or Full mode", "Theme compatibility", "Built-in consent banner"]
    }
  ];

  const deviceFeatures = [
    {
      icon: <Smartphone className="h-8 w-8" />,
      title: "Mobile Optimized",
      description: "Full tracking and analysis for all device types",
      features: ["Touch tracking", "Responsive design", "Mobile-specific metrics", "App-like UX"]
    },
    {
      icon: <Monitor className="h-8 w-8" />,
      title: "Device & Visitor Profiles",
      description: "Device, browser and OS breakdowns, plus returning-visitor profiles with consent (Full mode)",
      features: ["Device type, browser & OS", "Returning-visitor recognition", "Per-site salted identifiers"]
    },
    {
      icon: <Navigation className="h-8 w-8" />,
      title: "Navigation Analytics",
      description: "Analyze how users navigate through your website",
      features: ["Menu click analysis", "Navigation flows", "Exit points", "Path optimization"]
    },
    {
      icon: <Target className="h-8 w-8" />,
      title: "Segmentation",
      description: "Advanced segmentation for deeper user insights",
      features: ["Behavior segments", "Traffic sources", "Device segments", "Conversion groups"]
    }
  ];

  const advancedFeatures = [
    {
      icon: <AlertTriangle className="h-8 w-8" />,
      title: "Behavioral Alert Tracking",
      description: "Automatic detection of abnormal user behavior with smart alerts",
      features: ["Rage clicks detection", "Bounce rate spikes", "Form abandonment alerts", "Session anomalies"]
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      title: "KPI Dashboard",
      description: "Customizable KPI dashboards to track your most important metrics",
      features: ["Custom KPIs", "Real-time data", "Trend analysis", "Goal tracking"]
    },
    {
      icon: <Upload className="h-8 w-8" />,
      title: "Server-Side Bot Ingestion",
      description: "Ingest Cloudflare logs to catch training and citation crawlers that never execute JavaScript",
      features: ["Cloudflare log ingest", "Same bot registry as the JS tag", "Training & citation crawlers", "No tracking script required"]
    },
    {
      icon: <Layers className="h-8 w-8" />,
      title: "MCP Analytics Server",
      description: "Let external AI agents query your analytics through a Model Context Protocol server",
      features: ["23 analytics tools", "Scoped, rate-limited API key", "Tenant-scoped reads", "AI-agent and human traffic"]
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Cookieless Mode",
      description: "Privacy-minimised analytics without cookies — starts after analytics consent",
      features: ["No cookies or persistent IDs", "No device fingerprinting", "No cross-visit profile", "Consent-gated"]
    },
    {
      icon: <Settings className="h-8 w-8" />,
      title: "AI-Powered Insights",
      description: "Get automatic recommendations and insights from AI",
      features: ["Automatic analysis", "Performance recommendations", "Trend predictions", "Actionable insights"]
    },
    {
      icon: <FileText className="h-8 w-8" />,
      title: "Traffic Sources & UTM",
      description: "Detailed analysis of all traffic streams and campaign performance",
      features: ["UTM tracking", "Referral analysis", "Campaign attribution", "Channel performance"]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <PublicNavigation />
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="text-sm font-medium mb-4">
            <Zap className="h-4 w-4 mr-2" />
            AI Bot Intelligence · Cookieless · EU-Built
          </Badge>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            The analytics platform that turns AI traffic into signal
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            CortIQ classifies every AI visit — training crawler, agentic browser, or citation
            crawler — and pairs it with consent-first, cookieless human analytics and a paid-conversion
            attribution loop. Built in the EU, GDPR-first.
          </p>
        </div>

        {/* AI Bot Intelligence — the differentiator */}
        <section className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">🤖 AI Bot Intelligence</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              By Q4 2025 there was one AI bot visit for every 31 human visits (TollBit, State of the Bots,
              Q4 2025). CortIQ tells you which ones matter — and which are just cost.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border-red-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">🔴 Training Crawlers</CardTitle>
                <CardDescription>GPTBot, ClaudeBot, Google-Extended, CCBot</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Pure infrastructure cost — they consume your content to train models, with no
                referral value. Know how much they cost you.
              </CardContent>
            </Card>
            <Card className="border-green-500/40">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">🟢 Agentic Browsers</CardTitle>
                <CardDescription>ChatGPT-User, Claude-User, Perplexity-User + JS-signal heuristics</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Real users acting through an AI. Agent fetches are detected by user agent; in-browser
                AI agents by JS-signal heuristics. Track and convert them like any high-intent visitor.
              </CardContent>
            </Card>
            <Card className="border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">🔵 Citation Crawlers</CardTitle>
                <CardDescription>PerplexityBot, OAI-SearchBot, Claude-SearchBot</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                AI search indexing your content — your visibility signal for the era of answer
                engines. Know when LLMs cite you.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Architecture: three layers */}
        <section className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">🧱 Three clean layers</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              A deliberate separation: the data layer never depends on AI, and AI never sees
              another tenant's data or writes raw analytics.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Data Layer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Validated, rate-limited ingest → PostgreSQL with Row-Level Security per tenant.
                Unified visitor profiles, sessions, heatmaps, conversions. Runs with zero AI
                dependency.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Agentic Layer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                AI assistant with grounded tool-use over your data, an MCP server so external
                agents can query analytics, bot classification, and GEO audits — each insight
                traceable to its source.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> Privacy Layer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Cross-cutting, EU-first: cookieless mode, consent gating for all visitor analytics, IP anonymisation,
                a server-side consent ledger, retention automation and EU data residency.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Core Analytics Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">📊 Core Analytics Features</h2>
            <p className="text-lg text-muted-foreground">
              Advanced analytics tools to understand your users
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {coreFeatures.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary">
                      {feature.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CMP Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">🛡️ Cookie Management Platform (CMP)</h2>
            <p className="text-lg text-muted-foreground">
              Consent management built for GDPR
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {cmpFeatures.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary">
                      {feature.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Integration Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">🔗 Integrations & Compatibility</h2>
            <p className="text-lg text-muted-foreground">
              Works with your existing tools and platforms
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {integrationFeatures.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary">
                      {feature.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Google Consent Mode v2 */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">🔐 Google Consent Mode v2 (GCM v2)</h2>
            <p className="text-lg text-muted-foreground">
              Advanced integration with Google's consent framework for optimal balance between marketing and privacy
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-orange-500">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="text-orange-600">
                    <Shield className="h-8 w-8" />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-2">Basic Mode by Default</CardTitle>
                    <CardDescription className="text-base">
                      Google tags load only after the visitor grants analytics consent
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <span className="text-sm">GA4 fires only after analytics consent</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <span className="text-sm">No cookieless pings before consent (basic mode, the default)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <span className="text-sm">Full control over activation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <span className="text-sm">Compatible with WordPress and external integration</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="text-blue-600">
                    <TrendingUp className="h-8 w-8" />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-2">Marketing Benefits</CardTitle>
                    <CardDescription className="text-base">
                      Maximize Google Ads performance and conversion tracking with consent-based data
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm">Improved Google Ads optimization</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm">Better conversion tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm">Remarketing with consent-based data</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm">Smart Bidding improvements</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
          
          <div className="bg-gradient-to-r from-orange-50 to-blue-50 dark:from-orange-950/20 dark:to-blue-950/20 p-6 rounded-lg border border-orange-200 dark:border-orange-900">
            <div className="flex items-start gap-4">
              <div className="text-orange-600 mt-1">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2 text-orange-800 dark:text-orange-200">Important Information About GCM v2</h3>
                <div className="text-sm text-orange-700 dark:text-orange-300 space-y-2">
                  <p>
                    <strong>Legal Warning:</strong> GCM v2 advanced mode sends cookieless "pings" to Google even when users deny consent.
                    CortIQ defaults to basic mode, where Google tags do not load until analytics consent is granted. Advanced mode is an explicit opt-in setting.
                  </p>
                  <p>
                    <strong>Our Recommendation:</strong> Consult your legal department before changing Consent Mode settings.
                    CortIQ analytics work fully without GA4 or GCM v2.
                  </p>
                  <p>
                    <strong>Transparency:</strong> We always clearly inform about what happens when GCM v2 is activated, 
                    so you can make an informed decision.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tracking Modes */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">🍪 Cookieless or Full Mode</h2>
            <p className="text-lg text-muted-foreground">
              Two tracking modes for visitor analytics. Both start only after the visitor grants analytics consent.
            </p>
          </div>
          <div className="grid lg:grid-cols-3 gap-8 mb-12">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="text-primary">
                    <Lock className="h-8 w-8" />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-2">Cookieless Mode</CardTitle>
                    <CardDescription className="text-base">
                      Privacy-minimised visitor analytics — not consent-free
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">No cookies</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">No device fingerprint</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">No cross-visit profile</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">No persistent IDs</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="text-primary">
                    <Database className="h-8 w-8" />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-2">Full Mode</CardTitle>
                    <CardDescription className="text-base">
                      First-party cookies for returning-visitor and journey analysis
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">First-party cookies only</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Returning visitors & journeys</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Starts after analytics consent</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow border-primary/20">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="text-primary">
                    <Zap className="h-8 w-8" />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-2">AI-Agent & Bot Layer</CardTitle>
                    <CardDescription className="text-base">
                      Runs before consent — designed as strictly necessary security processing
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">AI bot & agent detection</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Training / agentic / citation classification</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Bot probe, honeypot & canary</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Server-side classification from edge logs</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="bg-muted/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              What Runs When
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Before Consent</h4>
                <p className="text-sm text-muted-foreground">
                  Only the AI-bot, agent and security layer runs. It is designed to run as strictly necessary
                  security processing; the site operator makes the final legal assessment. No visitor analytics are collected.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">After Analytics Consent</h4>
                <p className="text-sm text-muted-foreground">
                  Page views, sessions, clicks, scroll, heatmaps, link click counts, forms, e-commerce and conversions
                  start in the mode you chose. Consent is valid for 12 months, then re-asked.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">⚡ Advanced Features</h2>
            <p className="text-lg text-muted-foreground">
              Powerful tools for professional web analytics
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {deviceFeatures.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary">
                      {feature.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Professional Analytics Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">🎯 Professional Analytics Features</h2>
            <p className="text-lg text-muted-foreground">
              Advanced tools for data-driven optimization
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {advancedFeatures.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary">
                      {feature.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Conversion & Attribution */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">🔗 Conversion & Attribution</h2>
            <p className="text-lg text-muted-foreground">
              Close the loop between ad spend, form submissions, and CRM pipeline quality
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {[
              {
                icon: <AlertTriangle className="h-8 w-8" />,
                title: "Goal Health Monitor",
                description: "Automatically flags misconfigured conversion goals before they corrupt Smart Bidding. No more YouTube Views set as Primary alongside demo requests.",
                features: [
                  "Fires-too-often alert (>30% of sessions = not a commercial signal)",
                  "Silent goal detection — zero conversions in 7 days",
                  "Duplicate Primary goal warning",
                  "Primary / Observation toggle per goal",
                ],
              },
              {
                icon: <Search className="h-8 w-8" />,
                title: "Form Auto-Discovery",
                description: "CortIQ scans your pages and identifies every form by provider GUID — HubSpot, Gravity Forms, Contact Form 7, and custom HTML forms.",
                features: [
                  "HubSpot form GUID detection (hs_context + data-form-id)",
                  "Gravity Forms and Contact Form 7 auto-detection",
                  "\"X forms found, Y unidentified\" dashboard view",
                  "Label forms to track them as goals",
                ],
              },
              {
                icon: <Link2 className="h-8 w-8" />,
                title: "First-Party Click ID Capture",
                description: "Capture gclid, fbclid, msclkid and more from ad click URLs and store them server-side — so CortIQ owns the attribution data, not the ad platform.",
                features: [
                  "Google Ads (gclid), Meta (fbclid), Microsoft (msclkid), TikTok (ttclid), LinkedIn (li_fat_id)",
                  "Only captured with explicit marketing consent",
                  "Persisted per session and stored with the visitor profile",
                  "Foundation for Enhanced Conversions upload",
                ],
              },
              {
                icon: <Upload className="h-8 w-8" />,
                title: "HubSpot → Google Ads Quality Loop",
                description: "When your SDR classifies a lead in HubSpot, CortIQ automatically uploads the quality signal to Google Ads as a conversion value — so Smart Bidding learns to find Priority leads, not just any form submissions.",
                features: [
                  "HubSpot webhook with HMAC signature validation",
                  "SHA-256 email hashing — raw email never stored in CortIQ",
                  "Conversion values: Priority = 300, Qualified = 100, Challenge = 0",
                  "Daily batch upload to Google Ads Conversion Adjustments API",
                  "GDPR-gated: only uploads sessions with marketing consent",
                ],
              },
              {
                icon: <ArrowUpDown className="h-8 w-8" />,
                title: "Attribution Gap Dashboard",
                description: "See the gap between CortIQ conversions and HubSpot quality leads, plus Enhanced Conversions upload status — in a single view.",
                features: [
                  "CortIQ conversions vs. HubSpot MQLs comparison",
                  "Gap % with actionable diagnosis",
                  "Enhanced Conversions upload status (pending / uploaded / skipped)",
                  "30-day rolling window, no PII in the view",
                ],
              },
            ].map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary">{feature.icon}</div>
                    <div>
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base">{feature.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <div className="text-center bg-primary/5 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-4">
            Ready to Discover the Power of Professional Web Analytics?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            CortIQ is free during beta. Create an account and get access to all features.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button asChild size="lg">
              <Link to="/auth">Create free account</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/cmp">Learn More About CMP</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
