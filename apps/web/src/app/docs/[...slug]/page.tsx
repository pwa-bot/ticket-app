import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getDocBySlug, listDocSlugs } from "@/lib/docs";

type DocPageProps = {
  params: Promise<{ slug?: string[] }>;
};

function normalizeSlug(parts: string[] | undefined): string {
  if (!parts || parts.length === 0) {
    return "index";
  }
  return parts.join("/");
}

export async function generateStaticParams() {
  return listDocSlugs().map((slug) => ({ slug: [slug] }));
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(normalizeSlug(slug));

  if (!doc) {
    return { title: "Docs" };
  }

  return {
    title: `${doc.title} | Docs`,
    description: doc.description,
  };
}

export default async function DocSlugPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = getDocBySlug(normalizeSlug(slug));

  if (!doc) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/docs" className="text-sm font-medium text-indigo-600">
        Back to docs
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{doc.title}</h1>
      {doc.description ? <p className="mt-3 text-slate-600">{doc.description}</p> : null}
      <article className="mt-8 space-y-4 text-slate-800">
        <ReactMarkdown
          components={{
            h1: ({ ...props }) => <h2 className="mt-8 text-2xl font-semibold tracking-tight text-slate-950" {...props} />,
            h2: ({ ...props }) => <h3 className="mt-6 text-xl font-semibold tracking-tight text-slate-950" {...props} />,
            h3: ({ ...props }) => <h4 className="mt-5 text-lg font-semibold text-slate-900" {...props} />,
            p: ({ ...props }) => <p className="leading-relaxed text-slate-700" {...props} />,
            ul: ({ ...props }) => <ul className="list-disc space-y-1 pl-5 text-slate-700" {...props} />,
            ol: ({ ...props }) => <ol className="list-decimal space-y-1 pl-5 text-slate-700" {...props} />,
            code: ({ className, children, ...props }) => {
              const inline = !className;
              if (inline) {
                return (
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-900" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code className="block overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200" {...props}>
                  {children}
                </code>
              );
            },
            pre: ({ ...props }) => <pre className="overflow-auto" {...props} />,
            a: ({ ...props }) => <a className="text-indigo-600 underline" {...props} />,
          }}
        >
          {doc.content}
        </ReactMarkdown>
      </article>
    </main>
  );
}
