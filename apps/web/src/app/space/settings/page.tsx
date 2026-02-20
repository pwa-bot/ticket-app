import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";
import SettingsClient from "@/components/settings/settings-client";
import { buildGithubAuthPath, withSearchParams } from "@/lib/auth-return-to";

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const token = await getAccessTokenFromCookies();
  const resolvedSearchParams = await searchParams;

  if (!token) {
    redirect(buildGithubAuthPath(withSearchParams("/space/settings", resolvedSearchParams)));
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <SettingsClient />
      </div>
    </main>
  );
}
