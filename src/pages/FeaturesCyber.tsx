import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import {
  Shield,
  AlertTriangle,
  Eye,
  Map,
  Activity,
  Lock,
  Bot,
  Radar,
  MousePointerClick,
  Server,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: <Bot className="h-7 w-7" />,
    title: "Bot Detection & Classification",
    description: "Automatically identify every bot hitting your site — and know whether it's legitimate or not.",
    items: [
      "Distinguish legitimate crawlers (Googlebot, Bingbot) from scrapers",
      "Headless browser detection — Puppeteer, Playwright, Selenium",
      "User-agent fingerprinting",
      "Visual / Headless / Text-based classification",
    ],
  },
  {
    icon: <Radar className="h-7 w-7" />,
    title: "Traffic Anomaly Alerts",
    description: "Sudden traffic spikes are often probes or automated attacks. Get alerted before it's a problem.",
    items: [
      "Sudden session volume spikes",
      "Abnormal page request rates",
      "Bounce rate anomalies",
      "Automated attack pattern signals",
    ],
  },
  {
    icon: <AlertTriangle className="h-7 w-7" />,
    title: "Content Scraping Detection",
    description: "Know when automated tools are harvesting your content at scale.",
    items: [
      "High-frequency page crawls from single sources",
      "Systematic URL traversal patterns",
      "Non-human navigation sequences",
      "Session depth & timing anomalies",
    ],
  },
  {
    icon: <Eye className="h-7 w-7" />,
    title: "Honeypot & Canary Traps",
    description: "Hidden traps that only automated visitors trigger — proof of scraping instead of a guess.",
    items: [
      "Invisible honeypot link (click/focus = bot)",
      "Canary pixel: fetched from a server IP = scraper",
      "Canary link followed by link-traversal bots",
      "IP anonymized, raw user agent never stored",
    ],
  },
  {
    icon: <MousePointerClick className="h-7 w-7" />,
    title: "Click-Fraud Detection",
    description: "Score paid-ad sessions for fraud signals so you know how much ad spend goes to non-human clicks.",
    items: [
      "Paid sessions (cpc, ppc, paid social, display) scored 0–100",
      "Confirmed bots, webdriver & headless signals",
      "Zero-engagement sessions (< 5 s, one page)",
      "Suspicious-hour sessions (01–05 UTC), per campaign",
    ],
  },
  {
    icon: <Server className="h-7 w-7" />,
    title: "Server-Side Bot Ingestion",
    description: "Ingest Cloudflare logs to see crawlers that never execute JavaScript.",
    items: [
      "Cloudflare log ingest",
      "Same bot registry as the JS tag",
      "Training & citation crawlers",
      "Scrapers & monitoring bots bucketed separately",
    ],
  },
  {
    icon: <Map className="h-7 w-7" />,
    title: "Geolocation of Suspicious Traffic",
    description: "Map where bot traffic and anomalous visits originate — country, region, and city level.",
    items: [
      "Interactive origin map for all traffic",
      "Bot vs human split per location",
      "Country-level traffic anomalies",
      "Drill-down to city level",
    ],
  },
  {
    icon: <Activity className="h-7 w-7" />,
    title: "Behavioral Threat Signals",
    description: "Behavioral patterns that signal automated abuse — detected automatically.",
    items: [
      "Rage clicks (frustration or automation)",
      "Inhuman interaction timing",
      "Form spam patterns",
      "Repeated identical sessions",
    ],
  },
  {
    icon: <Lock className="h-7 w-7" />,
    title: "Privacy-First Architecture",
    description: "Security intelligence without compromising visitor privacy — all data is anonymized and EU-hosted.",
    items: [
      "Hashed visitor IDs (no PII)",
      "Cookieless tracking mode",
      "EU data hosting",
      "Built for GDPR, privacy by design",
    ],
  },
  {
    icon: <Shield className="h-7 w-7" />,
    title: "GDPR & Consent",
    description: "Built-in consent and data-protection tools, no separate CMP required. You make the final legal assessment for your site.",
    items: [
      "Cookie consent management (CMP)",
      "Configurable data retention",
      "User data deletion requests",
      "Google Consent Mode v2 support",
    ],
  },
];

const botTypes = [
  { name: "Googlebot", verdict: "Legitimate", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { name: "Bingbot", verdict: "Legitimate", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { name: "GPTBot / ClaudeBot", verdict: "Legitimate", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { name: "BingPreview", verdict: "Legitimate", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { name: "Headless Chrome (unidentified)", verdict: "Suspicious", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { name: "Unknown scrapers", verdict: "Suspicious", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { name: "High-frequency crawlers", verdict: "Suspicious", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { name: "Content harvesters", verdict: "Malicious", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
];

export default function FeaturesCyber() {
  useSEO({
    title: 'Cyber Security & Bot Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <PublicNavigation />
      <div className="container mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="text-sm font-medium mb-4">
            <Shield className="h-4 w-4 mr-2" />
            Cyber & Bot Intelligence
          </Badge>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Know who's hitting your site — human, bot, or threat.
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Not all traffic is human. CortIQ identifies bots, detects scraping, surfaces traffic
            anomalies, and maps suspicious activity — so you always know what's really happening.
          </p>
        </div>

        {/* Features */}
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

        {/* Bot classification table */}
        <section className="mb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Bot Classification</h2>
            <p className="text-muted-foreground">CortIQ categorizes every non-human visitor automatically</p>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-6 py-3 font-semibold">Bot / Traffic Type</th>
                      <th className="text-left px-6 py-3 font-semibold">Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botTypes.map((b, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-3 font-medium">{b.name}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${b.color}`}>
                            {b.verdict}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <div className="text-center bg-primary/5 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-3">See what's really visiting your site.</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Set up takes minutes. Bot intelligence and anomaly detection start working immediately.
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
