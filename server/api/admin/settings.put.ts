import type { EventSettings } from "#shared/types/event";
import { SETTINGS_KEYS } from "#shared/types/event";
import { isKeyLocked } from "#shared/utils/event-window";
import { scopeError } from "#shared/utils/scope";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ settings?: EventSettings }>(event);
  const incoming = (body?.settings ?? {}) as Record<string, unknown>;

  const { locked } = await settingsLock();

  // Locked keys keep their stored value whatever the payload says. Integration
  // keys are never locked, so they stay editable on a fired event.
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
  // A typo in a repo name must not silently drop it from the event.
  if (!isKeyLocked(locked, "scope") && incoming.scope !== undefined) {
    const problem = scopeError((incoming.scope ?? {}) as { repos?: unknown; orgs?: unknown });
    if (problem) throw createError({ statusCode: 422, statusMessage: problem });
  }
  // Password managers ignore autocomplete="off" on masked fields and have filled
  // an account password in here before. Only an actual webhook url is accepted,
  // so a credential never lands in the settings file.
  const webhook = incoming.discordWebhookUrl;
  if (
    typeof webhook === "string" &&
    webhook.trim() &&
    !/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhook.trim())
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "The Discord webhook must be a https://discord.com/api/webhooks/... url",
    });
  }
  // Validate the effective config (empty fields fall back to defaults), same as
  // the form does.
  assertWindow({ ...eventConfig, ...pickSettings(incoming as EventSettings) }, locked);

  await writeSettings(incoming as EventSettings);
  await invalidateLeaderboardCache();
  await configureDiscord();
  return { settings: await readSettings(), ...(await settingsLock()), discord: discord.status() };
});
