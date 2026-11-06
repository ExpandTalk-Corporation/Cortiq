import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Cookie, FileInput, KeyRound, Link2, Route, ShieldAlert, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PublicLayout from "@/components/PublicLayout";
import { CheckForm, DotPattern, Faq, MigrationPreview } from "@/components/tracking-check/LandingParts";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";

const CHECKLIST = [
  {
    icon: Route,
    title: "Old URLs redirect permanently",
    text: "List the addresses that change. Each one should answer with a single 301 or 308 to a working page. Temporary redirects, chains and 404s are flagged.",
  },
  {
    icon: Link2,
    title: "UTM tags and click IDs survive",
    text: "Pages are opened with utm_source, gclid, gbraid, wbraid, fbclid and msclkid. If a redirect or the new framework drops them, paid traffic stops being attributed to the ad.",
  },
  {
    icon: Tags,
    title: "The same tags, with the same IDs",
    text: "Google Analytics 4, Google Ads, GTM, Meta, LinkedIn, HubSpot and more: what loads on the current site should load on the new one, with the same measurement IDs.",
  },
  {
    icon: FileInput,
    title: "Forms are still there",
    text: "HubSpot and Gravity Forms forms on the current site are looked for on the new site, by form ID. A missing form usually means missing conversions.",
  },
  {
    icon: Cookie,
    title: "Consent behaves the same way",
    text: "A new theme often brings a new cookie banner, or none. Both sites are tested before the choice and after \"Reject all\" and \"Accept all\".",
  },
  {
    icon: ShieldAlert,
    title: "No tags blocked by the CSP",
    text: "A stricter Content-Security-Policy on the new site can block analytics and ad tags without any visible error. Blocked requests are listed per tool.",
  },
];

const STEPS = [
  { title: "Enter both sites", text: "The current site, which shows how things should work, and the new one, for example the staging address." },
  { title: "Pick pages and old URLs", text: "The homepage, landing pages and pages with forms. Add the old addresses that change so their redirects are tested." },
  { title: "Fix before launch", text: "Every difference comes with evidence and a suggested fix. Share the report with your developer or agency with a link." },
];

const FAQ = [
  {
    q: "Can I check a staging site behind a password?",
    a: "Yes. Sites behind basic auth can be checked. The credentials are stored encrypted only while the check runs.",
  },
  {
    q: "When should I run the check?",
    a: "Before launch against staging, to catch differences while they are cheap to fix, and again right after launch against the live site.",
  },
  {
    q: "Does it crawl the whole site?",
    a: "No. You choose up to five pages per check, plus the old URLs to test. Suggest from sitemap helps you pick. Larger migrations can contact info@expandtalk.se for higher limits.",
  },
  {
    q: "Is this an SEO audit?",
    a: "Partly. Redirects and status codes are checked, but content, titles and rankings are not. The focus is that measurement keeps working: tags, parameters, forms and consent.",
  },
  {
    q: "What does it cost?",
    a: "It is free during the beta with a CortIQ account: three checks a day.",
  },
];

export default function WebsiteMigrationCheck() {
  useSEO(seoFor("/website-migration-check/"));

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4 py-12 md:py-16">
        <DotPattern />
        <div className="container relative z-10 mx-auto grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Badge className="mb-5 border-0 bg-gradient-primary text-white">Free website migration check</Badge>
            <h1 className="mb-5 text-4xl font-black leading-[1.1] lg:text-5xl">
              Launching a new website? <span className="text-gradient-primary">Make sure tracking survives.</span>
            </h1>
            <p className="mb-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Compare the current site with the new one before it goes live: redirects, UTM tags and click IDs,
              analytics and ad tags, forms and the cookie banner.
            </p>
            <div className="max-w-xl">
              <CheckForm id="wmc-hero-url" mode="comparison" placeholder="staging.example.com" />
              <p className="mt-3 text-sm text-muted-foreground">
                Enter the new site; you add the current site on the next step. Free with a CortIQ account.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-background/90 p-5 shadow-2xl">
            <p className="mb-3 text-xs text-muted-foreground">example.com → new.example.com · sample data</p>
            <MigrationPreview />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="mb-12 text-center">
          <ClipboardList className="mx-auto mb-4 h-8 w-8 text-primary" aria-hidden />
          <h2 className="mb-4 text-3xl font-black md:text-4xl">The migration checklist, run for you</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            The things that break quietly when a site is rebuilt, and are usually noticed weeks later in a campaign report.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKLIST.map((c) => (
            <div key={c.title} className="rounded-xl border bg-background p-6">
              <c.icon className="mb-3 h-6 w-6 text-primary" aria-hidden />
              <h3 className="mb-2 font-bold">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 px-4 py-20">
        <div className="container mx-auto">
          <h2 className="mb-12 text-center text-3xl font-black md:text-4xl">How the comparison works</h2>
          <ol className="grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="text-center md:text-left">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-white md:mx-0">{i + 1}</span>
                <h3 className="mb-2 text-xl font-bold">{s.title}</h3>
                <p className="text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-12 flex max-w-2xl items-start gap-3 rounded-xl border bg-background p-5">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Staging behind a password works too (basic auth). The credentials are stored encrypted only while the check runs.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="container mx-auto max-w-3xl">
          <h2 className="mb-10 text-center text-3xl font-black md:text-4xl">Questions</h2>
          <Faq items={FAQ} />
          <p className="mt-10 text-center text-muted-foreground">
            Only want to check the cookie banner on one site? Use the{" "}
            <Link to="/cookie-consent-checker/" className="font-medium text-primary underline-offset-4 hover:underline">cookie consent checker</Link>.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container relative mx-auto overflow-hidden rounded-2xl bg-gradient-primary px-6 py-14 text-white">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">Compare your sites before launch</h2>
            <p className="mb-8 text-lg text-white/85">Find the lost redirects, parameters and tags while they are still on staging.</p>
            <div className="rounded-xl bg-background p-3 text-foreground shadow-xl">
              <CheckForm id="wmc-cta-url" size="md" mode="comparison" placeholder="staging.example.com" />
            </div>
            <Link to="/tracking-check/" className="mt-6 inline-flex items-center text-white/90 underline-offset-4 hover:underline">
              See a sample report <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
