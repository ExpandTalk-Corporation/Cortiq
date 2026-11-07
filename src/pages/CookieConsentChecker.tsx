import { Link } from "react-router-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PublicLayout from "@/components/PublicLayout";
import { CheckForm, ConsentPreview, DotPattern, Faq } from "@/components/tracking-check/LandingParts";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";

const STATES = [
  {
    title: "Before the choice",
    text: "The page loads and nobody answers the banner. Many consent problems show up here: analytics or ad tags that start at once, or cookies like _ga and _fbp that are stored before the visitor has said anything.",
  },
  {
    title: "After \"Reject all\"",
    text: "The browser rejects through the banner and reloads the page. Anything that still sends data to Google, Meta, LinkedIn, HubSpot or an unknown third party is listed with the request as evidence.",
  },
  {
    title: "After \"Accept all\"",
    text: "Confirms that your tags actually run once consent is given, and that Google is told so. A banner that blocks too much costs you data without anyone noticing.",
  },
  {
    title: "One category at a time",
    text: "Only Statistics, then only Marketing. Google Analytics is usually mapped to Statistics; Google Ads, Meta and LinkedIn to Marketing. The report shows what actually loads in each.",
  },
];

const SIGNALS = [
  { value: "G100", meaning: "ad_storage and analytics_storage denied. Expected before the choice and after \"Reject all\" with Consent Mode advanced. With basic mode, no Google request is sent before consent." },
  { value: "G111", meaning: "ad_storage and analytics_storage granted. Expected after \"Accept all\". Before the choice it means the defaults are set to granted for the region the check runs from." },
  { value: "G101", meaning: "Only analytics_storage granted (G110: only ad_storage). Typical when a single category is accepted." },
  { value: "G1--", meaning: "No consent state set for ad_storage or analytics_storage. Not a fault in itself if the tags wait for consent; a finding to review if they fire before it." },
];

const PROBLEMS = [
  { problem: "GA4 or the Meta Pixel fires before the banner is answered", fix: "Give the tag a consent requirement in GTM, or let the banner block it until the right category is accepted." },
  { problem: "Tags keep running after \"Reject all\"", fix: "Usually a hardcoded script outside the tag manager, or a tag without consent settings. The report names the domain and the page." },
  { problem: "Consent Mode defaults are set to granted", fix: "Set ad_storage, analytics_storage, ad_user_data and ad_personalization to denied by default before any Google tag loads, at least for visitors in the EEA. The report includes the snippet." },
  { problem: "The banner asks again on every page", fix: "The choice is not stored, for example because of the cookie domain or a cache rule. Visitors are asked again on every page." },
  { problem: "An email address in a thank-you URL reaches Meta or Google", fix: "Redirect without the address in the URL, or strip it from page_location before tags read it." },
];

const FAQ = [
  {
    q: "Which cookie banners does it work with?",
    a: "The browser answers Cookiebot, OneTrust, CookieYes, Complianz, Dynamicweb and the CortIQ banner through their own APIs. Other banners are answered by clicking the button with a matching label. If a state cannot be reached, the report says so instead of guessing.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. The check visits your public pages like a visitor would. Sites behind a password (basic auth), such as staging, can be checked too.",
  },
  {
    q: "Does a clean report mean my site follows the cookie and data protection rules?",
    a: "No. The report shows what your site does technically on the pages checked, at the time of the check: which cookies, requests and signals appear in each consent state. Whether that is lawful under the ePrivacy rules and the GDPR depends on your purposes, legal basis and banner text, which the controller assesses. Items marked Verify are left for that assessment.",
  },
  {
    q: "We don't use Google Consent Mode. Is that a problem?",
    a: "Not in itself: no law requires Consent Mode. If your Google tags wait for consent, the report notes that Consent Mode is missing as a decision to make, not as a fault. Some Google Ads features depend on consent signals, so check Google's requirements for your account. If tags fire before consent, the report flags it either way.",
  },
  {
    q: "How long does a check take?",
    a: "A few minutes for five pages. Each page is loaded several times, once per consent state, in a real browser.",
  },
  {
    q: "What does it cost?",
    a: "It is free during the beta with a CortIQ account: three checks a day, up to five pages each.",
  },
];

export default function CookieConsentChecker() {
  useSEO(seoFor("/cookie-consent-checker/"));

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4 py-12 md:py-16">
        <DotPattern />
        <div className="container relative z-10 mx-auto grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Badge className="mb-5 border-0 bg-gradient-primary text-white">Free cookie consent checker</Badge>
            <h1 className="mb-5 text-4xl font-black leading-[1.1] lg:text-5xl">
              Check what your site loads <span className="text-gradient-primary">before and after the cookie banner</span>
            </h1>
            <p className="mb-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              A real browser visits your pages without answering the banner, after "Reject all" and after "Accept all",
              and lists the cookies, pixels and Consent Mode signals it sees on each page.
            </p>
            <div className="max-w-xl">
              <CheckForm id="ccc-hero-url" />
              <p className="mt-3 text-sm text-muted-foreground">
                Free with a CortIQ account · <Link to="/tracking-check/" className="font-medium text-primary underline-offset-4 hover:underline">see a sample report</Link>
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-background/90 p-5 shadow-2xl">
            <p className="mb-3 text-xs text-muted-foreground">www.example.com · sample data</p>
            <ConsentPreview />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">Each consent state, tested separately</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-muted-foreground">
          Opening the site and looking at the banner shows one state. Problems usually hide in the others.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {STATES.map((s, i) => (
            <div key={s.title} className="rounded-xl border bg-background p-6">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mb-2 text-lg font-bold">{s.title}</h3>
              <p className="text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 px-4 py-20">
        <div className="container mx-auto max-w-4xl">
          <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">What Google is told</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-lg text-muted-foreground">
            Google Analytics and Google Ads requests carry the consent state for ad_storage and analytics_storage in the gcs parameter.
            The check reads it in every state, so you see what Google receives rather than what the banner shows.
          </p>
          <div className="overflow-hidden rounded-xl border bg-background">
            {SIGNALS.map((s) => (
              <div key={s.value} className="grid gap-2 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[7rem_1fr]">
                <code className="font-mono text-base font-bold text-primary">gcs={s.value}</code>
                <p className="text-muted-foreground">{s.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto max-w-5xl px-4 py-20">
        <h2 className="mb-12 text-center text-3xl font-black md:text-4xl">Common cookie consent problems, and the fix</h2>
        <div className="space-y-4">
          {PROBLEMS.map((p) => (
            <div key={p.problem} className="grid gap-3 rounded-xl border bg-background p-5 md:grid-cols-2 md:gap-8">
              <p className="flex items-start gap-3 font-semibold">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-label="Problem" />{p.problem}
              </p>
              <p className="flex items-start gap-3 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-label="Fix" />{p.fix}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 px-4 py-20">
        <div className="container mx-auto max-w-3xl">
          <h2 className="mb-10 text-center text-3xl font-black md:text-4xl">Questions</h2>
          <Faq items={FAQ} />
          <p className="mt-10 text-center text-muted-foreground">
            Moving to a new site? The same tool compares the old and new site:{" "}
            <Link to="/website-migration-check/" className="font-medium text-primary underline-offset-4 hover:underline">website migration check</Link>.
          </p>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="container relative mx-auto overflow-hidden rounded-2xl bg-gradient-primary px-6 py-14 text-white">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">Check your cookie banner</h2>
            <p className="mb-8 text-lg text-white/85">Evidence for every finding, and a fix you can hand to your developer or agency.</p>
            <div className="rounded-xl bg-background p-3 text-foreground shadow-xl">
              <CheckForm id="ccc-cta-url" size="md" />
            </div>
            <Link to="/tracking-check/" className="mt-6 inline-flex items-center text-white/90 underline-offset-4 hover:underline">
              How Tracking Check works <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
