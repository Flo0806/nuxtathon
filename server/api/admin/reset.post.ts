// Clear the live event for a new Nuxtathon. The result was already archived on
// fire; the upsert below is a defensive safety net. The archive is preserved.
export default defineEventHandler(async () => {
  const state = await readRuntimeState();

  let archive = state.archive;
  if (state.final) {
    const f = state.final;
    archive = archive.filter((a) => !(a.title === f.title && a.startsAt === f.startsAt));
    archive.push(f);
  }

  await writeRuntimeState({ prizesReleased: false, credits: [], final: null, archive });
  await clearSnapshots();
  await invalidateLeaderboardCache();
  return { ok: true };
});
