import { Link } from "react-router-dom";
import {
  ArrowRight, Ban, Check, Chrome, Cookie, FileSearch, Link2, Mail, Route, Share2, ShieldCheck, Shuffle, SlidersHorizontal, Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import PublicLayout from "@/components/PublicLayout";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";

const START = "/tracking-check/new";

const USE_CASES = [
  {
    icon: ShieldCheck,
    title: "Does my site respect the cookie choice?",
    lead: "For site owners, marketers and whoever answers for the consent banner.",
    points: [
      "Cookies and third-party tags that load before the visitor has answered the banner",
      "What still loads after \"Reject all\"",
      "Which consent category Google Analytics, Google Ads, Meta, LinkedIn, HubSpot and B2B identification tools wait for",
      "Google Consent Mode v2 defaults and Enhanced Conversions",
    ],
    mode: "Consent policy",
  },
  {
    icon: Shuffle,
    title: "Moving or rebuilding the site?",
    lead: "For agencies and developers before a new site goes live: compare the current site with the new one.",
    points: [
      "Old URLs redirect to the right pages on the new site",
      "UTM parameters and click IDs (gclid, fbclid, msclkid) survive the redirects",
      "The same tags and measurement IDs load, with the same consent behaviour",
      "Content Security Policy does not block tags the old site relied on",
    ],
    mode: "Comparison",
  },
];

const CHECKS = [
  { icon: Cookie, title: "Before the choice", text: "Cookies, storage and requests while the banner is still unanswered." },
  { icon: Ban, title: "After \"Reject all\"", text: "Anything that keeps tracking once the visitor has said no." },
  { icon: SlidersHorizontal, title: "Consent categories", text: "Statistics only, marketing only: each tool waits for its own category." },
  { icon: Tags, title: "What Google receives", text: "The Consent Mode state in each Google request, read from gcs and gcd." },
  { icon: Mail, title: "Personal data in URLs", text: "Email addresses in page URLs that tags pass on to Google, Meta or LinkedIn." },
  { icon: Route, title: "Redirects and parameters", text: "Old URLs, UTM tags and click IDs across a migration." },
];

const STEPS = [
  { title: "Enter the address", text: "Pick a few pages: the homepage and pages with forms, such as contact or demo. Suggest from sitemap helps you choose." },
  { title: "A real browser visits each page", text: "Without answering the banner, after \"Reject all\", after \"Accept all\", and with only statistics or only marketing accepted." },
  { title: "You get a report", text: "Findings ranked by priority, each with evidence, a suggested fix and who typically owns it. Share it with a link." },
];

type Status = "fail" | "warning" | "verify" | "pass";
const STATUS_STYLE: Record<Status, string> = {
  fail: "bg-red-500/10 text-red-700 dark:text-red-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  verify: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  pass: "bg-green-500/10 text-green-700 dark:text-green-400",
};
const SAMPLE: { status: Status; title: string; owner: string }[] = [
  { status: "fail", title: "Google Analytics stores data on the device before the visitor chooses", owner: "Consent banner" },
  { status: "fail", title: "An email address is sent to 1 third party in the URL", owner: "Developer" },
  { status: "warning", title: "\"Accept all\" does not reach Google", owner: "Consent banner" },
  { status: "verify", title: "Verify Libsyn podcast player: it loads before the visitor chooses", owner: "Legal" },
  { status: "pass", title: "Nothing is tracked after \"Reject all\"", owner: "" },
];

function ReportPreview() {
  return (
    <Card className="border-primary/20 bg-background/80 shadow-xl backdrop-blur">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" aria-hidden />
          </div>
          <span className="text-xs text-muted-foreground">Example report · www.example.com</span>
        </div>
        <div className="grid grid-cols-4 gap-2 border-b px-5 py-4 text-center">
          {([["2", "fail"], ["1", "warning"], ["1", "verify"], ["9", "pass"]] as const).map(([n, s]) => (
            <div key={s} className={`rounded-md py-2 ${STATUS_STYLE[s]}`}>
              <div className="text-xl font-bold">{n}</div>
              <div className="text-xs capitalize">{s}</div>
            </div>
          ))}
        </div>
        <ul className="divide-y">
          {SAMPLE.map((f) => (
            <li key={f.title} className="flex items-start gap-3 px-5 py-3 text-left">
              <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS_STYLE[f.status]}`}>{f.status}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{f.title}</p>
                {f.owner && <p className="text-xs text-muted-foreground">Typical owner: {f.owner}</p>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const DotPattern = () => (
  <div className="pointer-events-none absolute inset-0 opacity-10" aria-hidden>
    <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, hsl(var(--accent)) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
  </div>
);

export default function TrackingCheckLanding() {
  useSEO(seoFor("/tracking-check/"));

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4 py-16 md:py-24">
        <DotPattern />
        <div className="container relative z-10 mx-auto grid items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <Badge className="mb-6 border-0 bg-gradient-primary text-white">Free with a CortIQ account</Badge>
            <h1 className="mb-6 text-4xl font-black leading-tight text-gradient-primary md:text-6xl">Tracking Check</h1>
            <p className="mb-4 text-xl font-semibold leading-snug text-foreground md:text-2xl">
              See what your site loads and sends before and after visitors answer the cookie banner.
            </p>
            <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
              Or check that a new site keeps redirects, tracking and consent intact before launch. Works on any site, with or without CortIQ installed.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              <Link to={START}>
                <Button size="lg" className="group h-auto bg-gradient-primary px-8 py-4 text-lg">
                  Start a check
                  <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
                </Button>
              </Link>
              <Link to={`/auth?next=${encodeURIComponent(START)}`}>
                <Button size="lg" variant="outline" className="h-auto bg-background/80 px-8 py-4 text-lg backdrop-blur">Create free account</Button>
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-foreground/70 lg:justify-start">
              <li className="flex items-center"><Chrome className="mr-2 h-4 w-4 text-primary" aria-hidden />Real Chrome browser</li>
              <li className="flex items-center"><FileSearch className="mr-2 h-4 w-4 text-primary" aria-hidden />Evidence for every finding</li>
              <li className="flex items-center"><Share2 className="mr-2 h-4 w-4 text-primary" aria-hidden />Shareable report</li>
            </ul>
          </div>
          <ReportPreview />
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">Two ways to use it</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-muted-foreground">Choose the mode when you start the check.</p>
        <div className="grid gap-8 md:grid-cols-2">
          {USE_CASES.map((u) => (
            <Card key={u.mode} className="border-primary/20 transition-shadow hover:shadow-lg">
              <CardContent className="space-y-4 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary">
                  <u.icon className="h-6 w-6 text-white" aria-hidden />
                </div>
                <div>
                  <h3 className="mb-2 text-2xl font-bold">{u.title}</h3>
                  <p className="text-muted-foreground">{u.lead}</p>
                </div>
                <ul className="space-y-3">
                  {u.points.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <Badge variant="secondary">Mode: {u.mode}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden bg-muted/30 px-4 py-20">
        <div className="container mx-auto">
          <h2 className="mb-12 text-center text-3xl font-black md:text-4xl">What the check looks at</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CHECKS.map((c) => (
              <div key={c.title} className="rounded-xl border bg-background p-6">
                <c.icon className="mb-3 h-6 w-6 text-primary" aria-hidden />
                <h3 className="mb-1 font-bold">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <h2 className="mb-12 text-center text-3xl font-black md:text-4xl">How it works</h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="text-center md:text-left">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-white md:mx-0">{i + 1}</span>
              <h3 className="mb-2 text-xl font-bold">{s.title}</h3>
              <p className="text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container mx-auto max-w-4xl px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border p-6">
            <FileSearch className="mb-3 h-6 w-6 text-primary" aria-hidden />
            <h3 className="mb-2 font-bold">Evidence, not a verdict</h3>
            <p className="text-sm text-muted-foreground">
              The report shows what the site does, not a legal assessment. Items marked Verify, such as a chat or booking widget, are for whoever is responsible for the site to decide.
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <Link2 className="mb-3 h-6 w-6 text-primary" aria-hidden />
            <h3 className="mb-2 font-bold">3 checks a day</h3>
            <p className="text-sm text-muted-foreground">
              Up to 5 pages per check. Agencies and larger migrations can contact{" "}
              <a className="text-primary underline" href="mailto:info@expandtalk.se">info@expandtalk.se</a> for more.
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <ShieldCheck className="mb-3 h-6 w-6 text-primary" aria-hidden />
            <h3 className="mb-2 font-bold">Staging sites too</h3>
            <p className="text-sm text-muted-foreground">Any staging address reachable without a password can be checked. Password-protected (basic auth) sites are not supported yet.</p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container relative mx-auto overflow-hidden rounded-2xl bg-gradient-primary px-6 py-14 text-center text-white">
          <h2 className="mb-4 text-3xl font-black md:text-4xl">Check your site in a few minutes</h2>
          <p className="mx-auto mb-8 max-w-xl text-lg text-white/85">Enter the address, pick a few pages, and get a report you can share with your developer, agency or DPO.</p>
          <Link to={START}>
            <Button size="lg" variant="secondary" className="group h-auto px-8 py-4 text-lg">
              Start a check
              <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
