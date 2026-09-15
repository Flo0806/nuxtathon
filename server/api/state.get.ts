// Public state endpoint. Returns the resolved config (defaults + admin overrides),
// the current phase and
// the snapshot history the client needs to drive the intro reshuffle.
export default defineEventHandler(async () => {
  const state = await readRuntimeState();
  const snapshots = await readSnapshots();
  const config = await resolveEventConfig();
  const phase = resolvePhase(config, state.prizesReleased);

  return {
    config,
    phase,
    prizesReleased: state.prizesReleased,
    snapshots,
  };
});
