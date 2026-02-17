import Link from "next/link";

const footerSections = [
  {
    title: "Product",
    links: [
      { href: "/protocol", label: "Protocol" },
      { href: "/cli", label: "CLI" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/security", label: "Security" },
      { href: "/oss", label: "Open Source" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              ticket<span className="text-subtle">.</span>app
            </Link>
            <p className="mt-3 text-sm text-muted">
              Git-native issue tracking.
              <br />
              CLI for agents. Dashboard for humans.
            </p>
          </div>
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-sm text-subtle">
          © {new Date().getFullYear()} ticket.app
        </div>
      </div>
    </footer>
  );
}
