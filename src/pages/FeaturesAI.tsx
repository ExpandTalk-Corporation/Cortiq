import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import {
  AI_BOT_REGISTRY,
  BOT_CATEGORIES,
  BOT_CATEGORY_META,
  REGISTRY_BOT_COUNT,
  botsInCategory,
  vendorOf,
  type BotCategory,
} from "@/lib/aiBotRegistry";
import {
  Bot,
  Activity,
  TrendingUp,
  Search,
  Eye,
  Database,
  CheckCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: <Bot className="h-7 w-7" />,
    title: "Three-Way AI Traffic Classification",
    description: "Every AI request is classified at ingest as training, agentic or citation — the same rules for the JS tag and server logs.",
    items: BOT_CATEGORIES.map((c) => `${BOT_CATEGORY_META[c].label} — ${botsInCategory(c).length} named bots`),
    highlight: true,
  },
  {
    icon: <Eye className="h-7 w-7" />,
    title: "Agentic Fetch Detection",
    description: "When an AI assistant opens a page for a user, it identifies itself with a -User token. CortIQ tracks those as real-intent traffic.",
    items: [
      ...botsInCategory("agentic").map((b) => `${b.name} (${vendorOf(b)})`),
      "JS-signal heuristics for in-browser AI agents",
    ],
  },
  {
    icon: <Activity className="h-7 w-7" />,
    title: "Agent Journey Funnel",
    description: "See how far AI agents get through your site — from landing page to conversion.",
    items: [
      "Funnel by page type: landing → category → product → checkout → conversion",
      "Agent sessions per funnel step",
      "Drop-off between steps",
    ],
  },
  {
    icon: <TrendingUp className="h-7 w-7" />,
    title: "AI Traffic Analytics",
    description: "Dedicated dashboards for AI-driven traffic — split cleanly from human visitor data.",
    items: [
      "AI vs human traffic split",
      "AI referral traffic (ChatGPT, Perplexity, Claude, Gemini)",
      "Traffic trend over time",
      "Per-bot and per-category KPIs",
    ],
  },
  {
    icon: <Search className="h-7 w-7" />,
    title: "Server-Side Crawler Ingestion",
    description: "Training and citation crawlers rarely execute JavaScript. Connect Cloudflare logs and CortIQ classifies them server-side with the same registry.",
    items: [
      "Cloudflare log ingestion",
      "Catches crawlers the JS tag never sees",
      "Identical classification to the JS tag",
      "Runs without visitor consent (no personal data)",
    ],
  },
  {
    icon: <Database className="h-7 w-7" />,
    title: "Transparent AI Insights",
    description: "Every AI recommendation shows its work — see the exact tables, row counts, and model behind each insight. No black box.",
    items: [
      "Source trace per insight (tables + row counts)",
      "Model and token usage logged",
      "Full execution log for every agent job",
      "Timestamp and duration on each run",
    ],
  },
];

const categoryColor: Record<BotCategory, string> = {
  training: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  agentic: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  citation: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

export default function FeaturesAI() {
  useSEO({
    title: 'AI Agent Analytics — CortIQ',
    description: 'Classify AI traffic into training crawlers, agentic fetches and citation crawlers — GPTBot, ClaudeBot, ChatGPT-User, PerplexityBot and more. JS tag and server-side log ingestion.',
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <PublicNavigation />
      <div className="container mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4 mr-2" />
            AI Intelligence
          </Badge>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            The web is filling up with AI agents. Track them.
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            AI training crawlers, assistants fetching pages for users, and AI search crawlers are a
            growing slice of web traffic. CortIQ separates them so you know which ones cost you and which ones send value.
          </p>
        </div>

        {/* Features */}
        <section className="mb-20">
          <div className="grid lg:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <Card
                key={i}
                className={`hover:shadow-lg transition-shadow ${f.highlight ? "border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5" : ""}`}
              >
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

        {/* Agent coverage table */}
        <section className="mb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Agent Coverage</h2>
            <p className="text-muted-foreground">The {REGISTRY_BOT_COUNT} named bots CortIQ classifies today, straight from the ingest registry</p>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-6 py-3 font-semibold">Agent</th>
                      <th className="text-left px-6 py-3 font-semibold">Vendor</th>
                      <th className="text-left px-6 py-3 font-semibold">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AI_BOT_REGISTRY.map((b) => (
                      <tr key={b.name} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-3 font-medium">{b.name}</td>
                        <td className="px-6 py-3 text-muted-foreground">{vendorOf(b)}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${categoryColor[b.category]}`}>
                            {BOT_CATEGORY_META[b.category].label}
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
          <h2 className="text-2xl font-bold mb-3">Ready for the agentic web?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            AI agents are already visiting your site. CortIQ is free during the beta.
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
