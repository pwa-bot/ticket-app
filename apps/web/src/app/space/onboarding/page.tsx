import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";
import OnboardingClient from "@/components/onboarding/onboarding-client";

export default async function OnboardingPage() {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <OnboardingClient />
    </main>
  );
}
