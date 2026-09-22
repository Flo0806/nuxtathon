import type { ApiStats } from "#shared/types/api";
import type {
  Award,
  ContributionIds,
  EventConfig,
  EventPhase,
  EventStats,
  LeaderboardEntry,
} from "#shared/types/event";

interface Board {
  entries: LeaderboardEntry[];
  coreTeam: LeaderboardEntry[];
  stats: EventStats;
  contributions: ContributionIds;
  fetchedAt: string;
}

// One place to answer "what is true right now": a fired event serves its frozen
// config, everything else the resolved one. The board comes from the cached
// endpoint, so the public API never triggers a GitHub call of its own.
export async function currentEvent(): Promise<{
  config: EventConfig;
  phase: EventPhase;
  board: Board;
  stats: ApiStats;
  awards: Award[];
  released: boolean;
}> {
  const state = await readRuntimeState();
  const config = state.final?.config ?? (await resolveEventConfig());
  const phase = resolvePhase(config, state.prizesReleased);
  const board = await $fetch<Board>("/api/leaderboard");
  return {
    config,
    phase,
    board,
    stats: {
      ...board.stats,
      contributors: board.entries.filter((e) => e.score > 0).length,
    },
    awards: state.final?.awards ?? [],
    released: state.prizesReleased,
  };
}
