import { Link } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const STEPS = [
  { title: "Enter the address", text: "Pick a few pages: the homepage and pages with forms, such as contact or demo. Suggest from sitemap helps you choose." },
  { title: "A real browser visits each page", text: "Without answering the banner, after \"Reject all\", after \"Accept all\", and with only statistics or only marketing accepted. Every request, cookie and Consent Mode signal is recorded." },
  { title: "You get a report", text: "Findings ranked by priority, each with evidence, a suggested fix and who typically owns it: developer, tag manager, consent banner or legal. Share it with a link." },
];

export default function TrackingCheckLanding() {
  useSEO(seoFor("/tracking-check/"));

  return (
    <PublicLayout>
      <section className="container mx-auto px-4 py-16 text-center">
        <Badge variant="secondary" className="mb-4">Free with a CortIQ account</Badge>
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">Tracking Check</h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
          See what a website loads and stores before and after visitors answer the cookie banner, or check that a new
          site keeps redirects, tracking and consent intact before launch. Works on any site, with or without CortIQ installed.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to={START}>
            <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
              Start a check <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
            </Button>
          </Link>
          <Link to={`/auth?next=${encodeURIComponent(START)}`}>
            <Button size="lg" variant="outline" className="hover-lift">Create free account</Button>
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <div className="grid gap-8 md:grid-cols-2">
          {USE_CASES.map((u) => (
            <Card key={u.mode} className="hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <u.icon className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <CardTitle className="text-2xl">{u.title}</CardTitle>
                <CardDescription className="text-base">{u.lead}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {u.points.map((p) => (
                  <div key={p} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden />
                    <span>{p}</span>
                  </div>
                ))}
                <p className="pt-2 text-sm text-muted-foreground">Choose <span className="font-medium text-foreground">{u.mode}</span> when you start the check.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <ol className="grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="space-y-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">{i + 1}</span>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 max-w-3xl space-y-6">
        <h2 className="text-3xl font-bold">Good to know</h2>
        <div className="space-y-4 text-muted-foreground">
          <p>
            The report is technical evidence of what the site does, not a legal assessment. Items marked
            <span className="font-medium text-foreground"> Verify </span>
            load something that may be necessary for a feature the visitor asked for, such as a chat or a booking widget;
            whoever is responsible for the site decides.
          </p>
          <p>
            Signed-in users can run 3 checks per 24 hours, with up to 5 pages each. Agencies and larger migrations that need
            more can contact <a className="text-primary underline" href="mailto:info@expandtalk.se">info@expandtalk.se</a>.
          </p>
          <p>Sites behind a password (basic auth) can be checked too. The credentials are stored encrypted only while the check runs.</p>
        </div>
        <Link to={START}>
          <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
            Start a check <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
          </Button>
        </Link>
      </section>
    </PublicLayout>
  );
}
