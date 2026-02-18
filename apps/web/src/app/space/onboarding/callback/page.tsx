import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";
import CallbackClient from "@/components/onboarding/callback-client";

export default async function OnboardingCallbackPage() {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <CallbackClient />
    </main>
  );
}
