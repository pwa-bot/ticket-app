import Link from "next/link";

export default function FinalCTASection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-8 text-slate-100">
        <h2 className="text-3xl font-semibold tracking-tight">Replace issue tracking with something your agents can actually use.</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/cli" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white">
            Install CLI
          </Link>
          <Link href="/dashboard" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-100">
            Connect GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}
