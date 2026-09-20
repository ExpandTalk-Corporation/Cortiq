import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useSEO } from "@/hooks/useSEO";
import PublicNavigation from "@/components/PublicNavigation";
import heroImage from "@/assets/analytics-dashboard-hero.jpg";
import analyticsIllustration from "@/assets/analytics-illustration.jpg";
import {
  Shield,
  BarChart3,
  MousePointer,
  FormInput,
  TestTube,
  Globe,
  Cookie,
  Users,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Play,
  Bot,
  Sparkles,
  Zap,
  Brain,
  Code,
  AlertTriangle,
  Lock,
  Mail
} from "lucide-react";

// Declare WFATracker on window
declare global {
  interface Window {
    WFATracker?: {
      trackView: (contentId: string) => void;
    };
  }
}

const Index = () => {
  useSEO({
    title: 'CortIQ — AI Agent Analytics & Cookie-Free Tracking',
    description: 'First-to-market analytics for the Agentic Web. Track ChatGPT Browser, Perplexity & Claude Browser. Cookie-free, GDPR-compliant. Heatmaps, A/B testing, form analytics.',
    canonical: 'https://cortiq.se/',
  });

  useEffect(() => {
    if (window.WFATracker) {
      window.WFATracker.trackView('homepage');
    }
  }, []);

  const features = [
    {
      icon: Bot,
      title: "Agentic Browser Analytics",
      description: "Track and analyze AI agents like ChatGPT Browser, Perplexity Comet, and Claude Browser. First on the market with dedicated agent tracking."
    },
    {
      icon: BarChart3,
      title: "Advanced KPI Dashboards",
      description: "Real-time analytics with customizable KPIs, traffic analysis, and conversion data from multiple sources including AI traffic."
    },
    {
      icon: MousePointer,
      title: "Visual Analytics (Heatmaps)",
      description: "Click heatmaps and scroll depth tracking on every page — for both human visitors and AI agents. Desktop, tablet and mobile views."
    },
    {
      icon: TestTube,
      title: "A/B Testing & Optimization",
      description: "Built-in A/B testing with statistical significance calculations to optimize conversion in the agentic web era."
    },
    {
      icon: Cookie,
      title: "Nudging Cookie Banners & 1st Party Data",
      description: "Smart nudging technology in cookie banners for higher consent rates plus accurate data with 1st party cookies."
    },
    {
      icon: Globe,
      title: "Universal Tracking Script",
      description: "One script works on any CMS or custom site. Deep WordPress integration in early access for invited users."
    }
  ];

  const benefits = [
    "First on the market with agentic browser analytics",
    "Track ChatGPT Browser, Perplexity Comet, and Claude Browser",
    "Agent-specific dashboards and insights",
    "Nudging cookie banners for higher consent rates", 
    "Accurate data with 1st party cookies",
    "Universal tracking script for any CMS or custom site",
    "Real-time analytics for both humans and AI agents",
    "Ready for the future web before competitors understand it"
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
                🤖 World's First AI Bot Intelligence Platform
              </Badge>
              <h1 className="text-4xl md:text-6xl font-black mb-8 animate-slide-up text-gradient-primary leading-tight">
                1 in 31 web visits is now an AI bot. Do you know which ones matter?
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto lg:mx-0 animate-fade-in leading-relaxed">
                Not all AI traffic is equal. CortIQ classifies every AI visit — training crawlers, agentic browsers, and citation bots — so you know what to optimize, what to ignore, and what's costing you infrastructure budget.
                Plus cookie-free analytics, heatmaps, A/B testing, and GDPR compliance.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center lg:justify-start items-center animate-scale-in">
                <Link to="/auth">
                  <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                    Request Invitation
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
                100% Banner-Free
              </Badge>
              <h2 className="text-4xl md:text-5xl font-black mb-8 text-gradient-primary">
                Banner-free server-side analytics
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Server-side analytics with ONLY aggregated data. No cookies, no IP storage, no fingerprinting.
                The banner-free base runs on server logs. Advanced tracking like heatmaps and conversions is opt-in and runs only with visitor consent.
                Built around Swedish PTS and EU ePrivacy guidance.
              </p>

              <div className="space-y-6 mb-12">
                <Card className="border-primary/20 bg-background/50 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center flex-shrink-0">
                        <Shield className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-2">True Banner-Free Analytics</h3>
                        <p className="text-muted-foreground">
                          Only aggregated, anonymous server data. NO cookies, IP storage, or fingerprinting. Designed to run banner-free, based on PTS/ePrivacy guidance.
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
                        <h3 className="font-bold text-lg mb-2">Hybrid Solution</h3>
                        <p className="text-muted-foreground">
                          Banner-free base analytics + smart nudging for opt-in advanced tracking. Best of both worlds.
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
                          Same privacy-first principles - aggregated data, no user tracking, EU hosting, fully GDPR compliant.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Link to="/auth">
                <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                  <Shield className="mr-2 h-5 w-5" />
                  Try banner-free analytics
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
                  <CardTitle className="text-2xl">Traditional vs Banner-Free Server-Side</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">Cookie Banner</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="destructive">Required</Badge>
                        <Badge className="bg-primary text-primary-foreground">Not needed ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">GDPR Compliance</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Complex</Badge>
                        <Badge className="bg-primary text-primary-foreground">Simpler ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">User Experience</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Disruptive</Badge>
                        <Badge className="bg-primary text-primary-foreground">Smoother ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">User Tracking</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Yes (cookies)</Badge>
                        <Badge className="bg-primary text-primary-foreground">No (aggregated) ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">Conversion</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="destructive">Lower</Badge>
                        <Badge className="bg-primary text-primary-foreground">Higher ✓</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Setup Time</span>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">Days</Badge>
                        <Badge className="bg-primary text-primary-foreground">5 min ✓</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t">
                    <div className="bg-gradient-primary/10 rounded-xl p-4 text-center">
                      <p className="font-bold text-lg mb-2">Want advanced tracking?</p>
                      <p className="text-sm text-muted-foreground">
                        Add opt-in banner with smart nudging for sessions, heatmaps, and conversions. Banner-free base + advanced tracking = hybrid solution.
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
              Bot security without a cookie banner
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
                  Identify and block malicious bots attempting to overload your website.
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
                  Security-necessary under GDPR Art. 6.1.f.
                </p>
              </CardContent>
            </Card>

            {/* Fraud Prevention */}
            <Card className="glass shadow-elegant hover-lift border-primary/20">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">Fraud Prevention</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Prevent click-fraud, fake registrations, and fraudulent transactions. 
                  PTS and Swedish law allow this without cookie banners.
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
                    The EU ePrivacy Directive exempts techniques "strictly necessary" for security from consent.
                    Bot detection, DDoS protection, and fraud prevention may qualify, subject to your own assessment.
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="font-bold flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    GDPR Art. 6.1.f
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Legitimate interest to protect your website and users from threats and fraud. 
                    Proportionate and minimal according to Swedish PTS.
                  </p>
                </div>
              </div>

              <div className="bg-primary/5 p-6 rounded-lg">
                <h4 className="font-bold mb-3 flex items-center">
                  <Bot className="h-5 w-5 text-primary mr-2" />
                  What we measure for security (WITHOUT cookie banner)
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
              A GPTBot crawling for training data is not the same as a ChatGPT Browser user navigating your site for a real customer. CortIQ is the first platform that classifies the difference.
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
                <p className="text-sm text-muted-foreground">GPTBot, ClaudeBot, BLEXBot — crawl for model training, zero referral value.</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <Zap className="h-5 w-5 text-green-400" />
                  <Badge className="text-xs bg-green-500/20 text-green-400 border-0">Real user intent</Badge>
                </div>
                <p className="font-semibold text-green-400">Agentic Browsers</p>
                <p className="text-sm text-muted-foreground">ChatGPT Browser, Perplexity Comet — act on behalf of users, convert like humans.</p>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <Globe className="h-5 w-5 text-blue-400" />
                  <Badge className="text-xs bg-blue-500/20 text-blue-400 border-0">Visibility signal</Badge>
                </div>
                <p className="font-semibold text-blue-400">Citation Crawlers</p>
                <p className="text-sm text-muted-foreground">PerplexityBot, Google-Extended — index your content for AI search results.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-16">
            <Card className="glass shadow-elegant hover-lift border-primary/20 text-center">
              <CardContent className="pt-8 pb-6">
                <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">ChatGPT Browser</h3>
                <p className="text-sm text-muted-foreground">
                  Track how OpenAI's browser agent crawls and cites your content
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
                  Analyze traffic from Perplexity AI and its citation behavior
                </p>
              </CardContent>
            </Card>

            <Card className="glass shadow-elegant hover-lift border-primary/20 text-center">
              <CardContent className="pt-8 pb-6">
                <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">Claude Browser</h3>
                <p className="text-sm text-muted-foreground">
                  Follow Anthropic's Claude agent and its interactions
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
                      <p className="text-sm text-muted-foreground">Register Copilot, Google AI Studio and custom bots</p>
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
                  <strong className="text-foreground">Why is this important?</strong> AI agents account for a growing portion of web traffic.
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
              Banner-free or hybrid with GA4
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Choose our 100% banner-free server-side analytics, or hybrid solution with GA4 server-side + smart consent management.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Our Bannerfri Server-Side Analytics */}
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
                  <span className="text-foreground">Track AI agents (ChatGPT, Perplexity, Claude Browser)</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Zero cookies - no banner needed</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">100% GDPR compliant automatically</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Better data quality (100% vs ~60%)</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Built-in heatmaps and A/B testing</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">WordPress plugin for easy setup</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">No data sampling or limits</span>
                </div>
              </CardContent>
              
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-primary opacity-10 rounded-tr-full"></div>
            </Card>

            {/* GA4 Server-Side */}
            <Card className="group border-2 border-accent/20 shadow-elegant hover-lift bg-gradient-card relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-accent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
              
              <CardHeader className="text-center pb-6 relative z-10">
                <div className="mx-auto w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Globe className="h-8 w-8 text-white" />
                </div>
                <Badge className="mb-4 bg-gradient-accent text-white mx-auto">
                  Also Available
                </Badge>
                <CardTitle className="text-2xl font-bold">GA4 Server-Side</CardTitle>
                <CardDescription className="text-base mt-2">
                  Keep Google Analytics without cookies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Keep your existing GA4 setup</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">We run it server-side for you</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">No cookies, no banner needed</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Same GA4 reports you're used to</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">GDPR compliant tracking</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Easy migration from client-side GA4</span>
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
                  Many of our customers run both solutions simultaneously. Get the best of both worlds - 
                  our agentic analytics for future-proof insights, plus GA4 server-side for familiar reporting.
                </p>
                <Link to="/auth">
                  <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                    Get Started
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform duration-300" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Remarketing Solution Section */}
      <section className="py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/20 via-background to-primary/5"></div>
        
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-16 animate-fade-in">
            <Badge className="mb-6 bg-gradient-primary text-white">
              <Zap className="h-4 w-4 mr-2 inline" />
              Smart Remarketing
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
              Cookiefree remarketing that actually works
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Run Google Ads, Facebook, and TikTok remarketing without cookies - using server-side conversion APIs and privacy-safe user matching.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            <Card className="border-2 border-primary/20 shadow-elegant hover-lift bg-gradient-card">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Globe className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">Google Ads Remarketing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Server-side conversion tracking via Google Ads API</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Enhanced conversions with hashed email matching</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Customer Match lists for precise targeting</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">No cookies needed on the website</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-accent/20 shadow-elegant hover-lift bg-gradient-card">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mb-6 hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">Meta (Facebook/Instagram)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Facebook Conversions API integration</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Server-side event tracking without pixel</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Custom Audiences with privacy-safe matching</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                  <span className="text-foreground">Higher attribution accuracy than cookies</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary/20 shadow-elegant hover-lift bg-gradient-card">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 hover:scale-110 transition-transform duration-300 shadow-lg">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">TikTok & Other Platforms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">TikTok Events API for cookiefree tracking</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">LinkedIn, Pinterest, Snapchat support</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">Universal server-side architecture</span>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-foreground">One integration for all platforms</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="max-w-4xl mx-auto border-2 border-primary/20 bg-gradient-card shadow-elegant">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4 text-gradient-primary">Why server-side remarketing is better</h3>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Privacy-First
                  </h4>
                  <p className="text-muted-foreground">
                    No cookies on user devices. Data processing happens server-side with proper consent and encryption.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Better Attribution
                  </h4>
                  <p className="text-muted-foreground">
                    Server-side APIs aren't blocked by ad blockers, giving you 100% accurate conversion tracking instead of ~60%.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Higher Match Rates
                  </h4>
                  <p className="text-muted-foreground">
                    Using hashed emails and phone numbers provides better audience matching than cookie-based tracking.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-primary mr-2" />
                    Future-Proof
                  </h4>
                  <p className="text-muted-foreground">
                    Works today and will keep working when third-party cookies are completely gone.
                  </p>
                </div>
              </div>
              <div className="text-center">
                <Link to="/auth">
                  <Button size="lg" className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-4 h-auto">
                    <Zap className="mr-2 h-5 w-5" />
                    Set up cookiefree remarketing
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
              When AI agents start browsing the web for users, you need to know what's happening. 
              We're first on the market with dedicated agentic browser tracking.
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
                  When ChatGPT Browser, Perplexity Comet, and Claude Browser start browsing your website 
                  for users, you want to know what's happening. We track everything - from bot behavior to 
                  structured data readiness and agent conversion attribution.
                </CardDescription>
                <div className="flex justify-center">
                  <Link to="/auth">
                    <Button className="group bg-gradient-primary hover-scale hover-glow text-lg px-8 py-3 h-auto">
                      <Zap className="mr-2 h-5 w-5" />
                      Stay ahead of your competitors
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
                First tool for the agentic web
              </h2>
              <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
                History shows that every major browser shift comes with a new promise. 
                Agentic browsers promise speed and automation - but only if they can trust your data. 
                We help you become visible to AI agents before your competitors even understand what's happening.
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
                  Request Invitation
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
              AI bot traffic grew 300% last year. 1 in 31 web visits is already an AI bot — up from 1 in 200 at the start of 2025.
              The platforms that understand what kind of AI traffic they have will win. Everyone else is flying blind.
            </p>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-8 justify-center items-center animate-scale-in">
            <Link to="/auth">
              <Button size="lg" variant="secondary" className="group glass hover-scale hover-glow text-lg px-10 py-5 h-auto font-bold">
                <Bot className="mr-3 h-6 w-6" />
                Get Started Now
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
                GDPR-compliant analytics that helps you understand your users without compromising privacy.
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
              Get in touch with us at Expandtalk Corporation AB for information about invite-only access.
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
                  <p>For inquiries about CortIQ and invite-only access,</p>
                  <p>please reach out through our contact page.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Index;
