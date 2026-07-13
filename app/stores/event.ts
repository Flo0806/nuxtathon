import type {
  EventConfig,
  EventPhase,
  EventStats,
  LeaderboardEntry,
  Snapshot,
} from "#shared/types/event";

interface StatePayload {
  config: EventConfig;
  phase: EventPhase;
  prizesReleased: boolean;
  snapshots: Snapshot[];
}

export const useEventStore = defineStore("event", () => {
  const config = ref<EventConfig | null>(null);
  const phase = ref<EventPhase | null>(null);
  const prizesReleased = ref(false);
  const snapshots = ref<Snapshot[]>([]);
  const leaderboard = ref<LeaderboardEntry[]>([]);
  const stats = ref<EventStats | null>(null);
  const leaderboardLoaded = ref(false);

  async function load() {
    // Already hydrated from the SSR payload -> skip the client refetch.
    if (config.value) return;

    const data = await $fetch<StatePayload>("/api/state");
    config.value = data.config;
    phase.value = data.phase;
    prizesReleased.value = data.prizesReleased;
    snapshots.value = data.snapshots;
  }

  // `window` overrides the config event window (used to preview past ranges).
  async function loadLeaderboard(window?: { from?: string; to?: string }) {
    if (leaderboardLoaded.value && !window) return;
    const res = await $fetch<{ entries: LeaderboardEntry[]; stats: EventStats }>(
      "/api/leaderboard",
      {
        query: window,
      },
    );
    leaderboard.value = res.entries;
    stats.value = res.stats;
    leaderboardLoaded.value = true;
  }

  return { config, phase, prizesReleased, snapshots, leaderboard, stats, load, loadLeaderboard };
});
