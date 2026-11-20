import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import heroAvif1280 from "@/assets/hero/hero-1280.avif";
import heroAvif1983 from "@/assets/hero/hero-1983.avif";
import heroWebp1280 from "@/assets/hero/hero-1280.webp";
import heroWebp1983 from "@/assets/hero/hero-1983.webp";
import heroMobileAvif from "@/assets/hero/hero-mobile-900.avif";
import heroMobileWebp from "@/assets/hero/hero-mobile-900.webp";
import heroMobileJpg from "@/assets/hero/hero-mobile-900.jpg";
import { ArrowRight, ShieldCheck, Shield, Cookie, Code } from "lucide-react";
import { AI_TRAFFIC_SOURCE_ID } from "./AiTrafficSection";

// Hero: one full-bleed photo. Its left edge fades to #f7f9fc, so the light-mode
// background matches it and a gradient in the same colour keeps the copy readable.
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#f7f9fc] dark:bg-background flex flex-col xl:flex-row xl:items-center xl:min-h-[640px]">
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

      <div className="container mx-auto relative z-10 w-full px-4 pt-12 pb-12 xl:py-20">
        <div className="max-w-2xl xl:max-w-[34rem] text-center xl:text-left mx-auto xl:mx-0">
          <Badge className="mb-6 bg-gradient-primary text-white border-0">Free during beta</Badge>
          <h1 className="text-4xl md:text-6xl xl:text-5xl font-black mb-4 text-gradient-primary leading-tight">
            Every AI visit, classified.
          </h1>
          <p className="text-xl md:text-2xl font-semibold text-foreground mb-6 leading-snug">
            On European sites, one AI bot visit for every 33 human visits
            {/* Short reference next to the figure it sources; the full source sentence is the footnote under the Europe vs North America figures. */}
            <a href={`#${AI_TRAFFIC_SOURCE_ID}`} className="ml-1 align-super whitespace-nowrap text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground">
              TollBit, H1 2026
            </a>
            . CortIQ shows which ones train on your content, which ones act for real users, and which ones cite you.
          </p>
          <p className="text-lg text-foreground/80 mb-8 leading-relaxed">
            Plus consent-first visitor analytics, heatmaps and form analytics behind a built-in consent banner in 13 languages. EU-hosted.
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
  );
}
