import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";
import CallbackClient from "@/components/onboarding/callback-client";
import { buildGithubAuthPath, withSearchParams } from "@/lib/auth-return-to";

function CallbackFallback() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Loading installation callback...
    </div>
  );
}

interface OnboardingCallbackPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OnboardingCallbackPage({ searchParams }: OnboardingCallbackPageProps) {
  const token = await getAccessTokenFromCookies();
  const resolvedSearchParams = await searchParams;

  if (!token) {
    redirect(buildGithubAuthPath(withSearchParams("/space/onboarding/callback", resolvedSearchParams)));
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Suspense fallback={<CallbackFallback />}>
        <CallbackClient />
      </Suspense>
    </main>
  );
}
