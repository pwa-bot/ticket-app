import AgentFirstSection from "@/components/AgentFirstSection";
import ComparisonSection from "@/components/ComparisonSection";
import DashboardOverlaySection from "@/components/DashboardOverlaySection";
import FAQSection from "@/components/FAQSection";
import FinalCTASection from "@/components/FinalCTASection";
import HeroSection from "@/components/HeroSection";
import PricingTeaserSection from "@/components/PricingTeaserSection";
import ProtocolSection from "@/components/ProtocolSection";

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <ProtocolSection />
      <AgentFirstSection />
      <DashboardOverlaySection />
      <ComparisonSection />
      <PricingTeaserSection />
      <FAQSection />
      <FinalCTASection />
    </main>
  );
}
