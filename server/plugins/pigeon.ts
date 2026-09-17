// Discord credentials live in the admin settings, so pigeon (runtime mode)
// has to be told on boot. Failure here must not stop the server.
export default defineNitroPlugin(async () => {
  try {
    await configureDiscord();
  } catch (e) {
    console.error("[pigeon] discord configure failed:", e);
  }
});
