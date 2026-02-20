import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";
import OnboardingClient from "@/components/onboarding/onboarding-client";

export default async function OnboardingPage() {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/api/auth/github");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <OnboardingClient />
      </div>
    </main>
  );
}
