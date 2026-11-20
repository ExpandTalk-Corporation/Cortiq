import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ArrowRight, Zap, Globe, Server, type LucideIcon } from "lucide-react";
import { BOT_CATEGORIES, BOT_CATEGORY_META, type BotCategory } from "@/lib/aiBotRegistry";
import { SectionHeader } from "./SectionHeader";
import { examplesFor } from "./botNames";
import { HERO_DAYS } from "@/data/homeSample";
import { CATEGORY_COLORS } from "./categoryColors";
import { Sparkline } from "./Sparkline";
import { ExampleTag } from "./BrowserFrame";
import { HeroDashboardMock } from "./HeroDashboardMock";

// Bot names on this page come from the ingest registry, so the page only names bots CortIQ classifies.
const CATEGORY_STYLE: Record<BotCategory, { icon: LucideIcon; tag: string }> = {
  training: { icon: Server, tag: "Infrastructure cost" },
  agentic: { icon: Zap, tag: "Real user intent" },
  citation: { icon: Globe, tag: "Visibility signal" },
};

// TollBit, State of the Bots H1 2026 (publisher sites on its network, self-identified bots only).
const REGIONS = [
  { value: "1 : 33", compare: "North America 1 : 93", label: "AI bot visits per human visit, median site" },
  { value: "179 : 1", compare: "North America 53 : 1", label: "AI assistant fetches per visitor they send back" },
  { value: "227 : 1", compare: "Q1 2026: 150 : 1", label: "The same exchange in Europe in Q2 2026" },
  { value: "41%", compare: "North America: 49% real-time fetches", label: "Of AI scraping in Europe is for training" },
];

export function AiTrafficSection() {
  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="AI traffic"
          title="Not all AI traffic is equal"
          intro="A training crawler and ChatGPT fetching your page for a real user look alike in a server log. CortIQ sorts every AI visit into one of three groups, server-side from the request or in the browser after consent."
        />
        <div className="mx-auto mb-12 max-w-3xl">
          <HeroDashboardMock />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {BOT_CATEGORIES.map((category) => {
            const style = CATEGORY_STYLE[category];
            const Icon = style.icon;
            return (
              <Card key={category} className="border-t-4" style={{ borderTopColor: CATEGORY_COLORS[category].hex }}>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`h-6 w-6 ${CATEGORY_COLORS[category].text}`} aria-hidden="true" />
                    <Badge variant="secondary">{style.tag}</Badge>
                  </div>
                  <CardTitle className="text-xl">{BOT_CATEGORY_META[category].label}</CardTitle>
                  <CardDescription className="text-base">{BOT_CATEGORY_META[category].description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <Sparkline
                      values={HERO_DAYS.map((d) => d[category])}
                      color={CATEGORY_COLORS[category].hex}
                      label={`Example trend for ${BOT_CATEGORY_META[category].label}`}
                    />
                    <ExampleTag />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">For example:</span> {examplesFor(category)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="mt-16">
          <h3 className="text-2xl font-bold text-center mb-2">Europe gets read more and visited less</h3>
          <p className="text-center text-muted-foreground max-w-3xl mx-auto mb-8">
            Europe vs North America, first half of 2026. The lower the first ratio and the higher the others, the worse for the site.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {REGIONS.map((r) => (
              <Card key={r.label}>
                <CardContent className="pt-6">
                  <div className="text-3xl font-black text-foreground">{r.value}</div>
                  <p className="mt-2 text-sm font-medium text-foreground">{r.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.compare}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground max-w-3xl mx-auto">
            Source: TollBit, State of the Bots H1 2026, publisher sites on its network. Counts only bots that identify themselves, so the real
            numbers are likely higher. Daily requests from AI agents grew by more than 1,700% in a year (Cloudflare, The Internet has a second
            audience, September 2026).
          </p>
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground max-w-3xl mx-auto">
          AI bots (excluding Googlebot) made up 4.2% of HTML requests in 2025 (Cloudflare Radar 2025 Year in Review), and training accounts for nearly 80% of AI crawling (Cloudflare, The crawl-to-click gap).
        </p>
        <div className="mt-6 text-center">
          <Link to="/features/ai/" className="inline-flex items-center text-primary font-medium hover:underline">
            How AI traffic is classified <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
