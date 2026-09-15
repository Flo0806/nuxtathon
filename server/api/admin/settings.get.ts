import type { EventSettings } from "#shared/types/event";
import { SETTINGS_KEYS } from "#shared/types/event";

// Defaults next to overrides so the form can mark diffs and reset per field.
export default defineEventHandler(async () => {
  const settings = await readSettings();
  const defaults: EventSettings = {};
  for (const key of SETTINGS_KEYS) defaults[key] = eventConfig[key] as never;
  return { defaults, settings, ...(await settingsLock()) };
});
