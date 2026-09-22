import { createHash } from "node:crypto";
import type { H3Event } from "h3";
import type { ApiAvatar, ApiContributor, ApiMeta } from "#shared/types/api";
import type { EventPhase, LeaderboardEntry } from "#shared/types/event";

// The ranking is recomputed at most every 5 minutes, so nothing downstream can
// learn anything new before that.
const DATA_MAX_AGE = 300;

export const apiSiteUrl = () => useRuntimeConfig().public.siteUrl || "https://nuxtathon.live";

// Public, cross-origin, cacheable. The ETag covers the payload plus the phase,
// but not the timestamps: `generatedAt` moves on every request, while a phase
// change (live -> evaluating) must reach a conditional client even when the
// ranking itself did not move.
export function sendApi<T extends { meta: ApiMeta }>(event: H3Event, payload: T): T | null {
  const { meta, ...data } = payload;
  const etag = `W/"${createHash("sha256")
    .update(JSON.stringify({ ...data, phase: meta.phase }))
    .digest("hex")
    .slice(0, 16)}"`;

  setResponseHeaders(event, {
    "access-control-allow-origin": "*",
    // Without this a browser fetch() cannot read the ETag, so it could never
    // send If-None-Match and conditional requests would be server-side only.
    "access-control-expose-headers": "ETag",
    "cache-control": `public, max-age=60, stale-while-revalidate=${DATA_MAX_AGE}`,
    etag,
  });

  if (getRequestHeader(event, "if-none-match") === etag) {
    setResponseStatus(event, 304);
    return null;
  }
  return payload;
}

export function apiMeta(phase: EventPhase): ApiMeta {
  const now = Date.now();
  return {
    generatedAt: new Date(now).toISOString(),
    nextUpdateAt: new Date(now + DATA_MAX_AGE * 1000).toISOString(),
    phase,
  };
}

// GitHub serves both `?s=` (avatars.githubusercontent.com) and `?size=`
// (github.com/<login>.png); setting both keeps either host happy.
export function apiAvatar(url: string): ApiAvatar {
  const at = (size: number) => {
    try {
      const u = new URL(url);
      u.searchParams.set("s", String(size));
      u.searchParams.set("size", String(size));
      return u.toString();
    } catch {
      return url;
    }
  };
  return { small: at(80), large: at(256) };
}

export function apiContributor(
  entry: LeaderboardEntry,
  contributions?: { issues: number[]; prs: number[] },
): ApiContributor {
  return {
    rank: entry.rank,
    login: entry.login,
    name: entry.name,
    avatar: apiAvatar(entry.avatarUrl),
    score: entry.score,
    closedIssues: entry.closedIssues,
    mergedPRs: entry.mergedPRs,
    ...(contributions ? { issues: contributions.issues, prs: contributions.prs } : {}),
  };
}

// Strips inline Markdown for the plain-text variants.
export const apiPlain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

// A positive integer from the query, or the fallback. Guards against NaN and
// negatives, which would otherwise reach Array.slice and quietly trim the wrong
// end of the list.
export function apiLimit(value: unknown, fallback: number, max = 500): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Phase without pulling the ranking: the small endpoints only need the clock.
export async function currentPhase(): Promise<EventPhase> {
  const state = await readRuntimeState();
  const config = state.final?.config ?? (await resolveEventConfig());
  return resolvePhase(config, state.prizesReleased);
}
