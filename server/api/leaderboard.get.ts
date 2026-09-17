import { createHash } from "node:crypto";
import type { H3Event } from "h3";
import type { EventConfig } from "#shared/types/event";
import { announceRankingIfChanged } from "../utils/announce";

// Keyed on the scoring-relevant config so any change to it busts the cache. The
// resolved config is parked on the event so the handler fetches with the exact
// config the key was built from.
const configKey = async (event: H3Event): Promise<string> => {
  const c = await resolveEventConfig();
  event.context.eventConfig = c;
  return createHash("sha256")
    .update(
      JSON.stringify([
        c.startsAt,
        c.endsAt,
        c.qualifyingBefore,
        c.coreTeam,
        c.closeMarker,
        c.markerAuthors,
      ]),
    )
    .digest("hex")
    .slice(0, 12);
};

// Cached so N page views cost at most one GitHub fetch per maxAge window. SWR
// serves stale instantly and revalidates in the background. Once the event is
// fired, the frozen standings are served and GitHub is never hit again.
export default defineCachedEventHandler(
  async (event) => {
    const state = await readRuntimeState();

    if (state.final) {
      return {
        entries: state.final.standings,
        coreTeam: state.final.coreTeam ?? [],
        stats: state.final.stats,
        contributions: state.final.contributions ?? {},
        fetchedAt: state.final.finalizedAt,
      };
    }

    const token = useRuntimeConfig().githubToken;
    if (!token) {
      throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
    }

    const config = (event.context.eventConfig as EventConfig) ?? (await resolveEventConfig());
    const result = await fetchLeaderboard(config, token);
    const fetchedAt = new Date().toISOString();

    // PR + marker closed issues. Passed to applyCredits first (so a manual credit
    // for an already-covered issue is dropped, not double-scored), then the
    // remaining manual issue numbers are folded in for the headline count.
    const closed = new Set(result.closedIssues);
    const entries = applyCredits(result.entries, state.credits, closed);
    const contributions = { ...result.contributions };

    for (const c of state.credits) {
      if (!c.issueNumber) continue;
      closed.add(c.issueNumber);
      const key = c.login.toLowerCase();
      const existing = entries.find((e) => e.login.toLowerCase() === key);
      const login = existing?.login ?? c.login;
      const bucket = (contributions[login] ??= { issues: [], prs: [] });
      if (!bucket.issues.includes(c.issueNumber)) bucket.issues.push(c.issueNumber);
    }

    const stats = { ...result.stats, issuesClosed: closed.size };

    await appendSnapshot(
      entries.map((entry) => entry.login),
      fetchedAt,
    );

    // Not awaited: Discord latency must not delay the board, and a failed post
    // is retried on the next recompute.
    announceRankingIfChanged(
      config,
      resolvePhase(config, state.prizesReleased),
      entries,
      stats,
    ).catch((e) => console.error("[announce] ranking post failed:", e));

    return { entries, coreTeam: result.coreTeam, stats, contributions, fetchedAt };
  },
  {
    maxAge: 300,
    swr: false,
    name: "leaderboard",
    getKey: configKey,
  },
);
