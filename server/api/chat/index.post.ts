import { randomUUID } from "node:crypto";
import type { ChatMessage } from "#shared/types/chat";

export default defineEventHandler(async (event) => {
  // Auth gate: only logged-in GitHub users may post. Throws 401 otherwise.
  const { user } = await requireUserSession(event);
  if (isRateLimited(user.login)) {
    throw createError({ statusCode: 429, statusMessage: "Slow down" });
  }

  const body = await readBody<{ text?: string }>(event);
  const text = String(body?.text ?? "")
    .trim()
    .slice(0, 500);
  if (!text) throw createError({ statusCode: 400, statusMessage: "Empty message" });

  const message: ChatMessage = {
    id: randomUUID(),
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    text,
    at: new Date().toISOString(),
  };

  await appendMessage(message);
  await broadcast(message);
  return message;
});
