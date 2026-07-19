import { createHash } from "node:crypto";

// Cache key from the scoring-relevant config, so any change to the window,
// cutoff, or core team busts the cache (dev edits and deploys alike).
const configKey = (): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        eventConfig.startsAt,
        eventConfig.endsAt,
        eventConfig.qualifyingBefore,
        eventConfig.coreTeam,
        eventConfig.closeMarker,
        eventConfig.markerAuthors,
      ]),
    )
    .digest("hex")
    .slice(0, 12);

// Cached so N page views cost at most one GitHub fetch per maxAge window. SWR
// serves stale instantly and revalidates in the background. Once the event is
// fired, the frozen standings are served and GitHub is never hit again.
export default defineCachedEventHandler(
  async () => {
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

    const result = await fetchLeaderboard(eventConfig, token);
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

    // Persist contributions so they survive the cache and are reusable later.
    // Re-read state in case something has changed between the initial read and now.
    const currentState = await readRuntimeState();
    await writeRuntimeState({ ...currentState, contributions });

    await appendSnapshot(
      entries.map((entry) => entry.login),
      fetchedAt,
    );

    return { entries, coreTeam: result.coreTeam, stats, contributions, fetchedAt };
  },
  {
    maxAge: 300,
    swr: false,
    name: "leaderboard",
    getKey: configKey,
  },
);
