export default defineEventHandler(async () => {
  const state = await readRuntimeState();
  const config = await resolveEventConfig();
  const phase = resolvePhase(config, state.prizesReleased);

  return {
    phase,
    prizesReleased: state.prizesReleased,
    credits: state.credits,
    finalized: Boolean(state.final),
    finalizedAt: state.final?.finalizedAt ?? null,
    // Drives the "no awards yet" hint in the start dialog: once the next event
    // opens, handing out prizes for this one is effectively over.
    awardCount: state.final?.awards?.length ?? 0,
    archiveCount: state.archive.length,
  };
});
