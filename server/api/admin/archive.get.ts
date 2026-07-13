// Full finalized results (with standings) for the admin archive list + download.
export default defineEventHandler(async () => {
  const state = await readRuntimeState();
  return state.archive;
});
