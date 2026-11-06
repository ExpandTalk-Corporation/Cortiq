import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Ban, Check, Cookie, FileSearch, Globe, KeyRound, Mail, Route, ShieldCheck, Shuffle, SlidersHorizontal, Tags, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PublicLayout from "@/components/PublicLayout";
import { ReportView } from "@/components/tracking-check/ReportView";
import { TRACKING_CHECK_SAMPLE as SAMPLE } from "@/data/trackingCheckSample";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";

const START = "/tracking-check/new";

function CheckForm({ id, size = "lg" }: { id: string; size?: "lg" | "md" }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const site = url.trim();
    navigate(site ? `${START}?url=${encodeURIComponent(site)}` : START);
  };
  const tall = size === "lg" ? "h-14 text-lg" : "h-12";
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 sm:flex-row">
      <label htmlFor={id} className="sr-only">Website address</label>
      <div className="relative flex-1">
        <Globe className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id={id} type="text" inputMode="url" autoComplete="url" placeholder="www.example.com" value={url}
          onChange={(e) => setUrl(e.target.value)} className={`${tall} bg-background pl-12 shadow-sm`} />
      </div>
      <Button type="submit" size="lg" className={`group ${tall} bg-gradient-primary px-7`}>
        Check my website
        <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
      </Button>
    </form>
  );
}

type Shown = "fail" | "warning" | "manual" | "pass";
const STATUS: Record<Shown, { label: string; className: string }> = {
  fail: { label: "Problems", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  warning: { label: "To review", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  manual: { label: "Verify", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  pass: { label: "OK", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
};
const OWNER: Record<string, string> = {
  developer: "Developer", gtm: "Tag manager", cmp: "Cookie banner", marketing: "Marketing", legal: "Controller / legal",
};

/** Hero card: the top of the sample report, so the visitor sees the result before reading about the tool. */
function ReportPreview() {
  const top = SAMPLE.findings.filter((f) => f.status !== "pass").slice(0, 5);
  return (
    <a href="#sample" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open the sample report">
      <Card className="border-primary/20 bg-background/90 shadow-2xl backdrop-blur transition-transform hover:-translate-y-1 motion-reduce:transition-none">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            </div>
            <span className="text-xs text-muted-foreground">www.example.com · sample data</span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b px-5 py-4 text-center">
            {(["fail", "manual", "pass"] as const).map((s) => (
              <div key={s} className={`rounded-lg py-2.5 ${STATUS[s].className}`}>
                <div className="text-2xl font-bold">{SAMPLE.summary.counts[s]}</div>
                <div className="text-xs">{STATUS[s].label}</div>
              </div>
            ))}
          </div>
          <ul className="divide-y">
            {top.map((f) => (
              <li key={f.checkKey} className="flex items-start gap-3 px-5 py-3">
                <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS[f.status as Shown].className}`}>
                  {f.status === "manual" ? "verify" : f.status}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{f.title}</p>
                  {f.typicalOwner && <p className="text-xs text-muted-foreground">Usually owned by: {OWNER[f.typicalOwner]}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-sm font-medium text-primary">See the evidence and the fix for each finding ↓</p>
        </CardContent>
      </Card>
    </a>
  );
}

const MIGRATION_ROWS: { label: string; before: string; after: string; ok: boolean }[] = [
  { label: "/our-services", before: "200", after: "301 → /services", ok: true },
  { label: "gclid on /contact-us", before: "kept", after: "lost in redirect", ok: false },
  { label: "Google Analytics 4", before: "G-AB12CD", after: "G-AB12CD", ok: true },
  { label: "Meta Pixel", before: "loads", after: "missing", ok: false },
  { label: "HubSpot form", before: "on /contact-us", after: "on /contact", ok: true },
];

function MigrationPreview() {
  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <div className="grid grid-cols-[1.2fr_1fr_1.2fr] gap-2 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span>Check</span><span>Current site</span><span>New site</span>
      </div>
      {MIGRATION_ROWS.map((r) => (
        <div key={r.label} className="grid grid-cols-[1.2fr_1fr_1.2fr] items-center gap-2 border-t px-3 py-2">
          <span className="truncate font-medium">{r.label}</span>
          <span className="truncate text-muted-foreground">{r.before}</span>
          <span className={`flex min-w-0 items-center gap-1.5 ${r.ok ? "" : "font-medium text-red-700 dark:text-red-400"}`}>
            {r.ok ? <Check className="h-4 w-4 shrink-0 text-green-500" aria-label="OK" /> : <X className="h-4 w-4 shrink-0 text-red-500" aria-label="Problem" />}
            <span className="truncate">{r.after}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ConsentPreview() {
  const rows = [
    { state: "Before the choice", items: ["Google Analytics stores _ga", "No Consent Mode signal (gcs=G1--)"], ok: false },
    { state: "After \"Reject all\"", items: ["Meta Pixel stores _fbp"], ok: false },
    { state: "After \"Accept all\"", items: ["Google is told consent was granted (G111)"], ok: true },
  ];
  return (
    <div className="space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.state} className="rounded-lg border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{r.state}</p>
          {r.items.map((i) => (
            <p key={i} className="mt-1 flex items-center gap-1.5">
              {r.ok ? <Check className="h-4 w-4 shrink-0 text-green-500" aria-label="OK" /> : <X className="h-4 w-4 shrink-0 text-red-500" aria-label="Problem" />}
              {i}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

const USE_CASES = [
  {
    icon: ShieldCheck,
    title: "Cookie & consent audit",
    lead: "For site owners, marketers and whoever answers for the consent banner.",
    points: [
      "What loads before the visitor has answered the banner, and what still loads after \"Reject all\"",
      "Which consent category Google Analytics, Google Ads, Meta, LinkedIn, HubSpot and B2B identification tools wait for",
      "What Google is told: the Consent Mode v2 signals in every request",
    ],
    preview: <ConsentPreview />,
    cta: "Check consent",
    to: START,
  },
  {
    icon: Shuffle,
    title: "Website migration audit",
    lead: "For agencies and developers before a new site goes live: compare the current site with the new one.",
    points: [
      "Old URLs redirect permanently to working pages",
      "UTM parameters and click IDs (gclid, fbclid, msclkid) survive the redirects",
      "The same tags, IDs and forms load, with the same consent behaviour and no CSP blocks",
    ],
    preview: <MigrationPreview />,
    cta: "Compare two sites",
    to: `${START}?mode=comparison`,
  },
];

const EXAMPLES = [
  {
    problem: "Google Analytics stores _ga before the visitor chooses",
    fix: "Give the GA4 tag a consent requirement in GTM, or let the cookie banner block it until Statistics is accepted.",
    owner: "Cookie banner or tag manager",
  },
  {
    problem: "The thank-you page sends the visitor's email address to Meta",
    fix: "Redirect to a thank-you page without the address in the URL. Until then, strip it from page_location in GTM.",
    owner: "Developer",
  },
  {
    problem: "Google tags fire without any Consent Mode signal",
    fix: "Block the tags until consent, or set Consent Mode v2 defaults to denied first in <head>. The report includes the snippet.",
    owner: "Tag manager",
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

const DotPattern = () => (
  <div className="pointer-events-none absolute inset-0 opacity-10" aria-hidden>
    <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, hsl(var(--accent)) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
  </div>
);

export default function TrackingCheckLanding() {
  useSEO(seoFor("/tracking-check/"));

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4 py-12 md:py-16">
        <DotPattern />
        <div className="container relative z-10 mx-auto grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Badge className="mb-5 border-0 bg-gradient-primary text-white">Free website tracking audit</Badge>
            <h1 className="mb-5 text-4xl font-black leading-[1.1] lg:text-5xl">
              Is your website tracking visitors <span className="text-gradient-primary">before they consent?</span>
            </h1>
            <p className="mb-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              See which cookies, pixels and tags load before the cookie banner is answered and after "Reject all",
              with the evidence and a fix for each finding.
            </p>
            <div className="max-w-xl">
              <CheckForm id="tc-hero-url" />
              <p className="mt-3 text-sm text-muted-foreground">
                Free with a CortIQ account · or <a href="#sample" className="font-medium text-primary underline-offset-4 hover:underline">view a sample report</a>
              </p>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-foreground/70">
              <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-primary" aria-hidden />No installation required</li>
              <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-primary" aria-hidden />Works on any website</li>
              <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-primary" aria-hidden />A fix and an owner for every finding</li>
            </ul>
          </div>
          <ReportPreview />
        </div>
      </section>

      <section id="sample" className="scroll-mt-20 px-4 py-20">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-4">Sample report</Badge>
            <h2 className="mb-4 text-3xl font-black md:text-4xl">This is what you get</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              A made-up site, checked by the same engine your report comes from. Click a finding to see the evidence, the fix and who usually owns it.
            </p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-muted/20 p-3 shadow-xl md:p-6">
            <ReportView summary={SAMPLE.summary} findings={SAMPLE.findings} mode="policy" baselineUrl={null}
              targetUrl={SAMPLE.targetUrl} finishedAt={null} collapsed />
          </div>
          <div className="mt-10 flex justify-center">
            <Link to={START}>
              <Button size="lg" className="group h-auto bg-gradient-primary px-8 py-4 text-lg">
                Check your own site
                <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 px-4 py-20">
        <div className="container mx-auto">
          <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">Two audits in one tool</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-muted-foreground">Choose the audit when you start the check.</p>
          <div className="grid gap-8 md:grid-cols-2">
            {USE_CASES.map((u) => (
              <Card key={u.title} className="flex flex-col border-primary/20 bg-background">
                <CardContent className="flex flex-1 flex-col gap-5 p-6 md:p-8">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary">
                      <u.icon className="h-6 w-6 text-white" aria-hidden />
                    </div>
                    <h3 className="text-2xl font-bold">{u.title}</h3>
                  </div>
                  <p className="text-muted-foreground">{u.lead}</p>
                  {u.preview}
                  <ul className="space-y-3">
                    {u.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={u.to} className="mt-auto">
                    <Button variant="outline" className="group w-full sm:w-auto">
                      {u.cta}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">Common findings, and how they are fixed</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-muted-foreground">Every finding in the report comes with a concrete next step.</p>
        <div className="grid gap-6 md:grid-cols-3">
          {EXAMPLES.map((e) => (
            <div key={e.problem} className="flex flex-col rounded-xl border bg-background">
              <div className="flex items-start gap-3 border-b p-5">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-label="Problem" />
                <p className="font-semibold leading-snug">{e.problem}</p>
              </div>
              <div className="flex flex-1 items-start gap-3 p-5">
                <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-label="Fix" />
                <div>
                  <p className="text-sm">{e.fix}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Usually owned by: {e.owner}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 px-4 py-20">
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

      <section className="container mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border p-6">
            <FileSearch className="mb-3 h-6 w-6 text-primary" aria-hidden />
            <h3 className="mb-2 font-bold">Evidence, not a verdict</h3>
            <p className="text-sm text-muted-foreground">
              The report shows what the site does technically. It is not a legal assessment or a certification: items marked Verify, such as a chat or podcast player, are for whoever is responsible for the site to decide.
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <Check className="mb-3 h-6 w-6 text-primary" aria-hidden />
            <h3 className="mb-2 font-bold">3 checks a day, free</h3>
            <p className="text-sm text-muted-foreground">
              Up to 5 pages per check with a free CortIQ account. Agencies and larger migrations can contact{" "}
              <a className="text-primary underline" href="mailto:info@expandtalk.se">info@expandtalk.se</a> for more.
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <KeyRound className="mb-3 h-6 w-6 text-primary" aria-hidden />
            <h3 className="mb-2 font-bold">Staging sites too</h3>
            <p className="text-sm text-muted-foreground">Sites behind a password (basic auth) can be checked. The credentials are stored encrypted only while the check runs.</p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container relative mx-auto overflow-hidden rounded-2xl bg-gradient-primary px-6 py-14 text-white">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">Check your site in a few minutes</h2>
            <p className="mb-8 text-lg text-white/85">Get a report you can share with your developer, agency or DPO.</p>
            <div className="rounded-xl bg-background p-3 text-foreground shadow-xl">
              <CheckForm id="tc-cta-url" size="md" />
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
