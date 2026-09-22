import type { EventPhase } from "#shared/types/event";
import { INTEGRATION_KEYS } from "#shared/types/event";

export interface EventWindow {
  startsAt: string;
  endsAt: string;
  qualifyingBefore: string;
}
export type WindowErrors = Partial<Record<keyof EventWindow, string>>;

const DAY_MS = 24 * 60 * 60 * 1000;

// Next UTC midnight. A same-day start would lock the mechanics on save.
export function earliestStart(now: number = Date.now()): number {
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}

// Settings keys the current phase forbids changing; "*" = everything. Live locks
// the start, the cutoff and the point rules (each would move the scoring under a
// running event), evaluating locks the end as well.
export function lockedSettingsKeys(phase: EventPhase, frozen: boolean): string[] {
  if (frozen || phase === "results") return ["*"];
  if (phase === "live") return ["startsAt", "qualifyingBefore", "scoring"];
  if (phase === "evaluating") return ["startsAt", "qualifyingBefore", "endsAt", "scoring"];
  return [];
}
export const isKeyLocked = (locked: readonly string[], key: string) =>
  !(INTEGRATION_KEYS as readonly string[]).includes(key) &&
  (locked.includes("*") || locked.includes(key));

// Shared by server (422) and admin forms (inline). Empty = valid. Rules on a
// locked field are skipped: its value is fixed and may legitimately be past.
export function validateWindow(
  w: EventWindow,
  locked: readonly string[] = [],
  now: number = Date.now(),
): WindowErrors {
  const errors: WindowErrors = {};
  const start = Date.parse(w.startsAt);
  const end = Date.parse(w.endsAt);
  const cutoff = Date.parse(w.qualifyingBefore);

  if (!isKeyLocked(locked, "startsAt")) {
    if (!w.startsAt) errors.startsAt = "Required";
    else if (Number.isNaN(start)) errors.startsAt = "Invalid date";
    else if (start < earliestStart(now)) errors.startsAt = "Start must be tomorrow or later (UTC)";
  }

  if (!isKeyLocked(locked, "endsAt")) {
    if (!w.endsAt) errors.endsAt = "Required";
    else if (Number.isNaN(end)) errors.endsAt = "Invalid date";
    else if (!Number.isNaN(start) && end <= start) errors.endsAt = "End must be after start";
  }

  if (!isKeyLocked(locked, "qualifyingBefore")) {
    if (!w.qualifyingBefore) errors.qualifyingBefore = "Required";
    else if (Number.isNaN(cutoff)) errors.qualifyingBefore = "Invalid date";
    else if (!Number.isNaN(start) && cutoff > start) {
      errors.qualifyingBefore = "Issue cutoff must not be after the start";
    }
  }

  return errors;
}
