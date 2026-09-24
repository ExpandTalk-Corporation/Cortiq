import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import { botsInCategory, type BotCategory } from "@/lib/aiBotRegistry";
import {
  Bot,
  TrendingUp,
  Shield,
  Zap,
  Eye,
  DollarSign,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
} from "lucide-react";

// Examples come from the ingest registry so the page only names bots we classify.
const examplesFor = (category: BotCategory) => botsInCategory(category).slice(0, 5).map((b) => b.name);

const BOT_TYPES = [
  {
    type: "Training Crawlers",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    badge: "bg-red-500/20 text-red-400",
    icon: <AlertTriangle className="h-6 w-6 text-red-400" />,
    value: "Infrastructure cost",
    description:
      "Crawling your content to train AI models. Generates server load, zero referral traffic.",
    examples: examplesFor("training"),
    action: "Measure the cost. Decide if you want to allow or restrict.",
  },
  {
    type: "Agentic Fetches",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    badge: "bg-green-500/20 text-green-400",
    icon: <Zap className="h-6 w-6 text-green-400" />,
    value: "Real visitors with intent",
    description:
      "An AI assistant opening your page because a real user asked it to. The user has intent — the AI is their browser.",
    examples: examplesFor("agentic"),
    action: "Track their journey. Attribute conversions. Optimize for them.",
  },
  {
    type: "Citation Crawlers",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    badge: "bg-blue-500/20 text-blue-400",
    icon: <Eye className="h-6 w-6 text-blue-400" />,
    value: "AI visibility signal",
    description:
      "Indexing your content for AI-powered search results. Drives indirect discovery in ChatGPT, Perplexity, Gemini.",
    examples: examplesFor("citation"),
    action: "Monitor access. Optimize for citability.",
  },
];

const STATS = [
  {
    value: "300%",
    label: "AI bot traffic growth in 12 months",
    source: "Akamai SOTI, 2025",
  },
  {
    value: "1 : 31",
    label: "AI bot visits per human visits, up from 1 : 200 in Q1",
    source: "TollBit, Q4 2025",
  },
  {
    value: "4.2%",
    label: "Of all HTML requests are AI crawlers",
    source: "Cloudflare Radar 2025",
  },
  {
    value: "80%",
    label: "Of AI crawling is training only — no referral traffic",
    source: "Cloudflare Radar 2025",
  },
];

const COMPARISON = [
  {
    capability: "Detect AI bot visits",
    blocker: true,
    cortiq: true,
  },
  {
    capability: "Classify by bot type (training / agentic / citation)",
    blocker: false,
    cortiq: true,
  },
  {
    capability: "Track agentic fetches separately from crawlers",
    blocker: false,
    cortiq: true,
  },
  {
    capability: "Measure conversion from AI-referred users",
    blocker: false,
    cortiq: true,
  },
  {
    capability: "AI visibility & citability scoring",
    blocker: false,
    cortiq: true,
  },
  {
    capability: "Citation request tracking",
    blocker: false,
    cortiq: true,
  },
  {
    capability: "Block bots at the edge",
    blocker: true,
    cortiq: false,
  },
];

export default function BotIntelligence() {
  useSEO({
    title: "AI Bot Intelligence — CortIQ",
    description:
      "Not all AI traffic is equal. CortIQ classifies training crawlers, agentic fetches, and citation crawlers — so you know which bots are valuable and which are just infrastructure cost.",
  });

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />

      {/* Hero */}
      <section className="relative pt-24 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center space-y-6 relative">
          <Badge variant="outline" className="text-xs px-3 py-1">
            AI Bot Intelligence
          </Badge>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            Bot blockers tell you what to stop.
            <br />
            <span className="text-primary">CortIQ tells you what matters.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            By late 2025 there was one AI bot visit for every 31 human visits (TollBit). But lumping them all into "block or allow" ignores the
            only question that matters for your business: which ones are actually valuable?
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild size="lg">
              <Link to="/auth">
                Create free account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/features/ai">See all AI features</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-muted/30 py-8 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map((stat) => (
            <div key={stat.value} className="space-y-1">
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground leading-snug">{stat.label}</div>
              <div className="text-xs text-muted-foreground/60">{stat.source}</div>
            </div>
          ))}
        </div>
      </section>

      {/* The real problem */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold">The problem with "block or allow"</h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Most platforms treat AI traffic as a binary: threats to block, or crawlers to allow. That
            framing misses the entire story.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            AI bots hitting WooCommerce cart pages 3.75 million times in a single day (Kinsta) is a
            different problem than ChatGPT fetching your product page because a real customer asked
            about it. Blocking both loses you the valuable traffic. Allowing both burns your server budget.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The question isn't "should I allow bots?" — it's "which bots, on which parts of my site,
            and what are they worth to me?"
          </p>
          <p className="font-medium text-foreground">
            Answering that requires intelligence, not a firewall.
          </p>
        </div>
      </section>

      {/* Three types */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">Three types of AI traffic. Three different responses.</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              CortIQ classifies every AI visit so you can act on the right signal — not just know that
              "bots visited."
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {BOT_TYPES.map((bt) => (
              <Card key={bt.type} className={`border ${bt.bg}`}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start justify-between">
                    {bt.icon}
                    <Badge className={`text-xs ${bt.badge} border-0`}>{bt.value}</Badge>
                  </div>
                  <div>
                    <h3 className={`font-semibold text-lg ${bt.color}`}>{bt.type}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {bt.description}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {bt.examples.map((ex) => (
                      <div key={ex} className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                        {ex}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
                    {bt.action}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">Intelligence vs. blocking</h2>
            <p className="text-muted-foreground">
              Bot blockers and CortIQ solve different problems. You likely need both — but for
              different reasons.
            </p>
          </div>

          <Card>
            <CardContent className="pt-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 text-sm text-muted-foreground font-medium">
                      Capability
                    </th>
                    <th className="text-center py-4 px-4 text-sm font-medium">
                      Bot blockers
                    </th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-primary">
                      CortIQ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-3 px-4 text-sm">{row.capability}</td>
                      <td className="py-3 px-4 text-center">
                        {row.blocker ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.cortiq ? (
                          <CheckCircle className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What CortIQ gives you */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">What CortIQ gives you</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Not just bot detection — bot intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Bot className="h-5 w-5 text-primary" />,
                title: "Bot traffic classification",
                desc: "Every AI request labeled at ingest: training crawler, agentic fetch, or citation crawler — from the JS tag and from Cloudflare logs.",
              },
              {
                icon: <BarChart3 className="h-5 w-5 text-primary" />,
                title: "% of total traffic that's AI",
                desc: "Your site's own version of the TollBit ratio — how much of your traffic is AI.",
              },
              {
                icon: <Zap className="h-5 w-5 text-primary" />,
                title: "Agentic fetch tracking",
                desc: "ChatGPT-User, Claude-User and Perplexity-User requests tracked per page, plus JS-signal heuristics for AI agents running inside a real browser.",
              },
              {
                icon: <DollarSign className="h-5 w-5 text-primary" />,
                title: "AI referral tracking",
                desc: "Visitors arriving from ChatGPT, Perplexity, Claude, Gemini or Copilot are tagged by source (with analytics consent).",
              },
              {
                icon: <Eye className="h-5 w-5 text-primary" />,
                title: "AI visibility scoring",
                desc: "See how citable your content is to LLMs. Schema, robots.txt, llms.txt — scored and actionable.",
              },
              {
                icon: <Shield className="h-5 w-5 text-primary" />,
                title: "Citation crawler tracking",
                desc: "When AI search crawlers like OAI-SearchBot and PerplexityBot fetch your pages, you know. Baseline data for your AI visibility strategy.",
              },
            ].map((item) => (
              <Card key={item.title} className="border-border/60">
                <CardContent className="pt-6 space-y-3">
                  <div className="p-2 bg-primary/10 rounded-lg w-fit">{item.icon}</div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pull quote */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <TrendingUp className="h-8 w-8 text-primary mx-auto" />
          <blockquote className="text-2xl font-medium leading-relaxed">
            "The sites that navigate bot traffic well won't be the ones that blocked the most. They'll be
            the ones whose operators understood what they were optimizing for."
          </blockquote>
          <p className="text-sm text-muted-foreground">Kinsta, The AI &amp; Bot Traffic Reality Check</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 bg-primary/5 border-t border-border">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">
            See what kind of AI traffic is actually hitting your site
          </h2>
          <p className="text-muted-foreground">
            Free during the beta. Add one script tag or the WordPress plugin.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link to="/auth">
                Create free account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
