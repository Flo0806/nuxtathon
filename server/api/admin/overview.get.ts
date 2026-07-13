export default defineEventHandler(async () => {
  const state = await readRuntimeState();
  const phase = resolvePhase(eventConfig, state.prizesReleased);

  return {
    phase,
    prizesReleased: state.prizesReleased,
    credits: state.credits,
    finalized: Boolean(state.final),
    finalizedAt: state.final?.finalizedAt ?? null,
    archiveCount: state.archive.length,
  };
});
