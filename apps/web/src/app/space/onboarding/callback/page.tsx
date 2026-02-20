import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";
import CallbackClient from "@/components/onboarding/callback-client";

function CallbackFallback() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Loading installation callback...
    </div>
  );
}

export default async function OnboardingCallbackPage() {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/api/auth/github");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Suspense fallback={<CallbackFallback />}>
        <CallbackClient />
      </Suspense>
    </main>
  );
}
