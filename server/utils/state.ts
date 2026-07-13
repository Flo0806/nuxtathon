import type { RuntimeState } from "#shared/types/event";

const STATE_KEY = "runtime";
const MAX_SNAPSHOTS = 4;

const DEFAULT_STATE: RuntimeState = {
  prizesReleased: false,
  credits: [],
  snapshots: [],
};

// Runtime state lives in the "state" storage mount (fs in dev, KV in prod).
// Reads merge over defaults so a cold, empty store just works.
export async function readRuntimeState(): Promise<RuntimeState> {
  const stored = await useStorage("state").getItem<RuntimeState>(STATE_KEY);
  return { ...DEFAULT_STATE, ...stored };
}

export async function writeRuntimeState(next: RuntimeState): Promise<void> {
  await useStorage("state").setItem(STATE_KEY, next);
}

// Append a ranking snapshot, keeping only the most recent few. This bounded
// history is what the client replays as the load-time reshuffle animation.
export function pushSnapshot(state: RuntimeState, order: string[], takenAt: string): RuntimeState {
  const snapshots = [...state.snapshots, { takenAt, order }].slice(-MAX_SNAPSHOTS);
  return { ...state, snapshots };
}
