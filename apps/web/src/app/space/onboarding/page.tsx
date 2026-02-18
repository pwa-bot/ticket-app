import { redirect } from "next/navigation";

// Onboarding is now part of Settings
export default function OnboardingPage() {
  redirect("/space/settings");
}
