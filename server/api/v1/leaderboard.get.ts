import type { ApiLeaderboard } from "#shared/types/api";

// Full ranking. `?limit=` trims it, `?include=contributions` adds the issue and
// PR numbers behind each score (left out by default, it is the bulk of the
// payload).
export default defineEventHandler(async (event) => {
  const { phase, board, stats } = await currentEvent();
  const query = getQuery(event);
  const withIds = String(query.include ?? "")
    .split(",")
    .includes("contributions");
  const limit = apiLimit(query.limit, board.entries.length);

  const map = (entries: typeof board.entries) =>
    entries
      .slice(0, limit)
      .map((e) => apiContributor(e, withIds ? board.contributions[e.login] : undefined));

  const payload: ApiLeaderboard = {
    meta: apiMeta(phase),
    stats,
    contributors: map(board.entries),
    coreTeam: map(board.coreTeam),
  };
  return sendApi(event, payload);
});
