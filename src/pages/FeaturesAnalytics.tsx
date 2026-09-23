import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import {
  BarChart3,
  MousePointer,
  FormInput,
  TestTube,
  Video,
  Map,
  Users,
  Target,
  Navigation,
  AlertTriangle,
  TrendingUp,
  Monitor,
  Database,
  Settings,
  Globe,
  CheckCircle,
  ArrowRight,
  Zap,
  FileText,
} from "lucide-react";

const features = [
  {
    icon: <MousePointer className="h-7 w-7" />,
    title: "Heatmaps",
    description: "Visualize where users click and how far they scroll — on desktop, tablet, and mobile.",
    items: ["Click heatmaps", "Scroll depth heatmaps", "Device-specific views", "Mobile insights"],
  },
  {
    icon: <TestTube className="h-7 w-7" />,
    title: "A/B Testing",
    description: "Test two variants of your site and get statistically significant results.",
    items: ["2-variant A/B testing", "Statistical significance", "Audience segmentation", "ROI measurement"],
  },
  {
    icon: <FormInput className="h-7 w-7" />,
    title: "Form Analytics",
    description: "Find where users drop off in your forms and fix it.",
    items: ["Funnel visualization", "Drop-off analysis", "Field-level metrics", "Completion rate"],
  },
  {
    icon: <Video className="h-7 w-7" />,
    title: "Session Recording",
    description: "Record and replay real user sessions to understand actual behavior.",
    items: ["Full session recordings", "Bot vs human filter", "Device & URL filters", "Search & playback"],
  },
  {
    icon: <Target className="h-7 w-7" />,
    title: "KPI Dashboard",
    description: "Track your most important metrics in a fully customizable dashboard.",
    items: ["Custom KPIs", "Real-time data", "Trend analysis", "Goal tracking"],
  },
  {
    icon: <FileText className="h-7 w-7" />,
    title: "Traffic Sources & UTM",
    description: "Understand every traffic channel and campaign performance in detail.",
    items: ["UTM tracking", "Referral analysis", "Campaign attribution", "Channel performance"],
  },
  {
    icon: <Navigation className="h-7 w-7" />,
    title: "Navigation Analytics",
    description: "See how users actually move through your site — not how you think they do.",
    items: ["Menu click analysis", "Navigation flows", "Exit points", "Path optimization"],
  },
  {
    icon: <Monitor className="h-7 w-7" />,
    title: "Segmentation",
    description: "Slice your audience any way you need for deeper insights.",
    items: ["Demographics", "Behavior segments", "Traffic source groups", "Conversion cohorts"],
  },
  {
    icon: <AlertTriangle className="h-7 w-7" />,
    title: "Behavioral Alerts",
    description: "Get notified when something abnormal happens before it becomes a problem.",
    items: ["Rage click detection", "Bounce rate spikes", "Form abandonment alerts", "Session anomalies"],
  },
  {
    icon: <Users className="h-7 w-7" />,
    title: "User LTV & Cohort Analysis",
    description: "Measure lifetime value and group users by their first-visit month.",
    items: ["LTV per user (anonymized)", "Monthly cohort analysis", "Revenue per session", "Top 100 LTV users"],
  },
  {
    icon: <Map className="h-7 w-7" />,
    title: "Geolocation Maps",
    description: "Interactive world map showing where your visitors come from.",
    items: ["Cluster map", "Country / region / city drill-down", "Bounce rate per location", "Export data"],
  },
  {
    icon: <Zap className="h-7 w-7" />,
    title: "Cookieless Mode",
    description: "Privacy-minimised analytics with no cookies, no device fingerprint and no cross-visit profile. Starts only after analytics consent, like all visitor analytics.",
    items: ["No cookies or persistent IDs", "No device fingerprinting", "No cross-visit profiling", "Consent valid 12 months"],
  },
  {
    icon: <AlertTriangle className="h-7 w-7" />,
    title: "Goal Health Monitor",
    description: "Automatically flags misconfigured conversion goals — fires-too-often, silent tags, and duplicate Primary goals that corrupt Smart Bidding.",
    items: ["Firing rate alerts (>30% = misconfigured)", "Silent goal detection", "Primary / Observation toggle", "Inline fix suggestions"],
  },
  {
    icon: <Target className="h-7 w-7" />,
    title: "Attribution Gap Dashboard",
    description: "Compare what CortIQ tracks, what Google Ads claims, and what your CRM classifies as quality — side by side.",
    items: ["CortIQ vs. HubSpot MQL comparison", "Gap % with diagnosis", "Enhanced Conversions upload status", "30-day rolling view, no PII"],
  },
];

const integrations = [
  {
    icon: <Globe className="h-7 w-7" />,
    title: "Google Analytics 4",
    items: ["Consent Mode v2 (fires after consent)", "Two-way conversion sync", "Traffic sources & segments"],
  },
  {
    icon: <TrendingUp className="h-7 w-7" />,
    title: "Google Search Console",
    items: ["Impressions, clicks & position", "Query-level data", "AI-search performance view"],
  },
  {
    icon: <Target className="h-7 w-7" />,
    title: "Google Ads",
    items: ["Enhanced Conversions", "Consent-gated upload", "Lead-quality scoring"],
  },
  {
    icon: <Zap className="h-7 w-7" />,
    title: "HubSpot",
    items: ["Lead-quality webhook", "SHA-256 email matching", "Attribution-gap dashboard"],
  },
  {
    icon: <Settings className="h-7 w-7" />,
    title: "Tag Manager",
    items: ["Event & pixel tags", "Consent Mode v2", "Data layer variables"],
  },
  {
    icon: <Database className="h-7 w-7" />,
    title: "Data Warehouse",
    items: ["BigQuery", "Snowflake", "Redshift", "PostgreSQL, MySQL & Databricks"],
  },
];

export default function FeaturesAnalytics() {
  useSEO({
    title: 'Web Analytics — CortIQ',
    description: 'Consent-first web analytics: cookieless mode, click heatmaps, form analytics, session recording and A/B testing. EU-hosted and built for GDPR.',
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <PublicNavigation />
      <div className="container mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="text-sm font-medium mb-4">
            <BarChart3 className="h-4 w-4 mr-2" />
            Marketing & Analytics
          </Badge>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Understand your visitors. Optimize everything.
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From heatmaps and session recordings to A/B tests and lifetime value — all the tools
            marketing and product teams need in one platform. Every visitor-analytics feature starts only after analytics consent.
          </p>
        </div>

        {/* Features grid */}
        <section className="mb-20">
          <div className="grid lg:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="text-primary mt-1">{f.icon}</div>
                    <div>
                      <CardTitle className="text-xl mb-1">{f.title}</CardTitle>
                      <CardDescription className="text-base">{f.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {f.items.map((item, idx) => (
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

        {/* Integrations */}
        <section className="mb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Integrations & Data Export</h2>
            <p className="text-muted-foreground">Connect to your existing stack</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {integrations.map((int, i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="text-primary mb-2">{int.icon}</div>
                  <CardTitle className="text-lg">{int.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {int.items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center bg-primary/5 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-3">Ready to optimize your website?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Start free and get access to all analytics features from day one.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button asChild size="lg">
              <Link to="/auth">
                Start Free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/features">See All Features</Link>
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
