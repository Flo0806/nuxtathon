import type {
  ContributionIds,
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
  const fetchedAt = ref<string | null>(null);
  const leaderboardLoaded = ref(false);
  const contributions = ref<ContributionIds>({});

  async function load() {
    // Already hydrated from the SSR payload -> skip the client refetch.
    if (config.value) return;

    const data = await $fetch<StatePayload>("/api/state");
    config.value = data.config;
    phase.value = data.phase;
    prizesReleased.value = data.prizesReleased;
    snapshots.value = data.snapshots;
  }

  // `force` bypasses the hydration guard so the client poll can refresh.
  async function loadLeaderboard(force = false) {
    if (leaderboardLoaded.value && !force) return;
    // Bust the browser cache; server keys on config only, so no extra GitHub hit.
    const res = await $fetch<{
      entries: LeaderboardEntry[];
      stats: EventStats;
      contributions: ContributionIds;
      fetchedAt: string;
    }>("/api/leaderboard", { query: { t: Date.now() } });
    leaderboard.value = res.entries;
    stats.value = res.stats;
    contributions.value = res.contributions ?? {};
    fetchedAt.value = res.fetchedAt;
    leaderboardLoaded.value = true;
  }

  return {
    config,
    phase,
    prizesReleased,
    snapshots,
    leaderboard,
    stats,
    fetchedAt,
    contributions,
    load,
    loadLeaderboard,
  };
});
