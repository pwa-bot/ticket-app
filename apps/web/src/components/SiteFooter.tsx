import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
        <p>Git-native issue tracking for AI-first teams.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/docs" className="hover:text-slate-900">
            Docs
          </Link>
          <Link href="/security" className="hover:text-slate-900">
            Security
          </Link>
          <Link href="/pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          <Link href="/oss" className="hover:text-slate-900">
            OSS
          </Link>
          <Link href="/terms" className="hover:text-slate-900">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-slate-900">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
