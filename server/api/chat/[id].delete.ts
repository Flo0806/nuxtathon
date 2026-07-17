const SELF_DELETE_MS = 5 * 60 * 1000;

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Missing id" });

  // Admin: tombstone (kept as "deleted"). Author: hard delete within the window.
  // The whole read-modify-write runs under the chat lock; broadcast after.
  const result = await withChatLock(async () => {
    const messages = await readMessages();
    const message = messages.find((m) => m.id === id);
    if (!message || message.deleted) return { kind: "noop" as const };

    if (isChatAdmin(user.login)) {
      message.deleted = true;
      await writeMessages(messages);
      return { kind: "tombstone" as const, message };
    }
    const own = message.login.toLowerCase() === user.login.toLowerCase();
    const fresh = Date.now() - Date.parse(message.at) < SELF_DELETE_MS;
    if (own && fresh) {
      await writeMessages(messages.filter((m) => m.id !== id));
      return { kind: "remove" as const };
    }
    return { kind: "forbidden" as const };
  });

  if (result.kind === "forbidden") {
    throw createError({ statusCode: 403, statusMessage: "Not allowed" });
  }
  if (result.kind === "tombstone") await broadcast(result.message);
  if (result.kind === "remove") await broadcastRemove(id);
  return { ok: true };
});
