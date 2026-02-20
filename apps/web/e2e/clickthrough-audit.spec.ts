import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type Clickable = { key: string; xpath: string; tag: string; text: string; href: string | null };
type ClickResult = {
  route: string;
  control: string;
  beforeUrl: string;
  afterUrl: string;
  status: "ok" | "failed" | "skipped";
  reason?: string;
  screenshot?: string;
};

const ROUTES = ["/", "/pricing", "/docs", "/protocol", "/security", "/oss", "/dashboard", "/cli", "/space", "/space/settings", "/repos", "/space/acme/api"];

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);

test("automated click-through audit", async ({ page }, testInfo) => {
  test.setTimeout(12 * 60 * 1000);

  const failures: ClickResult[] = [];
  const visited: ClickResult[] = [];
  const outputRoot = testInfo.outputPath("clickthrough-audit");
  await fs.mkdir(outputRoot, { recursive: true });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];

  page.on("console", (msg) => msg.type() === "error" && consoleErrors.push(`[${page.url()}] ${msg.text()}`));
  page.on("pageerror", (err) => pageErrors.push(`[${page.url()}] ${err.message}`));
  page.on("response", (res) => res.status() >= 400 && badResponses.push(`${res.status()} ${res.url()}`));

  for (const route of ROUTES) {
    const routeSlug = route === "/" ? "root" : route.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-");
    await page.goto(route, { waitUntil: "domcontentloaded" });

    const clickables = await page.evaluate<Clickable[]>(() => {
      function xpathFor(el: Element): string {
        if ((el as HTMLElement).id) return `//*[@id="${(el as HTMLElement).id}"]`;
        const segments: string[] = [];
        let cur: Element | null = el;
        while (cur && cur.nodeType === Node.ELEMENT_NODE) {
          const tag = cur.tagName.toLowerCase();
          let ix = 1;
          let sib = cur.previousElementSibling;
          while (sib) {
            if (sib.tagName.toLowerCase() === tag) ix += 1;
            sib = sib.previousElementSibling;
          }
          segments.unshift(`${tag}[${ix}]`);
          cur = cur.parentElement;
        }
        return `/${segments.join("/")}`;
      }

      const nodes = Array.from(document.querySelectorAll("a[href],button,[role='button'],summary,input[type='button'],input[type='submit']")) as HTMLElement[];
      const seen = new Set<string>();
      const out: Clickable[] = [];
      for (const node of nodes) {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const hidden = style.display === "none" || style.visibility === "hidden";
        const disabled = (node as HTMLButtonElement).disabled;
        if (hidden || disabled || rect.width === 0 || rect.height === 0) continue;

        const text = (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
        const href = node instanceof HTMLAnchorElement ? node.getAttribute("href") : null;
        const key = `${node.tagName.toLowerCase()}|${text}|${href ?? ""}|${node.getAttribute("aria-label") ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, xpath: xpathFor(node), tag: node.tagName.toLowerCase(), text, href });
      }
      return out;
    });

    for (const control of clickables) {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      if (control.href && /^https?:\/\//.test(control.href)) {
        visited.push({ route, control: `${control.tag} ${control.text || "(no text)"}`, beforeUrl: page.url(), afterUrl: page.url(), status: "skipped", reason: `external href ${control.href}` });
        continue;
      }

      const beforeUrl = page.url();
      let status: ClickResult["status"] = "ok";
      let reason: string | undefined;
      let screenshot: string | undefined;

      try {
        const locator = page.locator(`xpath=${control.xpath}`).first();
        await expect(locator).toBeVisible({ timeout: 2000 });
        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(300);

        const afterUrl = page.url();
        const parsedAfter = new URL(afterUrl);
        if (!ALLOWED_HOSTS.has(parsedAfter.hostname)) {
          status = "failed";
          reason = `cross-origin navigation: ${afterUrl}`;
        }
        if (afterUrl.includes("/api/auth") || afterUrl.includes("signin")) {
          status = "failed";
          reason = `unexpected auth redirect: ${afterUrl}`;
        }

        const result: ClickResult = { route, control: `${control.tag} ${control.text || "(no text)"}`, beforeUrl, afterUrl, status, reason };
        if (status === "failed") {
          screenshot = path.join(outputRoot, `${routeSlug}-${visited.length + failures.length + 1}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          result.screenshot = screenshot;
          failures.push(result);
        }
        visited.push(result);
      } catch (error) {
        screenshot = path.join(outputRoot, `${routeSlug}-${visited.length + failures.length + 1}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        const result: ClickResult = {
          route,
          control: `${control.tag} ${control.text || "(no text)"}`,
          beforeUrl,
          afterUrl: page.url(),
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
          screenshot,
        };
        failures.push(result);
        visited.push(result);
      }
    }
  }

  const filteredPageErrors = [...new Set(pageErrors)].filter((e) => !e.includes("Clipboard") && !e.includes("writeText"));
  const filteredBadResponses = [...new Set(badResponses)].filter((e) => !e.includes("/api/github/installations/refresh") && !e.includes("/api/tickets?repo="));

  const lines: string[] = [
    "# Ticket App Click-through Audit",
    "",
    `- Timestamp: ${new Date().toISOString()}`,
    `- Controls visited: ${visited.length}`,
    `- Failures: ${failures.length}`,
    `- Console errors: ${new Set(consoleErrors).size}`,
    `- Page errors: ${filteredPageErrors.length}`,
    `- 4xx/5xx responses: ${filteredBadResponses.length}`,
    "",
    "## Routes Covered",
    ...ROUTES.map((r) => `- ${r}`),
    "",
    "## Failures",
    ...(failures.length
      ? failures.map((f) => `- [${f.route}] ${f.control} — ${f.reason ?? "unknown"} | before: ${f.beforeUrl} | after: ${f.afterUrl}${f.screenshot ? ` | screenshot: ${f.screenshot}` : ""}`)
      : ["- None"]),
    "",
    "## Page Errors",
    ...(filteredPageErrors.length ? filteredPageErrors.map((e) => `- ${e}`) : ["- None"]),
    "",
    "## HTTP 4xx/5xx",
    ...(filteredBadResponses.length ? filteredBadResponses.map((e) => `- ${e}`) : ["- None"]),
    "",
    "## Click Log",
    ...visited.map((v) => `- [${v.status.toUpperCase()}] ${v.route} :: ${v.control} | before: ${v.beforeUrl} | after: ${v.afterUrl}${v.reason ? ` | ${v.reason}` : ""}`),
  ];

  const reportPath = "/Users/morganbot/.openclaw/workspace/reports/ticket-clickthrough-audit.md";
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
});
