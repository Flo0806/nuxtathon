import type { FinalResult } from "#shared/types/event";

// Freeze the ranking, release prizes, and archive the result in one shot.
export default defineEventHandler(async () => {
  const token = useRuntimeConfig().githubToken;
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
  }

  const state = await readRuntimeState();
  const result = await fetchLeaderboard(eventConfig, token);

  // Same order as the live endpoint: dedup manual credits against PR/marker closes
  // first, then fold the remaining manual issue numbers into the frozen count so it
  // matches what was on screen.
  const closed = new Set(result.closedIssues);
  const standings = applyCredits(result.entries, state.credits, closed);
  for (const c of state.credits) if (c.issueNumber) closed.add(c.issueNumber);

  const final: FinalResult = {
    finalizedAt: new Date().toISOString(),
    title: eventConfig.title,
    startsAt: eventConfig.startsAt,
    endsAt: eventConfig.endsAt,
    stats: { ...result.stats, issuesClosed: closed.size },
    standings,
    coreTeam: result.coreTeam,
  };

  // Upsert by (title, startsAt) so re-firing the same event does not duplicate.
  const archive = state.archive.filter(
    (a) => !(a.title === final.title && a.startsAt === final.startsAt),
  );
  archive.push(final);

  await writeRuntimeState({ ...state, final, prizesReleased: true, archive });
  await invalidateLeaderboardCache();

  return { finalizedAt: final.finalizedAt, winner: final.standings[0]?.login ?? null };
});
