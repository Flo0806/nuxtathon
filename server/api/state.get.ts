// Public state endpoint. Returns the static config plus the current phase and
// the snapshot history the client needs to drive the intro reshuffle.
export default defineEventHandler(async () => {
  const state = await readRuntimeState();
  const phase = resolvePhase(eventConfig, state.prizesReleased);

  return {
    config: eventConfig,
    phase,
    prizesReleased: state.prizesReleased,
    snapshots: state.snapshots,
  };
});
