import type { RuntimeState, Snapshot } from "#shared/types/event";

const RUNTIME_KEY = "runtime";
const SNAPSHOTS_KEY = "snapshots";
const MAX_SNAPSHOTS = 4;

const DEFAULT_STATE: RuntimeState = {
  prizesReleased: false,
  credits: [],
  final: null,
  archive: [],
};

// Reads merge over defaults so a cold, empty store just works.
export async function readRuntimeState(): Promise<RuntimeState> {
  const stored = await useStorage("state").getItem<RuntimeState>(RUNTIME_KEY);
  return { ...DEFAULT_STATE, ...stored };
}

export async function writeRuntimeState(next: RuntimeState): Promise<void> {
  await useStorage("state").setItem(RUNTIME_KEY, next);
}

export async function readSnapshots(): Promise<Snapshot[]> {
  return (await useStorage("state").getItem<Snapshot[]>(SNAPSHOTS_KEY)) ?? [];
}

export async function clearSnapshots(): Promise<void> {
  await useStorage("state").removeItem(SNAPSHOTS_KEY);
}

// The leaderboard is the only cached response, so clearing the mount is enough
// and avoids depending on Nitro's internal cache key format.
export async function invalidateLeaderboardCache(): Promise<void> {
  await useStorage("cache").clear();
}

// Separate key from the admin state so the cached leaderboard handler never
// writes RuntimeState (and thus never races with an admin write). No-op when the
// order is unchanged, so the bounded history only tracks real reshuffles.
export async function appendSnapshot(order: string[], takenAt: string): Promise<void> {
  const snapshots = await readSnapshots();
  const last = snapshots.at(-1);
  if (last && last.order.join("\n") === order.join("\n")) return;
  await useStorage("state").setItem(
    SNAPSHOTS_KEY,
    [...snapshots, { takenAt, order }].slice(-MAX_SNAPSHOTS),
  );
}
