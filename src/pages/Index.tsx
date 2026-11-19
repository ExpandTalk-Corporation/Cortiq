import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { BOT_CATEGORIES, BOT_CATEGORY_META, botsInCategory, type BotCategory } from "@/lib/aiBotRegistry";
import heroAvif1280 from "@/assets/hero/hero-1280.avif";
import heroAvif1983 from "@/assets/hero/hero-1983.avif";
import heroWebp1280 from "@/assets/hero/hero-1280.webp";
import heroWebp1983 from "@/assets/hero/hero-1983.webp";
import heroMobileAvif from "@/assets/hero/hero-mobile-900.avif";
import heroMobileWebp from "@/assets/hero/hero-mobile-900.webp";
import heroMobileJpg from "@/assets/hero/hero-mobile-900.jpg";
import {
  Shield,
  BarChart3,
  Cookie,
  ArrowRight,
  Bot,
  Zap,
  Globe,
  Code,
  ShieldCheck,
  FileSearch,
  Languages,
  Scale,
  FileText,
  Target,
  Activity,
  Lock,
  Server,
  type LucideIcon,
} from "lucide-react";

// Bot names on this page come from the ingest registry, so the page only names bots CortIQ classifies.
const CATEGORY_STYLE: Record<BotCategory, { icon: LucideIcon; tone: string; tag: string }> = {
  training: { icon: Server, tone: "text-red-500", tag: "Infrastructure cost" },
  agentic: { icon: Zap, tone: "text-green-600 dark:text-green-400", tag: "Real user intent" },
  citation: { icon: Globe, tone: "text-blue-600 dark:text-blue-400", tag: "Visibility signal" },
};

const examplesFor = (category: BotCategory) =>
  [...new Set(botsInCategory(category).map((b) => b.name))].slice(0, 4).join(", ");

const BANNER_POINTS = [
  {
    title: "Five languages",
    text: "Swedish, English, German, French and Portuguese, picked from the page language or set with data-lang.",
  },
  {
    title: "Reject is as easy as accept",
    text: "\"Necessary only\" sits next to \"Accept all\" on the first layer. Nothing except the necessary is preselected.",
  },
  {
    title: "Consent log",
    text: "Every choice is logged with the policy version it was given under. By default, acceptance is asked again after 12 months and refusal after 6 months.",
  },
  {
    title: "Global Privacy Control",
    text: "When the browser sends GPC, marketing stays off and cannot be switched on in the banner.",
  },
  {
    title: "Google Consent Mode v2",
    text: "Opt-in per site: default denied, then updated per category when the visitor answers.",
  },
  {
    title: "Your own CMP works too",
    text: "Keep Cookiebot, or any CMP that sends Google Consent Mode. CortIQ waits for its analytics and marketing signals.",
  },
];

const MODES = [
  {
    title: "Cookieless",
    text: "No cookies, no device fingerprint, no cross-visit profile. A per-tab session ID in sessionStorage after analytics consent.",
  },
  {
    title: "Full",
    text: "Adds a salted device hash for a visitor profile and, with marketing consent, ad click IDs. Starts only after analytics consent.",
  },
  {
    title: "Aggregate (opt-in)",
    text: "Daily counts of page views, visits and sources. Nothing is stored on the device and no identifier is set. Designed to not require consent, but regulators may treat the script's request as access under ePrivacy Art. 5(3). Whether you need consent where you operate is your assessment.",
  },
];

const LEGAL_BASES = [
  {
    title: "ePrivacy Art. 5(3)",
    text: "Storing information on the visitor's device, or gaining access to information already there, needs consent unless it is strictly necessary to transmit a communication or to provide a service the visitor explicitly asked for. Regulators generally do not treat analytics for the site owner as strictly necessary, so CortIQ's browser tracking waits for consent (EDPB Guidelines 2/2023). National laws implement the rule and differ in detail.",
  },
  {
    title: "GDPR Art. 6(1)(f)",
    text: "Server-side request data (truncated IP, user agent, path) is still personal data. Legitimate interest can support measuring bots and protecting the site when the site owner's balancing test shows the processing is proportionate and minimal.",
  },
  {
    title: "Data minimisation",
    text: "Server-side adapters truncate IPs on your server and send only bot-like requests. Truncated IPs are cleared after 30 days and records follow the site's retention (default 365 days). EU-hosted.",
  },
];

const LEGAL_DOCS = [
  { to: "/privacy/", label: "Privacy policy" },
  { href: "https://github.com/ExpandTalk-Corporation/Cortiq/blob/main/DPA.md", label: "Data Processing Agreement" },
  { to: "/cookies/", label: "Cookie policy" },
  { to: "/security/", label: "Security" },
];

const ATTRIBUTION = [
  { title: "Click IDs, consent-gated", text: "gclid, fbclid, msclkid, ttclid and li_fat_id are kept only with marketing consent." },
  { title: "Goal health", text: "Flags goals that fire on too many sessions, goals that went silent and duplicate primary goals." },
  { title: "Lead quality to Google Ads", text: "HubSpot lead quality is uploaded as click conversions, matched on gclid. Email is SHA-256 hashed on arrival. Only visits with marketing consent are uploaded." },
  { title: "Do you need the pixel?", text: "Compares aggregate-mode conversion counts with your banner acceptance to show whether an ad pixel has enough data to learn." },
];

const OPERATIONS = [
  { icon: Server, title: "Server-side bot measurement", text: "Adapters for Next.js, Netlify, Cloudflare, Node, WordPress and PHP catch crawlers that never run JavaScript." },
  { icon: Activity, title: "Uptime and snippet check", text: "Every 5 minutes: is the site up, and is the CortIQ snippet still on the page?" },
  { icon: Lock, title: "Pinned installs with SRI", text: "Optional versioned script URLs with integrity hashes, so a changed file is blocked by the browser." },
  { icon: Code, title: "REST API and MCP", text: "Query your analytics from your own tools or from AI agents with read-only API keys." },
];

const SectionHeader = ({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) => (
  <div className="max-w-3xl mx-auto text-center mb-12">
    <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-3">{eyebrow}</p>
    <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>
    <p className="text-lg text-muted-foreground leading-relaxed">{intro}</p>
  </div>
);

const Index = () => {
  useSEO(seoFor("/"));

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />

      {/* Hero: one full-bleed photo. Its left edge fades to #f7f9fc, so the light-mode
          background matches it and a gradient in the same colour keeps the copy readable. */}
      <section className="relative overflow-hidden bg-[#f7f9fc] dark:bg-background flex flex-col xl:flex-row xl:items-center xl:min-h-[600px]">
        {/* Below xl: text, then the photo. From xl the photo is the backdrop. */}
        <picture className="order-last xl:order-none">
          <source media="(min-width: 1280px)" type="image/avif" srcSet={`${heroAvif1280} 1280w, ${heroAvif1983} 1983w`} sizes="100vw" />
          <source media="(min-width: 1280px)" type="image/webp" srcSet={`${heroWebp1280} 1280w, ${heroWebp1983} 1983w`} sizes="100vw" />
          <source type="image/avif" srcSet={heroMobileAvif} />
          <source type="image/webp" srcSet={heroMobileWebp} />
          <img
            src={heroMobileJpg}
            width={900}
            height={584}
            alt="An analyst reviews web traffic dashboards in an office overlooking a city waterfront"
            // React 18 only passes the attribute through in lowercase.
            {...({ fetchpriority: "high" } as Record<string, string>)}
            className="block w-full h-auto xl:absolute xl:inset-0 xl:h-full xl:object-cover xl:object-right dark:xl:brightness-75"
          />
        </picture>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 hidden xl:block w-[50%] bg-gradient-to-r from-[#f7f9fc] via-[#f7f9fc]/90 to-transparent dark:from-background dark:via-background/90"
        />

        <div className="container mx-auto relative z-10 w-full px-4 pt-12 pb-12 xl:py-16">
          <div className="max-w-2xl xl:max-w-[34rem] text-center xl:text-left mx-auto xl:mx-0">
            <Badge className="mb-6 bg-gradient-primary text-white border-0">Free during beta</Badge>
            <h1 className="text-4xl md:text-6xl xl:text-5xl font-black mb-4 text-gradient-primary leading-tight">
              Every AI visit, classified.
            </h1>
            <p className="text-xl md:text-2xl font-semibold text-foreground mb-3 leading-snug">
              One AI bot visit for every 31 human visits. CortIQ shows which ones train on your content, which ones act for real users, and which ones cite you.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Source: TollBit, State of the Bots, Q4 2025, across its publisher network (up from 1 in 200 in Q1 2025).
            </p>
            <p className="text-lg text-foreground/80 mb-8 leading-relaxed">
              Plus consent-first visitor analytics, heatmaps and form analytics behind a built-in consent banner in five languages. EU-hosted.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center xl:justify-start items-center">
              <Link to="/auth">
                <Button size="lg" className="group bg-gradient-primary">
                  Create free account
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform motion-reduce:transition-none" />
                </Button>
              </Link>
              <Link to="/tracking-check/">
                <Button variant="outline" size="lg" className="bg-background/80 backdrop-blur">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Check what your site sends
                </Button>
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center xl:justify-start gap-x-6 gap-y-2 text-sm font-medium text-foreground/70">
              <li className="flex items-center"><Shield className="h-4 w-4 mr-2 text-primary" aria-hidden="true" />EU-hosted</li>
              <li className="flex items-center"><Cookie className="h-4 w-4 mr-2 text-primary" aria-hidden="true" />Cookieless mode</li>
              <li className="flex items-center"><Code className="h-4 w-4 mr-2 text-primary" aria-hidden="true" />REST API + MCP</li>
            </ul>
          </div>
        </div>
      </section>

      {/* AI traffic */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="AI traffic"
            title="Not all AI traffic is equal"
            intro="A training crawler and ChatGPT fetching your page for a real user look alike in a server log. CortIQ sorts every AI visit into one of three groups, server-side from the request or in the browser after consent."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {BOT_CATEGORIES.map((category) => {
              const style = CATEGORY_STYLE[category];
              const Icon = style.icon;
              return (
                <Card key={category}>
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`h-6 w-6 ${style.tone}`} aria-hidden="true" />
                      <Badge variant="secondary">{style.tag}</Badge>
                    </div>
                    <CardTitle className="text-xl">{BOT_CATEGORY_META[category].label}</CardTitle>
                    <CardDescription className="text-base">{BOT_CATEGORY_META[category].description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">For example:</span> {examplesFor(category)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
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

      {/* Free tools */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <SectionHeader
            eyebrow="Free tools"
            title="Check any site, with or without CortIQ installed"
            intro="Two tools that answer the questions that come up before an audit, a relaunch or a new tag."
          />
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader>
                <ShieldCheck className="h-8 w-8 text-primary mb-2" aria-hidden="true" />
                <CardTitle>Tracking Check</CardTitle>
                <CardDescription className="text-base">
                  A real browser visits the site before and after the cookie banner is answered and records every request and cookie.
                  See what loads before the visitor answers, what still loads after "Necessary only", and compare an old site with its replacement before launch.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="text-xs text-muted-foreground mb-3">Free with a CortIQ account.</p>
                <Link to="/tracking-check/">
                  <Button variant="outline">How Tracking Check works <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>
                </Link>
              </CardContent>
            </Card>
            <Card className="flex flex-col">
              <CardHeader>
                <FileSearch className="h-8 w-8 text-primary mb-2" aria-hidden="true" />
                <CardTitle>GTM Audit</CardTitle>
                <CardDescription className="text-base">
                  Drop a Google Tag Manager export and get a report of every tag, which vendor it sends to and which consent it is set to wait for.
                  The file is read in your browser and never uploaded.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <p className="text-xs text-muted-foreground mb-3">Free, no account needed.</p>
                <Link to="/gtm-audit/">
                  <Button variant="outline">Audit a GTM container <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Consent and the law */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Consent and the law"
            title="Consent built in, in five languages"
            intro="Browser analytics waits for consent, unless you switch on aggregate mode. The banner, the consent log and the policy texts are part of the product, so the measurement and the legal side are set up together."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {BANNER_POINTS.map((p, i) => (
              <div key={p.title} className="rounded-lg border p-5">
                <div className="flex items-center gap-2 mb-2">
                  {i === 0 ? <Languages className="h-5 w-5 text-primary" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />}
                  <h3 className="font-semibold">{p.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>

          <h3 className="text-xl font-bold mb-4 text-center">Three ways to measure visitors</h3>
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {MODES.map((m) => (
              <Card key={m.title}>
                <CardHeader>
                  <CardTitle className="text-lg">{m.title}</CardTitle>
                  <CardDescription className="text-sm">{m.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-xl">How we read the rules</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                {LEGAL_BASES.map((b) => (
                  <div key={b.title}>
                    <h4 className="font-semibold mb-2">{b.title}</h4>
                    <p className="text-sm text-muted-foreground">{b.text}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
                <p>
                  <strong className="text-foreground">Before the install code is shown,</strong> the site owner confirms a checklist of what the
                  privacy policy must cover. The confirmation is logged with its version and asked again when the checklist changes.
                </p>
                <p>
                  <strong className="text-foreground">In development:</strong> rules per jurisdiction (EU/EEA, UK, US states, Brazil, Canada).
                  CortIQ already records which country each consent was given from.
                </p>
                <p>CortIQ gives you the tools. The site operator makes the final legal assessment.</p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {LEGAL_DOCS.map((d) =>
                  d.to ? (
                    <Link key={d.label} to={d.to} className="inline-flex items-center text-primary hover:underline">
                      <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.label}
                    </Link>
                  ) : (
                    <a key={d.label} href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline">
                      <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.label}
                    </a>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Ads and attribution */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Ads and attribution"
            title="Conversions you can trust, from consented visits"
            intro="Paid traffic is measured with the same consent rules as everything else, and the data that goes back to Google Ads is the data your CRM qualified."
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ATTRIBUTION.map((a) => (
              <Card key={a.title}>
                <CardHeader>
                  <Target className="h-6 w-6 text-primary mb-2" aria-hidden="true" />
                  <CardTitle className="text-lg">{a.title}</CardTitle>
                  <CardDescription className="text-sm">{a.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Also works next to GA4: keep it behind the same banner, with Consent Mode v2 if you want it.
          </p>
        </div>
      </section>

      {/* Operations */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Built to run"
            title="Measurement that tells you when it breaks"
            intro="Installed once, then watched: CortIQ checks the site and its own snippet, and the scripts can be pinned so they never change under you."
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {OPERATIONS.map((o) => (
              <div key={o.title} className="rounded-lg border p-5">
                <o.icon className="h-6 w-6 text-primary mb-3" aria-hidden="true" />
                <h3 className="font-semibold mb-2">{o.title}</h3>
                <p className="text-sm text-muted-foreground">{o.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/integrations/" className="inline-flex items-center text-primary font-medium hover:underline">
              See all integrations <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="py-20 px-4 bg-gradient-primary text-white">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Know what kind of traffic you have</h2>
          <p className="text-lg opacity-95 mb-8">
            CortIQ is free during beta. Create an account and add your site, or ask Expandtalk Corporation AB a question first.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth">
              <Button size="lg" variant="secondary" className="group">
                <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
                Create free account
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform motion-reduce:transition-none" />
              </Button>
            </Link>
            <Link to="/contact/">
              <Button size="lg" variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white">
                <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
                Contact us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
};

export default Index;
