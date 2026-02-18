"use client";

interface RateLimitErrorProps {
  error: string;
  onRetry?: () => void;
}

export function isRateLimitError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("api rate") ||
    lower.includes("403") ||
    lower.includes("too many requests") ||
    lower.includes("secondary rate")
  );
}

export function RateLimitError({ error, onRetry }: RateLimitErrorProps) {
  const isRateLimit = isRateLimitError(error);

  if (!isRateLimit) {
    // Generic error
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // Rate limit specific error
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⏳</span>
        <div className="flex-1">
          <h3 className="font-medium text-amber-900">GitHub is asking us to slow down</h3>
          <p className="mt-1 text-sm text-amber-700">
            We've made too many requests. This usually resolves in a few minutes.
          </p>
          
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
              >
                Try again
              </button>
            )}
            
            <a
                href="/space/settings"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Install GitHub App for faster sync →
              </a>
          </div>

          <p className="mt-3 text-xs text-amber-600">
            Installing our GitHub App gives you real-time updates without rate limits.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SyncError({ 
  errorCode, 
  errorMessage,
  onRetry,
}: { 
  errorCode?: string | null;
  errorMessage?: string | null;
  onRetry?: () => void;
}) {
  if (!errorCode && !errorMessage) return null;

  // Map error codes to friendly messages
  const friendlyMessages: Record<string, { title: string; description: string; icon: string }> = {
    rate_limit: {
      title: "GitHub is asking us to slow down",
      description: "We've made too many requests. This usually resolves in a few minutes.",
      icon: "⏳",
    },
    repo_fetch_failed: {
      title: "Couldn't load repository",
      description: "GitHub didn't respond. Try refreshing in a moment.",
      icon: "🔌",
    },
    index_missing: {
      title: "No tickets found",
      description: "This repo needs a .tickets folder. Run 'ticket init' to set it up.",
      icon: "📭",
    },
    index_invalid: {
      title: "Ticket index needs rebuilding",
      description: "Run 'ticket rebuild-index' and push to fix this.",
      icon: "🔧",
    },
    permission_denied: {
      title: "Access denied",
      description: "You might need to reconnect your GitHub account.",
      icon: "🔒",
    },
  };

  const mapped = friendlyMessages[errorCode ?? ""] ?? {
    title: "Something went wrong",
    description: errorMessage || "An unexpected error occurred.",
    icon: "⚠️",
  };

  const isRateLimit = errorCode === "rate_limit" || 
    (errorMessage && isRateLimitError(errorMessage));

  return (
    <div className={`rounded-lg border p-4 ${isRateLimit ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{mapped.icon}</span>
        <div className="flex-1">
          <h3 className={`font-medium ${isRateLimit ? "text-amber-900" : "text-red-900"}`}>
            {mapped.title}
          </h3>
          <p className={`mt-1 text-sm ${isRateLimit ? "text-amber-700" : "text-red-700"}`}>
            {mapped.description}
          </p>
          
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  isRateLimit 
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200" 
                    : "bg-red-100 text-red-800 hover:bg-red-200"
                }`}
              >
                Try again
              </button>
            )}
            
            {isRateLimit && (
              <a
                href="/space/settings"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Install GitHub App →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
