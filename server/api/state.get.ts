// Public state endpoint. Returns the resolved config (defaults + admin overrides),
// the current phase and
// the snapshot history the client needs to drive the intro reshuffle.
export default defineEventHandler(async () => {
  const state = await readRuntimeState();
  const snapshots = await readSnapshots();
  // A fired event is served with the config it ran with, so the results page
  // stays intact even once the admin starts preparing the next event.
  const config = state.final?.config ?? (await resolveEventConfig());
  const phase = resolvePhase(config, state.prizesReleased);

  return {
    config,
    phase,
    prizesReleased: state.prizesReleased,
    snapshots,
    // Versions the /og.png URL so link unfurlers refetch after a text change.
    ogVersion: ogHash(ogTextFor(config, phase)),
    // Shows the archive entry point only once there is something in it.
    archiveCount: state.archive.length,
  };
});
