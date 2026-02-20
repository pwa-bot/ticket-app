import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

interface BoardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const repoParam = resolvedSearchParams.repo;
  const repo = typeof repoParam === "string" ? repoParam : undefined;

  if (!repo) {
    redirect("/space");
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    redirect("/space");
  }

  redirect(`/space/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`);
}
