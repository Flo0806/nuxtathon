import type { EventConfig, EventSettings, SettingsKey } from "#shared/types/event";
import { ORGANIZER_LOGIN, SETTINGS_KEYS } from "#shared/types/event";
import type { EventWindow } from "#shared/utils/event-window";
import { lockedSettingsKeys, validateWindow } from "#shared/utils/event-window";

// Separate key from RuntimeState so event writes and settings writes never race.
const SETTINGS_KEY = "settings";

const DATE_KEYS: ReadonlySet<SettingsKey> = new Set(["startsAt", "endsAt", "qualifyingBefore"]);

export async function readSettings(): Promise<EventSettings> {
  const stored = await useStorage("state").getItem<EventSettings>(SETTINGS_KEY);
  return pickSettings(stored ?? {});
}

export async function writeSettings(next: EventSettings): Promise<void> {
  await useStorage("state").setItem(SETTINGS_KEY, pickSettings(next));
}

// Defaults + overrides. Use this, not eventConfig, wherever config is consumed.
// The organizer is pinned into both login lists so a settings edit can neither
// rank them nor drop their marker comments.
export async function resolveEventConfig(): Promise<EventConfig> {
  const merged = { ...eventConfig, ...(await readSettings()) };
  return {
    ...merged,
    coreTeam: withOrganizer(merged.coreTeam),
    markerAuthors: withOrganizer(merged.markerAuthors),
  };
}

function withOrganizer(logins: string[]): string[] {
  const rest = logins.filter((l) => l.toLowerCase() !== ORGANIZER_LOGIN);
  return [ORGANIZER_LOGIN, ...rest];
}

// Lock state for the settings form and the PUT handler.
export async function settingsLock(): Promise<{ frozen: boolean; locked: string[] }> {
  const state = await readRuntimeState();
  const frozen = Boolean(state.final);
  const phase = resolvePhase(await resolveEventConfig(), state.prizesReleased);
  return { frozen, locked: lockedSettingsKeys(phase, frozen) };
}

// First violation as 422; the forms show the same rules inline.
export function assertWindow(w: EventWindow, locked: readonly string[] = []) {
  const first = Object.values(validateWindow(w, locked))[0];
  if (first) throw createError({ statusCode: 422, statusMessage: first });
}

// Only real overrides are stored: empty or equal-to-default values are dropped.
export function pickSettings(input: EventSettings): EventSettings {
  const out: EventSettings = {};
  for (const key of SETTINGS_KEYS) {
    const value = input[key];
    const fallback = eventConfig[key];
    if (Array.isArray(fallback)) {
      const list = Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];
      if (list.length && list.join("\n") !== fallback.join("\n")) {
        (out as Record<string, unknown>)[key] = list;
      }
    } else if (typeof value === "string" && value.trim() && value.trim() !== fallback) {
      const v = value.trim();
      if (DATE_KEYS.has(key) && Number.isNaN(Date.parse(v))) continue;
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
