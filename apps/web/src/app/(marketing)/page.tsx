import { HeroSectionV2 } from "@/components/marketing/hero-section";
import { WhySection } from "@/components/marketing/why-section";
import { ProtocolSection } from "@/components/marketing/protocol-section";
import { AgentCLISection } from "@/components/marketing/agent-cli-section";
import { OverlaySection } from "@/components/marketing/overlay-section";
import { PricingTeaserSectionV2 } from "@/components/marketing/pricing-teaser-section";
import { FAQSection } from "@/components/marketing/faq-section";
import { FinalCTASectionV2 } from "@/components/marketing/final-cta-section";

export default function HomePage() {
  return (
    <>
      <HeroSectionV2 />
      <WhySection />
      <ProtocolSection />
      <AgentCLISection />
      <OverlaySection />
      <PricingTeaserSectionV2 />
      <FAQSection />
      <FinalCTASectionV2 />
    </>
  );
}
