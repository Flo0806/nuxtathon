// Computes the ranking for the event window. `from`/`to` query overrides exist
// so a past, GitHub-verifiable window can be tested before the event is live.
export default defineEventHandler(async (event) => {
  const token = useRuntimeConfig().githubToken;
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
  }

  const q = getQuery(event);
  const result = await fetchLeaderboard(eventConfig, token, {
    from: q.from ? String(q.from) : undefined,
    to: q.to ? String(q.to) : undefined,
  });

  // Snapshot write is provisional here; it moves into the cached refresh later.
  const state = await readRuntimeState();
  await writeRuntimeState(
    pushSnapshot(
      state,
      result.entries.map((entry) => entry.login),
      new Date().toISOString(),
    ),
  );

  return result;
});
