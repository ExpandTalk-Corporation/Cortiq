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
  Link2,
  Search,
  Map,
  Users,
  Target,
  Navigation,
  AlertTriangle,
  TrendingUp,
  Monitor,
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
    icon: <Link2 className="h-7 w-7" />,
    title: "Link Click Counter",
    description: "Cookieless, aggregate click counts per link and button — no visitor ID attached.",
    items: ["Counts per link and button", "Per page and device type", "No cookies or visitor IDs", "Starts after analytics consent"],
  },
  {
    icon: <FormInput className="h-7 w-7" />,
    title: "Form Analytics",
    description: "Find where users drop off in your forms and fix it.",
    items: ["Funnel visualization", "Drop-off analysis", "Field-level metrics", "Completion rate"],
  },
  {
    icon: <Search className="h-7 w-7" />,
    title: "Form Auto-Discovery",
    description: "Find every form on your site and identify it by provider — so conversions map to the right form.",
    items: ["HubSpot form GUIDs (hs_context, data-form-id)", "Gravity Forms & Contact Form 7", "Forms found vs. unidentified", "Label forms to track them as goals"],
  },
  {
    icon: <Link2 className="h-7 w-7" />,
    title: "First-Party Click ID Capture",
    description: "Capture ad click IDs from landing URLs and keep them first-party — only with marketing consent.",
    items: ["gclid, fbclid, msclkid", "ttclid, li_fat_id", "Marketing consent required", "Feeds Enhanced Conversions upload"],
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
    items: ["Behavior segments", "Traffic source groups", "Device segments", "Conversion cohorts"],
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
    items: ["Firing rate alerts (>30% = misconfigured)", "Silent goal detection (7 days)", "Duplicate Primary warning", "Primary / Observation toggle"],
  },
  {
    icon: <Target className="h-7 w-7" />,
    title: "Attribution Gap Dashboard",
    description: "Compare CortIQ conversions with HubSpot quality leads and Enhanced Conversions upload status — side by side.",
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
];

export default function FeaturesAnalytics() {
  useSEO({
    title: 'Web Analytics — CortIQ',
    description: 'Consent-first web analytics: cookieless mode, click and scroll heatmaps, form analytics, link click counts and conversion attribution. EU-hosted and built for GDPR.',
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
            From heatmaps and form analytics to conversion attribution and lifetime value — analytics
            for marketing and product teams in one platform. Every visitor-analytics feature starts only after analytics consent.
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
            <h2 className="text-2xl font-bold mb-2">Integrations</h2>
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
            CortIQ is free during beta. Create an account and get access to all analytics features.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button asChild size="lg">
              <Link to="/auth">
                Create free account <ArrowRight className="ml-2 h-4 w-4" />
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
