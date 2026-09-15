import type { EventSettings } from "#shared/types/event";
import { SETTINGS_KEYS } from "#shared/types/event";

// Defaults and overrides side by side, so the admin UI can show what differs
// from the committed config and offer a per-field reset.
export default defineEventHandler(async () => {
  const settings = await readSettings();
  const defaults: EventSettings = {};
  for (const key of SETTINGS_KEYS) defaults[key] = eventConfig[key] as never;
  return { defaults, settings };
});
