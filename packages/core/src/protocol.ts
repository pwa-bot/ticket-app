export type TicketState = "backlog" | "ready" | "in_progress" | "blocked" | "done";
export type TicketPriority = "p0" | "p1" | "p2" | "p3";
export type ActorType = "human" | "agent";
export type ActorRef = `${ActorType}:${string}`;

export const STATE_ORDER: TicketState[] = ["backlog", "ready", "in_progress", "blocked", "done"];
export const PRIORITY_ORDER: TicketPriority[] = ["p0", "p1", "p2", "p3"];

export function normalizeState(s: string): TicketState {
  const v = s.toLowerCase();
  if (v === "backlog" || v === "ready" || v === "in_progress" || v === "blocked" || v === "done") return v;
  throw new Error(`Invalid state: ${s}`);
}

export function normalizePriority(p: string): TicketPriority {
  const v = p.toLowerCase();
  if (v === "p0" || v === "p1" || v === "p2" || v === "p3") return v;
  throw new Error(`Invalid priority: ${p}`);
}

export function isValidTransition(from: TicketState, to: TicketState): boolean {
  if (from === to) return false;
  if (from === "done") return false;
  const allowed: Record<TicketState, TicketState[]> = {
    backlog: ["ready", "blocked"],
    ready: ["in_progress", "blocked"],
    in_progress: ["done", "blocked", "ready"],
    blocked: ["ready", "in_progress"],
    done: [],
  };
  return allowed[from].includes(to);
}

export function validateActorRef(v: string): asserts v is ActorRef {
  const parts = v.split(":");
  if (parts.length !== 2) throw new Error("Actor must be {type}:{slug}");
  const [type, slug] = parts;
  const t = type.toLowerCase();
  if (t !== "human" && t !== "agent") throw new Error("Actor type must be human or agent");
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(slug)) throw new Error("Actor slug invalid");
}

export function normalizeLabels(labels: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if (/\s/.test(v)) throw new Error(`Label contains whitespace: ${raw}`);
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(v)) {
      throw new Error(`Label invalid: ${raw}`);
    }
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
