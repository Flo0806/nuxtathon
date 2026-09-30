import type { EventScope } from "../types/scope";

const REPO = /^[a-z0-9-]+\/[a-z0-9._-]+$/;
const ORG = /^[a-z0-9-]+$/;

function names(input: unknown, pattern: RegExp): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const item of input) {
    const name = String(item ?? "")
      .trim()
      .toLowerCase();
    if (pattern.test(name)) out.add(name);
  }
  return [...out];
}

// Stored or submitted scopes pass through here. Invalid names are dropped, and a
// scope that would count nothing at all falls back rather than silently turning
// the leaderboard into an empty one.
export function normalizeScope(input: unknown, fallback: EventScope): EventScope {
  const raw = (input ?? {}) as Partial<Record<keyof EventScope, unknown>>;
  const repos = names(raw.repos, REPO);
  const orgs = names(raw.orgs, ORG);
  if (!repos.length && !orgs.length) {
    return {
      ...fallback,
      registry: typeof raw.registry === "boolean" ? raw.registry : fallback.registry,
    };
  }
  return {
    repos,
    orgs,
    registry: typeof raw.registry === "boolean" ? raw.registry : fallback.registry,
  };
}

const entries = (input: unknown): string[] =>
  Array.isArray(input) ? input.map((v) => String(v ?? "").trim()).filter(Boolean) : [];

// What is wrong with a submitted scope, or null. Unlike normalizeScope this
// refuses instead of dropping, so a typo is reported to the admin rather than
// silently shrinking the event.
export function scopeError(input: { repos?: unknown; orgs?: unknown }): string | null {
  const repos = entries(input.repos);
  const orgs = entries(input.orgs);
  const badRepo = repos.find((r) => !REPO.test(r.toLowerCase()));
  if (badRepo) return `Not an owner/repo: "${badRepo}"`;
  const badOrg = orgs.find((o) => !ORG.test(o.toLowerCase()));
  if (badOrg) return `Not an organization name: "${badOrg}"`;
  if (!repos.length && !orgs.length) return "Add at least one repository or organization.";
  return null;
}

// One sentence for the admin preview and, later, the public rules.
export function scopeSummary(scope: EventScope): string {
  const parts = [
    ...scope.repos,
    ...scope.orgs.map((o) => `every repository of ${o}`),
    ...(scope.registry ? ["modules from the Nuxt registry (submitted by link)"] : []),
  ];
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  return `Pull requests count in ${list}.`;
}

// GitHub search qualifiers for everything in scope. Several `org:` / `repo:`
// in one query act as OR. A repo inside a listed org is already covered.
export function scopeTargets(scope: EventScope): string[] {
  const orgs = new Set(scope.orgs);
  const repos = scope.repos.filter((r) => !orgs.has(r.slice(0, r.indexOf("/"))));
  return [...scope.orgs.map((o) => `org:${o}`), ...repos.map((r) => `repo:${r}`)];
}

// Where the work happened, for sentences such as "closed 12 issues <place>".
// A single repository is named; anything wider is the ecosystem.
export function scopePlace(scope: EventScope): string {
  if (scope.repos.length === 1 && !scope.orgs.length && !scope.registry) {
    return `in ${scope.repos[0]}`;
  }
  return "across the Nuxt ecosystem";
}
