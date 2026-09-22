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
// Booleans are stored only when they differ from the default.
export function pickSettings(input: EventSettings): EventSettings {
  const out: EventSettings = {};
  for (const key of SETTINGS_KEYS) {
    const value = input[key];
    const fallback = eventConfig[key];
    if (key === "scoring") {
      // Object-valued; stored only when it actually differs from the default.
      const merged = normalizeScoring(value as ScoringRules | undefined);
      if (JSON.stringify(merged) !== JSON.stringify(eventConfig.scoring)) out.scoring = merged;
    } else if (typeof fallback === "boolean") {
      if (typeof value === "boolean" && value !== fallback) {
        (out as Record<string, unknown>)[key] = value;
      }
    } else if (Array.isArray(fallback)) {
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

// Config as it goes into FinalResult: everything the event ran with, minus
// credentials.
export function archivableConfig(config: EventConfig): EventConfig {
  return {
    ...config,
    discordWebhookUrl: eventConfig.discordWebhookUrl,
    discordAnnounce: eventConfig.discordAnnounce,
  };
}

// Keeps the stored block on the known shape: unknown keys are dropped, missing
// ones fall back to the default, numbers are coerced. A hand-edited or outdated
// settings file can then never break scoring.
function normalizeScoring(input: ScoringRules | undefined): ScoringRules {
  const d = eventConfig.scoring ?? DEFAULT_SCORING;
  // A cleared input field arrives as "" and would otherwise become 0.
  const num = (v: unknown, fallback: number) =>
    v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v);
  // Thresholds must stay positive: 0 months would make every issue "old", and a
  // step of 0 would silently kill the upvote bonus.
  const positive = (v: unknown, fallback: number) => {
    const n = num(v, fallback);
    return n > 0 ? n : fallback;
  };
  // Only an explicit boolean overrides the default, so a partial object cannot
  // silently switch rules off.
  const on = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const i = input ?? d;
  return {
    issuePoints: {
      enabled: on(i.issuePoints?.enabled, d.issuePoints.enabled),
      points: num(i.issuePoints?.points, d.issuePoints.points),
    },
    prPoints: {
      enabled: on(i.prPoints?.enabled, d.prPoints.enabled),
      points: num(i.prPoints?.points, d.prPoints.points),
    },
    ageBonus: {
      enabled: on(i.ageBonus?.enabled, d.ageBonus.enabled),
      afterMonths: positive(i.ageBonus?.afterMonths, d.ageBonus.afterMonths),
      points: num(i.ageBonus?.points, d.ageBonus.points),
    },
    labelBonus: {
      enabled: on(i.labelBonus?.enabled, d.labelBonus.enabled),
      points: Object.fromEntries(
        Object.entries(i.labelBonus?.points ?? d.labelBonus.points)
          .map(([k, v]) => [k.trim(), Number(v)])
          .filter(([k, v]) => k && Number.isFinite(v as number)),
      ) as Record<string, number>,
    },
    upvoteBonus: {
      enabled: on(i.upvoteBonus?.enabled, d.upvoteBonus.enabled),
      per: positive(i.upvoteBonus?.per, d.upvoteBonus.per),
      points: num(i.upvoteBonus?.points, d.upvoteBonus.points),
    },
  };
}
