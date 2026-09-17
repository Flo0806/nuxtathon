// Social preview, rendered from the resolved config (a fired event serves its
// archived one) and cached per text variant. The URL carries the same hash as
// `v=` so link unfurlers re-fetch after a settings change instead of reusing
// the picture they cached for the previous event.
export default defineEventHandler(async (event) => {
  setHeader(event, "content-type", "image/png");
  setHeader(event, "cache-control", "public, max-age=3600");

  try {
    const state = await readRuntimeState();
    const config = state.final?.config ?? (await resolveEventConfig());
    const phase = resolvePhase(config, state.prizesReleased);
    const text = ogTextFor(config, phase);
    const key = `og:${ogHash(text)}`;

    const cache = useStorage("cache");
    const hit = await cache.getItemRaw<Buffer>(key);
    if (hit) return hit;

    const png = renderOgPng(await ogFontFiles(), text);
    await cache.setItemRaw(key, png);
    return png;
  } catch (e) {
    // Static picture of the first event rather than a broken preview.
    console.error("[og] render failed, serving fallback:", e);
    return sendRedirect(event, "/og-fallback.png", 302);
  }
});
