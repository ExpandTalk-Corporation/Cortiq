import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { HeroSection } from "@/components/home/HeroSection";
import { AiTrafficSection } from "@/components/home/AiTrafficSection";
import { RoutingSection } from "@/components/home/RoutingSection";
import { ToolsSection } from "@/components/home/ToolsSection";
import { ConsentSection } from "@/components/home/ConsentSection";
import { ModesSection } from "@/components/home/ModesSection";
import { LegalSection } from "@/components/home/LegalSection";
import { AttributionSection } from "@/components/home/AttributionSection";
import { OperationsSection } from "@/components/home/OperationsSection";
import { ClosingCta } from "@/components/home/ClosingCta";

const Index = () => {
  useSEO(seoFor("/"));

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <HeroSection />
      <AiTrafficSection />
      <RoutingSection />
      <ToolsSection />
      <ConsentSection />
      <ModesSection />
      <LegalSection />
      <AttributionSection />
      <OperationsSection />
      <ClosingCta />
      <PublicFooter />
    </div>
  );
};

export default Index;
