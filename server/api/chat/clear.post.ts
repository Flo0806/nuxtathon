// Chat moderation: wipe history. Gated by GitHub login against NUXT_CHAT_ADMINS,
// re-checked here (never trust the client) and broadcast so open pages clear live.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!isChatAdmin(user.login)) {
    throw createError({ statusCode: 403, statusMessage: "Not a chat admin" });
  }
  await clearMessages();
  await broadcastClear();
  return { ok: true };
});
