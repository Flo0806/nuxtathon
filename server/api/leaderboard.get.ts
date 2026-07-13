// Cached so N page views cost at most one GitHub fetch per maxAge window. SWR
// serves stale instantly and revalidates in the background. The handler body
// (GitHub fetch + snapshot write) runs only on a cache miss.
export default defineCachedEventHandler(
  async () => {
    const token = useRuntimeConfig().githubToken;
    if (!token) {
      throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
    }

    const result = await fetchLeaderboard(eventConfig, token);
    const fetchedAt = new Date().toISOString();

    const state = await readRuntimeState();
    const order = result.entries.map((entry) => entry.login);
    const last = state.snapshots.at(-1);
    if (!last || last.order.join("\n") !== order.join("\n")) {
      await writeRuntimeState(pushSnapshot(state, order, fetchedAt));
    }

    return { ...result, fetchedAt };
  },
  { maxAge: 300, swr: true, name: "leaderboard", getKey: () => "current" },
);
