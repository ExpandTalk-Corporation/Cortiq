import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import PublicNavigation from "@/components/PublicNavigation";
import heroImage from "@/assets/analytics-dashboard-hero.jpg";
import analyticsIllustration from "@/assets/analytics-illustration.jpg";
import {
  Shield,
  BarChart3,
  MousePointer,
  Globe,
  Cookie,
  Users,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Bot,
  Sparkles,
  Zap,
  Brain,
  Code,
  AlertTriangle,
  Lock,
  Mail
} from "lucide-react";

const Index = () => {
  useSEO({
    title: 'CortIQ — AI Agent Analytics & Cookie-Free Tracking',
    description: 'Analytics for the Agentic Web: classify AI training crawlers, agent fetches and citation crawlers. Consent-first, cookieless visitor analytics, heatmaps, form analytics. EU-hosted. Free during beta.',
    canonical: 'https://cortiq.se/',
  });

  const features = [
    {
      icon: Bot,
      title: "AI Agent Analytics",
      description: "Detect agent fetches via ChatGPT-User, Claude-User and Perplexity-User, plus JS-signal heuristics for in-browser AI agents."
    },
    {
      icon: BarChart3,
      title: "Advanced KPI Dashboards",
      description: "Real-time analytics with customizable KPIs, traffic analysis, and conversion data from multiple sources including AI traffic."
    },
    {
      icon: MousePointer,
      title: "Visual Analytics (Heatmaps)",
      description: "Click heatmaps and scroll-depth tracking on every page, after analytics consent. Desktop, tablet and mobile views."
    },
    {
      icon: TrendingUp,
      title: "Conversion & Attribution",
      description: "First-party click-ID capture (marketing consent only), conversion goal health monitor, form auto-discovery and a HubSpot lead-quality loop to Google Ads Enhanced Conversions."
    },
    {
      icon: Cookie,
      title: "Built-in Consent Banner",
      description: "Consent banner with Google Consent Mode v2. Choose Cookieless mode (no cookies, no fingerprint) or Full mode with first-party cookies — both start only after analytics consent."
    },
    {
      icon: Globe,
      title: "Universal Tracking Script",
      description: "One script works on any CMS or custom site. WordPress plugin with built-in consent banner."
    }
  ];

  const benefits = [
    "AI traffic classified as training, agentic or citation",
    "Agent fetches via ChatGPT-User, Claude-User and Perplexity-User",
    "Server-side bot ingestion from Cloudflare logs — catches crawlers that never run JavaScript",
    "Built-in consent banner with Google Consent Mode v2",
    "Cookieless mode: no cookies, no fingerprinting, no cross-visit profile",
    "Universal tracking script for any CMS or custom site",
    "MCP server so AI agents can query your analytics (23 tools)",
    "Free during beta — create an account and start"
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <PublicNavigation />
      
      {/* Proof of Concept Badges */}
      <section className="container mx-auto px-4 pt-8 pb-4">
        <div className="flex flex-wrap justify-center gap-4">
          <Badge variant="outline" className="px-6 py-3 text-base border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
            <Brain className="h-5 w-5 mr-2 text-primary" />
            <span className="font-semibold">AI First</span>
          </Badge>
          <Badge variant="outline" className="px-6 py-3 text-base border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
            <Shield className="h-5 w-5 mr-2 text-primary" />
            <span className="font-semibold">EU First (GDPR)</span>
          </Badge>
          <Badge variant="outline" className="px-6 py-3 text-base border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
            <Code className="h-5 w-5 mr-2 text-primary" />
            <span className="font-semibold">API First</span>
          </Badge>
        </div>
      </section>

      {/* Hero Section */}
      <section className="relative py-32 px-4 overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-hero">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent)] animate-pulse"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.1),transparent)] animate-pulse delay-1000"></div>
        </div>
        
        {/* Floating decorative elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-primary/10 rounded-full animate-float"></div>
        <div className="absolute top-40 right-20 w-16 h-16 bg-accent/10 rounded-full animate-float delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-primary/5 rounded-full animate-float delay-2000"></div>
        
        <div className="container mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-center lg:text-left">
              <Badge className="mb-8 animate-fade-in bg-gradient-primary hover-scale hover-glow text-white border-0">
                🤖 AI Bot Intelligence · Free during beta
              </Badge>
              <h1 className="text-4xl md:text-6xl font-black mb-4 animate-slide-up text-gradient-primary leading-tight">
                One AI bot visit for every 31 human visits. Do you know which ones matter?
              </h1>
              <p className="text-sm text-muted-foreground mb-8 animate-fade-in">
                Source: TollBit, State of the Bots, Q4 2025 (up from 1 in 200 in Q1 2025).
              </p>
              <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto lg:mx-0 animate-fade-in leading-relaxed">
                Not all AI traffic is equal. CortIQ classifies every AI visit — training crawlers, agentic browsers, and citation bots — so you know what to optimize, what to ignore, and what's costing you infrastructure budget.
                Plus consent-first, cookieless visitor analytics, heatmaps and form analytics — EU-hosted and built for GDPR.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center lg:justify-start items-center animate-scale-in">
                <Link to="/auth">
                  <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                    Create free account
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                  </Button>
                </Link>
                <Link to="/features">
                  <Button variant="outline" size="lg" className="group glass hover-lift text-lg px-8 py-4 h-auto">
                    <BarChart3 className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform" />
                    See All Features
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="relative animate-scale-in">
              <div className="relative aspect-video rounded-3xl overflow-hidden shadow-elegant hover-glow group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20"></div>
                <img 
                  src={heroImage}
                  alt="Analytics Dashboard - Heatmap and user analysis"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"></div>
                
                {/* Floating stats indicators */}
                <div className="absolute top-4 right-4 glass px-3 py-2 rounded-lg animate-float">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium">Live Analytics</span>
                  </div>
                </div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-gradient-primary rounded-full opacity-20 animate-pulse"></div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-gradient-accent rounded-full opacity-15 animate-pulse delay-1000"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Server-Side Analytics Section */}
      <section className="py-32 px-4 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--accent)) 1px, transparent 0)',
            backgroundSize: '32px 32px'
          }}></div>
        </div>

        <div className="container mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="animate-fade-in">
              <Badge className="mb-6 bg-gradient-primary text-white hover-scale">
                <Shield className="h-4 w-4 mr-2 inline" />
                Consent-first by design
              </Badge>
              <h2 className="text-4xl md:text-5xl font-black mb-8 text-gradient-primary">
                AI-agent intelligence without consent friction
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                AI-bot and agent detection is designed to run as strictly necessary security processing — the site operator makes the final legal assessment.
                All visitor analytics — page views, sessions, clicks, heatmaps, conversions — start only after the visitor grants analytics consent. Consent is valid for 12 months.
              </p>

              <div className="space-y-6 mb-12">
                <Card className="border-primary/20 bg-background/50 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center flex-shrink-0">
                        <Shield className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-2">AI-Agent &amp; Bot Layer</h3>
                        <p className="text-muted-foreground">
                          AI bot and agent detection, crawler classification (training / agentic / citation), honeypots and server-side bot classification from edge logs. Designed to run as strictly necessary security processing, based on ePrivacy guidance — the site operator makes the final legal assessment.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-accent/20 bg-background/50 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-accent rounded-xl flex items-center justify-center flex-shrink-0">
                        <Zap className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-2">Cookieless or Full Mode</h3>
                        <p className="text-muted-foreground">
                          Cookieless mode: no cookies, no device fingerprint, no cross-visit profile. Full mode adds first-party cookies. Both start only after analytics consent.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-primary/20 bg-background/50 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-2">Privacy-First Solution</h3>
                        <p className="text-muted-foreground">
                          Privacy by design: EU hosting, no persistent IDs in Cookieless mode, built-in consent banner. Built for GDPR.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Link to="/auth">
                <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                  <Shield className="mr-2 h-5 w-5" />
                  Try consent-first analytics
                  <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                </Button>
              </Link>
            </div>

            <div className="relative animate-scale-in">
              <Card className="border-2 border-primary/20 shadow-elegant hover-lift bg-gradient-card">
                <CardHeader className="text-center pb-6">
                  <Badge className="mb-4 bg-gradient-accent text-white mx-auto">
                    Comparison
                  </Badge>
                  <CardTitle className="text-2xl">Traditional analytics vs CortIQ</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">Cookies</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="destructive">Required</Badge>
                        <Badge className="bg-primary text-primary-foreground">Optional (Cookieless mode) ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">Device fingerprinting</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Common</Badge>
                        <Badge className="bg-primary text-primary-foreground">None ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">Cross-visit profiling</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Yes</Badge>
                        <Badge className="bg-primary text-primary-foreground">No (Cookieless mode) ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">AI-agent visibility</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="destructive">None</Badge>
                        <Badge className="bg-primary text-primary-foreground">Classified ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">Hosting</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Often US</Badge>
                        <Badge className="bg-primary text-primary-foreground">EU ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Consent handling</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Separate CMP</Badge>
                        <Badge className="bg-primary text-primary-foreground">Built-in banner ✓</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t">
                    <div className="bg-gradient-primary/10 rounded-xl p-4 text-center">
                      <p className="font-bold text-lg mb-2">What needs consent?</p>
                      <p className="text-sm text-muted-foreground">
                        All visitor analytics — sessions, heatmaps, forms, conversions — start only after analytics consent, in both Cookieless and Full mode. Only the AI-bot and security layer runs before consent.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Decorative elements */}
              <div className="absolute -top-6 -right-6 w-20 h-20 bg-primary/10 rounded-full animate-pulse"></div>
              <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-accent/10 rounded-full animate-pulse delay-1000"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Bot Detection Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-background to-primary/5"></div>
        
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-16 animate-fade-in">
            <Badge className="mb-6 bg-gradient-accent text-white">
              <AlertTriangle className="h-4 w-4 mr-2 inline" />
              Security & Compliance
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
              Bot security as strictly necessary processing
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Under ePrivacy Art. 5.3, security measures can qualify as "strictly necessary" - DDoS protection, spy bots, and scrapers, subject to your own legal assessment.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            {/* DDoS & Attack Prevention */}
            <Card className="glass shadow-elegant hover-lift border-primary/20">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">DDoS Protection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Identify malicious bots attempting to overload your website.
                  Can qualify as strictly necessary under ePrivacy Art. 5.3.
                </p>
              </CardContent>
            </Card>

            {/* Spy Bots & Scrapers */}
            <Card className="glass shadow-elegant hover-lift border-accent/20">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-accent rounded-xl flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">Spy Bots</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Detect competitor scrapers and spy tools attempting to steal your content or pricing. 
                  Designed to rely on legitimate interest under GDPR Art. 6.1.f — subject to your own assessment.
                </p>
              </CardContent>
            </Card>

            {/* Fraud Prevention */}
            <Card className="glass shadow-elegant hover-lift border-primary/20">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">Click-Fraud Detection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Detect click fraud on paid ad traffic — confirmed bots, headless browsers and zero-engagement sessions. 
                  Designed to run as strictly necessary security processing; the site operator makes the final legal assessment.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Legal Framework */}
          <Card className="glass shadow-elegant border-2 border-primary/20 max-w-4xl mx-auto">
            <CardHeader className="text-center">
              <Badge className="mb-4 bg-gradient-primary text-white mx-auto">
                Legal Framework
              </Badge>
              <CardTitle className="text-2xl">The legal basis for security measurement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-bold flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    ePrivacy Art. 5.3
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    The EU ePrivacy Directive provides a consent exemption for processing that is "strictly necessary".
                    Bot detection, DDoS protection, and fraud prevention may qualify, subject to your own assessment.
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="font-bold flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    GDPR Art. 6.1.f
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Legitimate interest can support protecting your website and users from threats and fraud,
                    provided processing is proportionate and minimal. The site operator makes the final assessment.
                  </p>
                </div>
              </div>

              <div className="bg-primary/5 p-6 rounded-lg">
                <h4 className="font-bold mb-3 flex items-center">
                  <Bot className="h-5 w-5 text-primary mr-2" />
                  What we measure for security (before consent)
                </h4>
                <ul className="grid md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <li className="flex items-start">
                    <span className="mr-2">✓</span>
                    Bot signature (User-Agent patterns)
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">✓</span>
                    Request frequency (rate limiting)
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">✓</span>
                    Suspicious behavior patterns
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">✓</span>
                    IP reputation for threat sources
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">✓</span>
                    Automated scraping
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">✓</span>
                    Click-fraud and fake traffic
                  </li>
                </ul>
              </div>

              <div className="bg-accent/5 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Important:</strong> All security data is stored anonymously and aggregated. 
                  Used ONLY for security and fraud prevention - never for marketing or user tracking.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* AI Agent Intelligence Section */}
      <section className="py-32 px-4 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--primary)) 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>

        <div className="container mx-auto relative z-10">
          <div className="text-center mb-16 animate-fade-in">
            <Badge className="mb-6 bg-gradient-primary text-white">
              <Bot className="h-4 w-4 mr-2 inline" />
              AI Bot Intelligence
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
              Not all AI traffic is equal
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              A GPTBot crawling for training data is not the same as ChatGPT fetching your page for a real user. CortIQ classifies the difference.
            </p>
          </div>

          {/* Three bot categories */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <Badge className="text-xs bg-red-500/20 text-red-400 border-0">Infrastructure cost</Badge>
                </div>
                <p className="font-semibold text-red-400">Training Crawlers</p>
                <p className="text-sm text-muted-foreground">GPTBot, ClaudeBot, Google-Extended, Meta-ExternalAgent — crawl for model training, zero referral value.</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <Zap className="h-5 w-5 text-green-400" />
                  <Badge className="text-xs bg-green-500/20 text-green-400 border-0">Real user intent</Badge>
                </div>
                <p className="font-semibold text-green-400">Agentic Browsers</p>
                <p className="text-sm text-muted-foreground">Agent fetches via ChatGPT-User, Claude-User and Perplexity-User, plus JS-signal heuristics for in-browser AI agents — act on behalf of real users.</p>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <Globe className="h-5 w-5 text-blue-400" />
                  <Badge className="text-xs bg-blue-500/20 text-blue-400 border-0">Visibility signal</Badge>
                </div>
                <p className="font-semibold text-blue-400">Citation Crawlers</p>
                <p className="text-sm text-muted-foreground">PerplexityBot, OAI-SearchBot, Claude-SearchBot — index your content for AI search results.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-16">
            <Card className="glass shadow-elegant hover-lift border-primary/20 text-center">
              <CardContent className="pt-8 pb-6">
                <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">ChatGPT</h3>
                <p className="text-sm text-muted-foreground">
                  ChatGPT-User fetches for real users, OAI-SearchBot indexing and GPTBot training crawls
                </p>
              </CardContent>
            </Card>

            <Card className="glass shadow-elegant hover-lift border-accent/20 text-center">
              <CardContent className="pt-8 pb-6">
                <div className="w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">Perplexity</h3>
                <p className="text-sm text-muted-foreground">
                  Perplexity-User fetches and PerplexityBot citation crawling
                </p>
              </CardContent>
            </Card>

            <Card className="glass shadow-elegant hover-lift border-primary/20 text-center">
              <CardContent className="pt-8 pb-6">
                <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">Claude</h3>
                <p className="text-sm text-muted-foreground">
                  Claude-User fetches, Claude-SearchBot indexing and ClaudeBot training crawls
                </p>
              </CardContent>
            </Card>

            <Card className="glass shadow-elegant hover-lift border-accent/20 text-center">
              <CardContent className="pt-8 pb-6">
                <div className="w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">Custom Agents</h3>
                <p className="text-sm text-muted-foreground">
                  Register and measure your own AI agents and bots
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="glass shadow-elegant border-2 border-primary/20 max-w-4xl mx-auto">
            <CardHeader className="text-center">
              <Badge className="mb-4 bg-gradient-accent text-white mx-auto">
                Agent Registry
              </Badge>
              <CardTitle className="text-2xl">What You Can Measure with CortIQ Agent Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold">Agent Journey Tracking</h4>
                      <p className="text-sm text-muted-foreground">Track the complete journey from landing to conversion for each AI agent</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold">Citation Analysis</h4>
                      <p className="text-sm text-muted-foreground">See when and how AI agents cite your content</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold">Browser Type Detection</h4>
                      <p className="text-sm text-muted-foreground">Distinguish between visual, headless and text-based agents</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold">Conversion Goals</h4>
                      <p className="text-sm text-muted-foreground">Measure if AI agents lead to actual business results</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold">Custom Agent Registry</h4>
                      <p className="text-sm text-muted-foreground">Register your own AI agents and custom bots</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold">Security Analysis</h4>
                      <p className="text-sm text-muted-foreground">Identify potentially harmful bots vs legitimate AI agents</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 p-6 rounded-lg text-center">
                <p className="text-muted-foreground mb-4">
                  <strong className="text-foreground">Why is this important?</strong> AI bots made up 4.2% of HTML requests in 2025, and training accounted for about 80% of AI crawling (Cloudflare Radar 2025 Year in Review).
                  Without dedicated measurement, you're missing critical data about how AI interacts with your content.
                </p>
                <Link to="/auth">
                  <Button className="bg-gradient-primary hover-scale hover-glow">
                    <Bot className="mr-2 h-4 w-4" />
                    Start Measuring AI Agents
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Google Analytics Alternative Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-background to-primary/5"></div>
        
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-16 animate-fade-in">
            <Badge className="mb-6 bg-gradient-accent text-white">
              <BarChart3 className="h-4 w-4 mr-2 inline" />
              Analytics Your Way
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
              CortIQ, GA4, or both
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Use CortIQ's consent-first analytics, GA4 under Consent Mode v2, or both — all behind the same built-in consent banner.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* CortIQ Cookieless Analytics */}
            <Card className="group border-2 border-primary/20 shadow-elegant hover-lift bg-gradient-card relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
              
              <CardHeader className="text-center pb-6 relative z-10">
                <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <Badge className="mb-4 bg-gradient-primary text-white mx-auto">
                  Recommended
                </Badge>
                <CardTitle className="text-2xl font-bold">Our Cookiefree Analytics</CardTitle>
                <CardDescription className="text-base mt-2">
                  Built for the agentic web from day one
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Track AI agents and crawlers (ChatGPT, Perplexity, Claude and more)</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Cookieless mode: no cookies, no fingerprint, no persistent IDs</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Visitor analytics start only after consent (valid 12 months)</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">EU-hosted, built for GDPR</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Built-in heatmaps and form analytics</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">WordPress plugin with built-in consent banner</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">No data sampling or limits</span>
                </div>
              </CardContent>
              
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-primary opacity-10 rounded-tr-full"></div>
            </Card>

            {/* GA4 with Consent Mode v2 */}
            <Card className="group border-2 border-accent/20 shadow-elegant hover-lift bg-gradient-card relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-accent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
              
              <CardHeader className="text-center pb-6 relative z-10">
                <div className="mx-auto w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Globe className="h-8 w-8 text-white" />
                </div>
                <Badge className="mb-4 bg-gradient-accent text-white mx-auto">
                  Also Available
                </Badge>
                <CardTitle className="text-2xl font-bold">GA4 with Consent Mode v2</CardTitle>
                <CardDescription className="text-base mt-2">
                  Keep Google Analytics, consent-gated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Keep your existing GA4 setup</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Google Consent Mode v2 (basic mode)</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">GA4 fires only after analytics consent</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Same GA4 reports you're used to</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Same consent banner as CortIQ analytics</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Connect your GA4 property in minutes</span>
                </div>
                <div className="space-y-2 pt-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                    Note: No AI agent tracking with GA4
                  </div>
                </div>
              </CardContent>
              
              <div className="absolute bottom-0 right-0 w-24 h-24 bg-gradient-accent opacity-10 rounded-tl-full"></div>
            </Card>
          </div>

          <div className="mt-16 text-center">
            <Card className="max-w-3xl mx-auto border-2 border-primary/20 bg-gradient-card shadow-elegant">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-4 text-gradient-primary">Use both together</h3>
                <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                  Run both behind the same consent banner: CortIQ for AI-traffic and consent-first visitor analytics,
                  GA4 for familiar reporting.
                </p>
                <Link to="/auth">
                  <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                    Create free account
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Server-Side Conversion Signals Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/20 via-background to-primary/5"></div>

        <div className="container mx-auto relative z-10">
          <div className="text-center mb-16 animate-fade-in">
            <Badge className="mb-6 bg-gradient-primary text-white">
              <Zap className="h-4 w-4 mr-2 inline" />
              Server-Side Conversion Signals
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
              Feed ad platforms without third-party cookies
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Send conversion signals server-side to Google Ads, Meta and GA4 — only for visitors who gave the matching consent.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            <Card className="border-2 border-primary/20 shadow-elegant hover-lift bg-gradient-card">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Globe className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">Google Ads Enhanced Conversions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">HubSpot lead quality uploaded via the Conversion Adjustments API</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Matched on gclid and SHA-256 hashed email</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Daily batch upload</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Only sessions with marketing consent</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-accent/20 shadow-elegant hover-lift bg-gradient-card">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mb-6 hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">Meta Conversions API</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Server-side events to your Meta pixel ID</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">No browser pixel required on the site</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Sent only with marketing consent</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary/20 shadow-elegant hover-lift bg-gradient-card">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 hover:scale-110 transition-transform duration-300 shadow-lg">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">GA4 Measurement Protocol</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Server-side events to your GA4 property</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Sent only with analytics consent</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Same consent banner as CortIQ analytics</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="max-w-4xl mx-auto border-2 border-primary/20 bg-gradient-card shadow-elegant">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4 text-gradient-primary">Why server-side</h3>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    No third-party ad cookies
                  </h4>
                  <p className="text-muted-foreground">
                    Signals are sent from the server, not from ad pixels in the visitor's browser — and only with consent.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Better Attribution
                  </h4>
                  <p className="text-muted-foreground">
                    Server-side conversion APIs aren't affected by ad blockers, so consented conversions are reported more reliably than with browser pixels.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Hashed, not raw
                  </h4>
                  <p className="text-muted-foreground">
                    Emails are SHA-256 hashed and only the hash is stored and uploaded to Google Ads.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Quality, not volume
                  </h4>
                  <p className="text-muted-foreground">
                    CRM-qualified lead quality teaches Smart Bidding which leads matter, not just which forms were submitted.
                  </p>
                </div>
              </div>
              <div className="text-center">
                <Link to="/auth">
                  <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                    <Zap className="mr-2 h-5 w-5" />
                    Create free account
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      {/* Features Section */}

      <section className="py-32 px-4 relative">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--primary)) 1px, transparent 0)',
            backgroundSize: '24px 24px'
          }}></div>
        </div>
        
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-20 animate-fade-in">
            <Badge className="mb-6 bg-gradient-accent text-white">
              Agentic Web Ready • AI-Native Analytics
            </Badge>
            <h2 className="text-4xl md:text-6xl font-black mb-6 text-gradient-primary">
              Analytics for the agentic web
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              When AI agents start browsing the web for users, you need to know what's happening —
              and which AI traffic is worth your attention.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="group bg-gradient-card border-0 shadow-elegant hover-lift hover-glow relative overflow-hidden">
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                
                <CardHeader className="text-center pb-6 relative z-10">
                  <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                    <feature.icon className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                  <CardDescription className="text-center leading-relaxed text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
                
                {/* Decorative corner gradient */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-primary opacity-10 rounded-bl-full"></div>
              </Card>
            ))}
          </div>
          
          {/* Agentic Web Card */}
          <div className="mt-16 max-w-4xl mx-auto">
            <Card className="group bg-gradient-to-br from-primary/5 via-background to-accent/5 border-2 border-primary/20 shadow-elegant hover-lift hover-glow relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
              
              <CardHeader className="text-center pb-6 relative z-10">
                <div className="mx-auto w-20 h-20 bg-gradient-primary rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Bot className="h-10 w-10 text-white" />
                </div>
                <Badge className="mb-4 bg-gradient-accent text-white">
                  <Sparkles className="h-4 w-4 mr-2 inline" />
                  Future-Proof Analytics
                </Badge>
                <CardTitle className="text-3xl font-bold group-hover:text-primary transition-colors mb-4">
                  Ready for the agentic web
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 text-center">
                <CardDescription className="leading-relaxed text-lg mb-6">
                  When ChatGPT, Claude and Perplexity fetch your pages for users, you want to know what's happening.
                  CortIQ detects agent fetches via ChatGPT-User, Claude-User and Perplexity-User, plus JS-signal
                  heuristics for in-browser AI agents — and attributes their conversions.
                </CardDescription>
                <div className="flex justify-center">
                  <Link to="/auth">
                    <Button className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-3 h-auto">
                      <Zap className="mr-2 h-5 w-5" />
                      Create free account
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
              
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-primary opacity-10 rounded-bl-full"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-accent opacity-10 rounded-tr-full"></div>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        {/* Dynamic background */}
        <div className="absolute inset-0 bg-gradient-to-br from-muted/20 via-background to-accent/5">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_48%,hsl(var(--primary)/0.03)_49%,hsl(var(--primary)/0.03)_51%,transparent_52%)]"></div>
        </div>
        
        <div className="container mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="animate-fade-in">
              <Badge className="mb-6 bg-gradient-accent text-white hover-scale">
                <Bot className="h-4 w-4 mr-2 inline" />
                Agent-Ready Analytics
              </Badge>
              <h2 className="text-4xl md:text-5xl font-black mb-8 text-gradient-primary">
                Built for the agentic web
              </h2>
              <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
                History shows that every major browser shift comes with a new promise. 
                Agentic browsers promise speed and automation - but only if they can trust your data. 
                CortIQ shows you which AI agents and crawlers visit, what they read, and which visits turn into business.
              </p>
              
              <div className="space-y-6 mb-12">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-4 group animate-slide-up" style={{animationDelay: `${index * 100}ms`}}>
                    <div className="flex-shrink-0 w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-foreground text-lg group-hover:text-primary transition-colors">{benefit}</span>
                  </div>
                ))}
              </div>

              <Link to="/auth">
                <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                  Create free account
                  <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                </Button>
              </Link>
            </div>
            
            <div className="relative animate-scale-in">
              <div className="relative aspect-square rounded-3xl overflow-hidden shadow-elegant hover-glow group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10"></div>
                <img 
                  src={analyticsIllustration}
                  alt="Analytics Illustration - Person analyzing data"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
              </div>
              
              {/* Enhanced floating stats cards */}
              <Card className="absolute -top-6 -left-6 glass shadow-elegant hover-lift animate-float">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-3xl font-black text-gradient-primary">12,847</div>
                      <div className="text-sm text-muted-foreground font-medium">Visitors this month</div>
                      <div className="text-xs text-muted-foreground/70 uppercase tracking-wide mt-1">Example data</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="absolute -bottom-6 -right-6 glass shadow-elegant hover-lift animate-float delay-1000">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-accent rounded-xl flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-3xl font-black text-gradient-accent">+23%</div>
                      <div className="text-sm text-muted-foreground font-medium">Conversion</div>
                      <div className="text-xs text-muted-foreground/70 uppercase tracking-wide mt-1">Example data</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Decorative elements */}
              <div className="absolute top-1/4 -right-8 w-16 h-16 bg-primary/10 rounded-full animate-pulse"></div>
              <div className="absolute bottom-1/4 -left-8 w-20 h-20 bg-accent/10 rounded-full animate-pulse delay-1000"></div>
            </div>
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-[gradient_8s_ease-in-out_infinite]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent)] animate-pulse"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.1),transparent)] animate-pulse delay-2000"></div>
        
        {/* Floating elements */}
        <div className="absolute top-10 left-10 w-24 h-24 bg-white/10 rounded-full animate-float"></div>
        <div className="absolute top-20 right-20 w-16 h-16 bg-white/10 rounded-full animate-float delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-20 h-20 bg-white/10 rounded-full animate-float delay-2000"></div>
        
        <div className="container mx-auto text-center text-white relative z-10">
          <div className="animate-fade-in">
            <h2 className="text-4xl md:text-6xl font-black mb-8">
              Build for tomorrow's web, today
            </h2>
            <p className="text-xl md:text-2xl mb-12 opacity-95 max-w-4xl mx-auto leading-relaxed">
              AI bot traffic grew 300% year over year (Akamai SOTI Digital Fraud &amp; Abuse Report 2025). By Q4 2025 there was one AI bot visit
              for every 31 human visits, up from one in 200 in Q1 2025 (TollBit, State of the Bots, Q4 2025).
              Know what kind of AI traffic you have.
            </p>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-8 justify-center items-center animate-scale-in">
            <Link to="/auth">
              <Button size="lg" variant="secondary" className="group glass hover-scale hover-glow text-lg px-10 py-5 h-auto font-bold">
                <Bot className="mr-3 h-6 w-6" />
                Create free account
                <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-2 transition-transform duration-300" />
              </Button>
            </Link>
            <Link to="/bot-intelligence">
              <Button size="lg" variant="outline" className="group glass hover-scale text-lg px-10 py-5 h-auto font-bold border-white/30 text-white hover:text-white">
                AI Bot Intelligence Report
                <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-2 transition-transform duration-300" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 px-4 bg-gradient-subtle">
        <div className="container mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <Badge className="mb-6 bg-gradient-primary text-white">
              📧 Contact Us
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
              Ready to get started?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              CortIQ is free during beta — create an account to start, or get in touch with Expandtalk Corporation AB with questions.
            </p>
          </div>

          <Card className="max-w-2xl mx-auto border-2 border-primary/20 shadow-elegant">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl text-gradient-primary">Contact Information</CardTitle>
              <CardDescription className="text-base">
                CortIQ is developed by Expandtalk Corporation AB
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-foreground">Daniel Larsson</p>
                  <p className="text-muted-foreground">Expandtalk Corporation AB</p>
                </div>

                <div className="pt-6">
                  <a
                    href="https://expandtalk.se/kontakt/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    <Button className="bg-gradient-primary hover-scale hover-glow text-lg px-8 py-6 h-auto">
                      <Mail className="mr-2 h-5 w-5" />
                      Visit Expandtalk Corporation AB
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                </div>

                <div className="pt-4 text-sm text-muted-foreground">
                  <p>For inquiries about CortIQ,</p>
                  <p>please reach out through our contact page.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      {/* Footer */}
      <footer className="relative border-t bg-gradient-card backdrop-blur-sm py-16 px-4">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_48%,hsl(var(--primary)/0.02)_49%,hsl(var(--primary)/0.02)_51%,transparent_52%)]"></div>
        
        <div className="container mx-auto relative z-10">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <span className="font-black text-xl text-gradient-primary">CortIQ</span>
              </div>
              <p className="text-muted-foreground leading-relaxed mb-6 max-w-md">
                AI-agent intelligence without consent friction; visitor analytics that are consent-first and cookieless.
              </p>
              <div className="flex space-x-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center hover-scale cursor-pointer">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center hover-scale cursor-pointer">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center hover-scale cursor-pointer">
                  <Cookie className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold mb-6 text-gradient-primary">Product</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><Link to="/features" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">Features</Link></li>
                <li><Link to="/bot-intelligence" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">Bot Intelligence</Link></li>
                <li><Link to="/pricing" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">Pricing</Link></li>
                <li><Link to="/api" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">API</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-6 text-gradient-primary">Support</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><Link to="/contact" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">Contact</Link></li>
                <li><Link to="/privacy" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">Privacy Policy</Link></li>
                <li>
                  <a href="https://github.com/expandtalk/cortiq" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors hover:translate-x-1 transform duration-200 inline-block">GitHub</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default Index;
