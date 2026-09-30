// What the shared GitHub token has left, from the rate-limit headers GitHub
// sends with every response. Reading them costs nothing, unlike /rate_limit,
// whose GraphQL numbers disagreed with the API itself on 2026-09-29 (4705 left
// there while queries were already refused). Kept in memory: a single process
// serves the site, and the numbers are only interesting while it runs.

export type BudgetResource = "graphql" | "search" | "core";

export interface BudgetReading {
  remaining: number;
  limit: number;
  used: number;
  resetAt: string;
  // When GitHub last reported it.
  seenAt: string;
}

export interface BudgetCall {
  at: string;
  resource: BudgetResource;
  // What the site asked GitHub for, in words (see describeCall).
  label: string;
  // The search string or query as sent, for the tooltip.
  raw: string;
  // Points (GraphQL) or requests (REST) this call used, when it can be told
  // from the previous reading in the same window. GitHub only reports what is
  // left, so calls answering out of order (the board runs its searches side by
  // side) can swap their shares; the sum over a run is exact.
  cost: number | null;
  remaining: number;
  // GitHub refused the call for its budget.
  limited: boolean;
  // Round trip in milliseconds, to tell a slow GitHub from a heavy query.
  ms: number | null;
}

const MAX_CALLS = 60;
const readings: Partial<Record<BudgetResource, BudgetReading>> = {};
const calls: BudgetCall[] = [];

interface CallInfo {
  // GitHub refused the call for its budget.
  limited?: boolean;
  // Names the call when its text alone is ambiguous (the random-issue button
  // searches exactly like Flo's list does for nuxt/nuxt).
  purpose?: string;
  // How long GitHub took to answer.
  ms?: number;
  // HTTP status of a failed call; 401 means the token itself was rejected.
  status?: number;
}

// Set while GitHub rejects the token (401). Prod ran on a dead token for days
// on 2026-09 and it only surfaced as a 502 on Flo's list; the counter says it.
let tokenRejectedAt = "";

export function recordBudget(
  headers: Headers | undefined,
  label: string,
  { limited = false, purpose, ms, status }: CallInfo = {},
): void {
  if (status === 401) {
    // Its rate headers describe anonymous access (60 an hour), not our budget.
    tokenRejectedAt ||= new Date().toISOString();
    return;
  }
  tokenRejectedAt = "";
  const resource = headers?.get("x-ratelimit-resource") as BudgetResource | null;
  const remaining = Number(headers?.get("x-ratelimit-remaining"));
  const limit = Number(headers?.get("x-ratelimit-limit"));
  const reset = Number(headers?.get("x-ratelimit-reset"));
  if (!resource || !Number.isFinite(remaining) || !Number.isFinite(limit)) return;

  const resetAt = new Date(reset * 1000).toISOString();
  const previous = readings[resource];
  const sameWindow = previous?.resetAt === resetAt;
  const cost = previous && sameWindow ? Math.max(0, previous.remaining - remaining) : null;
  const seenAt = new Date().toISOString();
  // Parallel calls answer out of order. Within one window the budget only goes
  // down, so a late answer must not raise it again; an answer from an earlier
  // window is stale altogether. A later window is the budget starting over.
  const older = previous && Date.parse(resetAt) < Date.parse(previous.resetAt);
  const raised = previous && sameWindow && remaining > previous.remaining;
  if (!older && !raised) {
    readings[resource] = {
      remaining,
      limit,
      used: Number(headers?.get("x-ratelimit-used")) || limit - remaining,
      resetAt,
      seenAt,
    };
  }
  const raw = label.replace(/\s+/g, " ").trim();
  calls.unshift({
    at: seenAt,
    resource,
    label: purpose ?? describeCall(raw),
    raw: raw.slice(0, 300),
    cost,
    remaining,
    limited,
    ms: ms ?? null,
  });
  calls.length = Math.min(calls.length, MAX_CALLS);
}

export function budgetSnapshot() {
  return { readings, calls, tier: budgetTier(), tokenRejectedAt };
}

// The purpose of a call, from the search string or query it sent. Callers pass
// what they have (usually the search string); a query that embeds its search,
// as the PR-link delta does, is unwrapped first. Anything unknown shows as is.
export function describeCall(raw: string): string {
  const q = /query: "([^"]+)"/.exec(raw)?.[1] ?? raw;
  const org = /org:([\w-]+)/.exec(q)?.[1];
  const repo = /repo:([\w.-]+\/[\w.-]+)/.exec(q)?.[1];
  const repos = (q.match(/repo:/g) ?? []).length;

  if (q.startsWith("query { rateLimit")) return "budget check";
  if (/^query \{\s*r\d+: repository/.test(q)) return "issue lookup (watch list, credits, upvotes)";
  if (q.startsWith("repos of ")) return "repository list for Flo's list";
  if (/user\(login:/.test(q)) return "contributor name";
  if (repos > 1 && q.includes("is:pr")) return `registry: ${repos} module repositories`;
  if (q.includes("is:pr is:merged") && (org || repo))
    return `leaderboard: merged PRs in ${org ?? repo}`;
  if (q.includes("is:pr created:") && (org || repo))
    return `leaderboard: PR count in ${org ?? repo}`;
  if (q.includes("is:pr updated:>")) return "Flo's list: new PR links";
  if (q.includes("is:issue updated:>")) return "Flo's list: changes";
  if (q.includes("is:issue is:closed closed:")) return "leaderboard: close markers";
  if (repo && q.includes("is:issue state:open")) {
    return `Flo's list: ${repo}${q.includes("linked:pr") ? " (which have a PR)" : ""}`;
  }
  return q.slice(0, 80);
}

// Priorities when the hourly GraphQL budget runs low. The board is what the
// event is about, so everything else stops first and the board keeps a reserve:
//   full      all features
//   saving    below 1500: no registry scan, no scope check (both re-runnable later)
//   tight     below 800: Flo's list shows what it stored, asks GitHub nothing
//   critical  below 200, or GitHub already refused a call in this window: the
//             board shows its last result until the budget resets
// Measured 2026-09-29: a board recompute costs ~77 points, a registry run ~180,
// so 1500 leaves hours of board even when nothing resets.
export type BudgetTier = "full" | "saving" | "tight" | "critical";
export type BudgetUse = "board" | "flos-list" | "extras";

const TIER_FLOORS: [BudgetTier, number][] = [
  ["full", 1500],
  ["saving", 800],
  ["tight", 200],
];

const ALLOWED: Record<BudgetTier, BudgetUse[]> = {
  full: ["board", "flos-list", "extras"],
  saving: ["board", "flos-list"],
  tight: ["board"],
  critical: [],
};

export function budgetTier(now = Date.now()): BudgetTier {
  const g = readings.graphql;
  // Nothing seen since the server started, or the window has reset since: the
  // next call will tell, and a fresh window is full.
  if (!g || Date.parse(g.resetAt) <= now) return "full";
  const refused = calls.some(
    (c) =>
      c.resource === "graphql" && c.limited && Date.parse(c.at) > Date.parse(g.resetAt) - 3600_000,
  );
  if (refused) return "critical";
  return TIER_FLOORS.find(([, floor]) => g.remaining >= floor)?.[0] ?? "critical";
}

export const budgetAllows = (use: BudgetUse): boolean => ALLOWED[budgetTier()].includes(use);

// For a 429 or a notice: what is left and when it comes back.
export function budgetNotice(): string {
  const g = readings.graphql;
  const back = g ? ` until ${new Date(g.resetAt).toISOString().slice(11, 16)} UTC` : "";
  return `GitHub budget is low (${g?.remaining ?? "?"} points left${back})`;
}
