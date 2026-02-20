import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/auth";
import OnboardingClient from "@/components/onboarding/onboarding-client";
import { buildGithubAuthPath, withSearchParams } from "@/lib/auth-return-to";

interface OnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const hasSession = await hasSessionCookie();
  const resolvedSearchParams = await searchParams;

  if (!hasSession) {
    redirect(buildGithubAuthPath(withSearchParams("/space/onboarding", resolvedSearchParams)));
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <OnboardingClient />
      </div>
    </main>
  );
}
