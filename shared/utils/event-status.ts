import type { EventConfig, EventPhase } from "../types/event";

// Resolve the current phase from absolute instants. Start/end are stored as UTC,
// so timezone never enters this decision; it only matters when rendering.
export function resolvePhase(
  config: EventConfig,
  prizesReleased: boolean,
  now: number = Date.now(),
): EventPhase {
  const start = Date.parse(config.startsAt);
  const end = Date.parse(config.endsAt);
  if (now < start) return "upcoming";
  if (now <= end) return "live";
  return prizesReleased ? "results" : "evaluating";
}
