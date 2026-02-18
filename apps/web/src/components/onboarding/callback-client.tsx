"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function CallbackClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const installationId = searchParams.get("installation_id");
  
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!installationId) {
        // No installation_id means user just came back without installing
        // Redirect to onboarding
        router.replace("/space/onboarding");
        return;
      }

      try {
        const res = await fetch("/api/github/installations/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installationId: Number(installationId) }),
        });

        const json = await res.json();
        
        if (!json.ok) {
          throw new Error(json.error ?? "Failed to register installation");
        }

        setStatus("done");
        
        // Redirect to onboarding to select repos
        setTimeout(() => {
          router.replace("/space/onboarding");
        }, 1000);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
  }, [installationId, router]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="text-sm font-medium text-slate-900">
        {status === "working" && "Registering GitHub App installation..."}
        {status === "done" && "✓ Installation registered!"}
        {status === "error" && "Error"}
      </div>
      
      {status === "working" && (
        <div className="mt-2 text-sm text-slate-600">
          Please wait while we set up your connection.
        </div>
      )}
      
      {status === "done" && (
        <div className="mt-2 text-sm text-slate-600">
          Redirecting to repo selection...
        </div>
      )}
      
      {status === "error" && (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <a
            href="/space/onboarding"
            className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Try again
          </a>
        </div>
      )}
    </div>
  );
}
