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
        fetchedAt: state.final.finalizedAt,
      };
    }

    const token = useRuntimeConfig().githubToken;
    if (!token) {
      throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
    }

    const result = await fetchLeaderboard(eventConfig, token);
    const entries = applyCredits(result.entries, state.credits);
    const fetchedAt = new Date().toISOString();

    await appendSnapshot(
      entries.map((entry) => entry.login),
      fetchedAt,
    );

    return { entries, coreTeam: result.coreTeam, stats: result.stats, fetchedAt };
  },
  {
    maxAge: 300,
    swr: true,
    name: "leaderboard",
    getKey: () => `${eventConfig.startsAt}:${eventConfig.endsAt}:${eventConfig.qualifyingBefore}`,
  },
);
