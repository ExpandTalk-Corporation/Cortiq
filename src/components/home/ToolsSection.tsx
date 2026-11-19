import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, FileSearch } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

export function ToolsSection() {
  return (
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
  );
}
