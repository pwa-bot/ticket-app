import { describe, it, expect } from "vitest";
import { patchTicketFrontmatter } from "../../src/patch-frontmatter.js";
import { TicketError } from "../../src/errors.js";

function baseTicket(overrides?: Partial<{ yaml: string; body: string }>) {
  const yaml =
    overrides?.yaml ??
    `id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: []`;
  const body = overrides?.body ?? `\n## Problem\n\nHello\n\n## Notes\n\nWorld\n`;
  return `---\n${yaml}\n---\n${body}`;
}

describe("patchTicketFrontmatter", () => {
  it("updates state when transition is valid and preserves body exactly", () => {
    const raw = baseTicket();
    const out = patchTicketFrontmatter({
      ticketPath: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
      rawTicket: raw,
      patch: { state: "in_progress" },
    });

    expect(out).toContain("state: in_progress");
    expect(out).toContain("priority: p1");
    expect(out).toContain("## Problem");
    expect(out).toContain("Hello");
  });

  it("rejects invalid transition done -> ready", () => {
    const raw = baseTicket({
      yaml: `id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: done
priority: p1
labels: []`,
    });

    expect(() =>
      patchTicketFrontmatter({
        ticketPath: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
        rawTicket: raw,
        patch: { state: "ready" },
      })
    ).toThrowError(TicketError);

    try {
      patchTicketFrontmatter({
        ticketPath: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
        rawTicket: raw,
        patch: { state: "ready" },
      });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("invalid_transition");
    }
  });

  it("preserves unknown keys and x_ticket semantically on rewrite", () => {
    const raw = baseTicket({
      yaml: `id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: []
some_unknown_key: 123
x_ticket:
  nested:
    foo: bar
  list:
    - a
    - b`,
    });

    const out = patchTicketFrontmatter({
      ticketPath: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
      rawTicket: raw,
      patch: { priority: "p0" },
    });

    expect(out).toContain("some_unknown_key: 123");
    expect(out).toContain("x_ticket:");
    expect(out).toContain("foo: bar");
    expect(out).toContain("- a");
    expect(out).toContain("- b");
    expect(out).toContain("priority: p0");
  });

  it("requires frontmatter at first line", () => {
    const raw = `\n---\nid: 01AR...\n---\nbody`;
    expect(() =>
      patchTicketFrontmatter({
        ticketPath: "x",
        rawTicket: raw,
        patch: { state: "ready" },
      })
    ).toThrowError(TicketError);

    try {
      patchTicketFrontmatter({ ticketPath: "x", rawTicket: raw, patch: { state: "ready" } });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("frontmatter_missing");
    }
  });

  it("rejects invalid YAML frontmatter", () => {
    const raw = `---\nid: 01ARZ3NDEKTSV4RRFFQ69G5FAV\ntitle: [unterminated\n---\nbody`;
    expect(() =>
      patchTicketFrontmatter({
        ticketPath: "x",
        rawTicket: raw,
        patch: { priority: "p1" },
      })
    ).toThrowError(TicketError);

    try {
      patchTicketFrontmatter({ ticketPath: "x", rawTicket: raw, patch: { priority: "p1" } });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("frontmatter_invalid_yaml");
    }
  });

  it("labels_replace replaces all labels with normalized lowercase and de-duped", () => {
    const raw = baseTicket({
      yaml: `id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: [Foo, foo, BAR]`,
    });

    const out = patchTicketFrontmatter({
      ticketPath: "x",
      rawTicket: raw,
      patch: { labels_replace: ["Foo", "bar", "bar"] },
    });

    expect(out).toContain("- foo");
    expect(out).toContain("- bar");
  });

  it("labels_add and labels_remove patch existing labels", () => {
    const raw = baseTicket({
      yaml: `id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: [bug, wip]`,
    });

    const out = patchTicketFrontmatter({
      ticketPath: "x",
      rawTicket: raw,
      patch: { labels_add: ["urgent"], labels_remove: ["wip"] },
    });

    expect(out).toContain("- bug");
    expect(out).toContain("- urgent");
    expect(out).not.toContain("- wip");
  });

  it("clear_labels empties labels", () => {
    const raw = baseTicket({
      yaml: `id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: [bug, wip]`,
    });

    const out = patchTicketFrontmatter({
      ticketPath: "x",
      rawTicket: raw,
      patch: { clear_labels: true },
    });

    expect(out).toMatch(/labels:\s*\[\]/);
  });

  it("sets assignee and reviewer and deletes them when null", () => {
    const raw = baseTicket();
    const out1 = patchTicketFrontmatter({
      ticketPath: "x",
      rawTicket: raw,
      patch: { assignee: "agent:openclaw", reviewer: "human:morgan" },
    });

    expect(out1).toContain("assignee: agent:openclaw");
    expect(out1).toContain("reviewer: human:morgan");

    const out2 = patchTicketFrontmatter({
      ticketPath: "x",
      rawTicket: out1,
      patch: { assignee: null, reviewer: null },
    });

    expect(out2).not.toContain("assignee:");
    expect(out2).not.toContain("reviewer:");
  });

  it("rejects invalid actor format", () => {
    const raw = baseTicket();
    expect(() =>
      patchTicketFrontmatter({
        ticketPath: "x",
        rawTicket: raw,
        patch: { assignee: "person:morgan" as unknown as `human:${string}` },
      })
    ).toThrowError(TicketError);

    try {
      patchTicketFrontmatter({
        ticketPath: "x",
        rawTicket: raw,
        patch: { assignee: "person:morgan" as unknown as `human:${string}` },
      });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("invalid_actor");
    }
  });

  it("updates title and trims whitespace", () => {
    const raw = baseTicket();
    const out = patchTicketFrontmatter({
      ticketPath: "x",
      rawTicket: raw,
      patch: { title: "  New title  " },
    });

    expect(out).toContain("title: New title");
  });

  it("rejects whitespace-only title", () => {
    const raw = baseTicket();
    expect(() =>
      patchTicketFrontmatter({
        ticketPath: "x",
        rawTicket: raw,
        patch: { title: "   " },
      })
    ).toThrowError(TicketError);

    try {
      patchTicketFrontmatter({ ticketPath: "x", rawTicket: raw, patch: { title: "   " } });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("frontmatter_invalid_required_fields");
    }
  });
});
