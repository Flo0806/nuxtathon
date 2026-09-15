import type { EventSettings } from "#shared/types/event";
import { SETTINGS_KEYS } from "#shared/types/event";
import { isKeyLocked } from "#shared/utils/event-window";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ settings?: EventSettings }>(event);
  const incoming = (body?.settings ?? {}) as Record<string, unknown>;

  const { frozen, locked } = await settingsLock();
  if (frozen) {
    throw createError({ statusCode: 409, statusMessage: "Event is fired; unfreeze or start new" });
  }

  // Locked keys keep their stored value whatever the payload says.
  const current = (await readSettings()) as Record<string, unknown>;
  for (const key of SETTINGS_KEYS) {
    if (!isKeyLocked(locked, key)) continue;
    if (key in current) incoming[key] = current[key];
    else delete incoming[key];
  }
  // Reject unparsable dates here; pickSettings would silently drop them and the
  // default would slip in.
  for (const key of ["startsAt", "endsAt", "qualifyingBefore"]) {
    const v = incoming[key];
    if (typeof v === "string" && v.trim() && Number.isNaN(Date.parse(v))) {
      throw createError({ statusCode: 422, statusMessage: `Invalid date for ${key}` });
    }
  }
  // Validate the effective config (empty fields fall back to defaults), same as
  // the form does.
  assertWindow({ ...eventConfig, ...pickSettings(incoming as EventSettings) }, locked);

  await writeSettings(incoming as EventSettings);
  await invalidateLeaderboardCache();
  return { settings: await readSettings(), ...(await settingsLock()) };
});
