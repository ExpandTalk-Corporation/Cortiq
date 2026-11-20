import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ReportView } from "@/components/tracking-check/ReportView";
import { GtmAuditReport } from "@/components/gtm-audit/GtmAuditReport";
import { TRACKING_CHECK_SAMPLE } from "@/data/trackingCheckSample";
import { GTM_AUDIT_SAMPLE } from "@/data/gtmAuditSample";
import { CHECK_KEYS } from "../../../supabase/functions/_shared/gtm-audit/types";
import { SectionHeader } from "./SectionHeader";
import { BrowserFrame } from "./BrowserFrame";

/** The real report component at 60 % scale, cropped and faded. Not interactive: the tool page is one click away. */
function ToolPreview({ title, children }: { title: string; children: ReactNode }) {
  return (
    <BrowserFrame title={title}>
      {/* React 18 passes inert through only as a string attribute. */}
      <div className="relative h-72 overflow-hidden" aria-hidden="true" {...({ inert: "" } as Record<string, string>)}>
        <div className="w-[166.667%] origin-top-left scale-[0.6] p-4">{children}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>
    </BrowserFrame>
  );
}

export function ToolsSection() {
  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Free tools"
          title="Check any site, with or without CortIQ installed"
          intro="Two tools that answer the questions that come up before an audit, a relaunch or a new tag."
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col overflow-hidden">
            <div className="p-4 pb-0">
              <ToolPreview title="Tracking Check · example report">
                <ReportView summary={TRACKING_CHECK_SAMPLE.summary} findings={TRACKING_CHECK_SAMPLE.findings} mode="policy"
                  baselineUrl={null} targetUrl={TRACKING_CHECK_SAMPLE.targetUrl} finishedAt={null} collapsed />
              </ToolPreview>
            </div>
            <CardHeader>
              <CardTitle>Tracking Check</CardTitle>
              <CardDescription className="text-base">
                A real browser visits the site before and after the cookie banner is answered and records every request and cookie.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <p className="text-xs text-muted-foreground mb-3">Free with a CortIQ account.</p>
              <Link to="/tracking-check/">
                <Button variant="outline">How Tracking Check works <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>
              </Link>
            </CardContent>
          </Card>
          <Card className="flex flex-col overflow-hidden">
            <div className="p-4 pb-0">
              <ToolPreview title="GTM Audit · example container">
                <GtmAuditReport report={GTM_AUDIT_SAMPLE} sample />
              </ToolPreview>
            </div>
            <CardHeader>
              <CardTitle>GTM Audit</CardTitle>
              <CardDescription className="text-base">
                Drop a Google Tag Manager export. A tag engine classifies every tag by vendor, consent, destinations, dependencies and
                conversions, then runs {CHECK_KEYS.length} checks. The file is read in your browser and never uploaded.
              </CardDescription>
              <p className="text-xs text-muted-foreground">
                Findings describe how the container is configured, not whether a tag actually fires.
              </p>
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
