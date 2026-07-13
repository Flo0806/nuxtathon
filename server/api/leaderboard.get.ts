// Computes the ranking for the event window. `from`/`to` query overrides exist
// so a past, GitHub-verifiable window can be tested before the event is live.
export default defineEventHandler(async (event) => {
  const token = useRuntimeConfig().githubToken;
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
  }

  const q = getQuery(event);
  const entries = await fetchLeaderboard(eventConfig, token, {
    from: q.from ? String(q.from) : undefined,
    to: q.to ? String(q.to) : undefined,
  });

  // Record a ranking snapshot so the reshuffle history stays fresh. This will
  // later move inside the 5-minute cached refresh; for now it also exercises the
  // KV write path end to end.
  const state = await readRuntimeState();
  await writeRuntimeState(
    pushSnapshot(
      state,
      entries.map((entry) => entry.login),
      new Date().toISOString(),
    ),
  );

  return entries;
});
