import type { EventSettings } from "#shared/types/event";

// Archive the fired event, clear live state, write the new window to settings.
// Existing content overrides are kept.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ settings?: EventSettings; announce?: boolean }>(event);
  const incoming = body?.settings ?? {};

  const state = await readRuntimeState();
  if (!state.final) {
    throw createError({ statusCode: 409, statusMessage: "Fire the current event first" });
  }

  const window = {
    startsAt: String(incoming.startsAt ?? ""),
    endsAt: String(incoming.endsAt ?? ""),
    qualifyingBefore: String(incoming.qualifyingBefore ?? ""),
  };
  assertWindow(window);

  const f = state.final;
  const archive = state.archive.filter((a) => !(a.title === f.title && a.startsAt === f.startsAt));
  archive.push(f);

  const current = await readSettings();
  await writeSettings({
    ...current,
    ...window,
    ...(incoming.title ? { title: incoming.title } : {}),
    ...(incoming.eyebrow ? { eyebrow: incoming.eyebrow } : {}),
  });
  await writeRuntimeState({ prizesReleased: false, credits: [], final: null, archive });
  await clearSnapshots();
  await clearAnnounceState();
  await invalidateLeaderboardCache();
  if (body?.announce) {
    announceUpcoming(await resolveEventConfig()).catch((e) =>
      console.error("[announce] upcoming post failed:", e),
    );
  }
  return { ok: true, settings: await readSettings() };
});
