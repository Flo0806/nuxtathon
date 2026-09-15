import type { EventSettings } from "#shared/types/event";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ settings?: EventSettings }>(event);
  await writeSettings(body?.settings ?? {});
  return { settings: await readSettings() };
});
