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
