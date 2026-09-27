import type { EventStream } from "h3";
import type { ChatMessage } from "#shared/types/chat";

const CHAT_KEY = "chat";
const MAX_MESSAGES = 100;

// Single self-hosted instance, so a module-level set of subscribers is enough;
// no external pub/sub. Streams are added on connect and dropped on close.
const clients = new Set<EventStream>();

export async function readMessages(): Promise<ChatMessage[]> {
  return (await useStorage("state").getItem<ChatMessage[]>(CHAT_KEY)) ?? [];
}

export async function writeMessages(messages: ChatMessage[]): Promise<void> {
  await useStorage("state").setItem(CHAT_KEY, messages.slice(-MAX_MESSAGES));
}

// Serialize storage read-modify-write so concurrent posts/deletes never clobber
// each other and drop a message.
let lock: Promise<unknown> = Promise.resolve();
export function withChatLock<T>(task: () => Promise<T>): Promise<T> {
  const run = lock.then(task, task);
  lock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function appendMessage(message: ChatMessage): Promise<void> {
  await withChatLock(async () => {
    const messages = await readMessages();
    messages.push(message);
    await writeMessages(messages);
  });
}

// Per-user flood guard: at most RATE_MAX posts per RATE_WINDOW_MS.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5;
const postLog = new Map<string, number[]>();
export function isRateLimited(login: string): boolean {
  const key = login.toLowerCase();
  const now = Date.now();
  const recent = (postLog.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    postLog.set(key, recent);
    return true;
  }
  recent.push(now);
  postLog.set(key, recent);
  return false;
}

export async function clearMessages(): Promise<void> {
  await useStorage("state").removeItem(CHAT_KEY);
}

// A viewer can vanish without the socket ever closing: a sleeping laptop, dropped
// wifi, or a proxy holding the upstream connection open. The browser then opens a
// fresh EventSource while the old entry lingers, so the count would only ever
// climb. Writing to each client on a timer is the only way to notice.
const PING_MS = 20_000;
let heartbeat: ReturnType<typeof setInterval> | undefined;

export function addClient(stream: EventStream): void {
  clients.add(stream);
  if (!heartbeat) heartbeat = setInterval(() => void ping(), PING_MS);
}

export function removeClient(stream: EventStream): void {
  clients.delete(stream);
  if (clients.size === 0 && heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
}

// A push writes into a TransformStream, so it resolves once the chunk is queued,
// not once the socket took it. On a stalled connection it can therefore hang
// rather than reject, and a single one of those would block every broadcast for
// everyone. The write is raced against a deadline for that reason; the
// authoritative disconnect signal stays h3's own close handling in the route.
const WRITE_TIMEOUT_MS = 5_000;

async function deliver(stream: EventStream, payload: string | { event: string; data: string }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stream.push(payload as string),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("write timeout")), WRITE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Sends to everyone and drops whoever could not be written to. Returns true when
// the set shrank, so the caller can re-announce a count that is now wrong.
async function fanout(payload: string | { event: string; data: string }): Promise<boolean> {
  const targets = [...clients];
  const alive = await Promise.all(targets.map((c) => deliver(c, payload)));

  let dropped = false;
  alive.forEach((ok, i) => {
    const target = targets[i];
    if (ok || !target) return;
    removeClient(target);
    dropped = true;
    // Closing it lets the browser's EventSource reconnect on its own, which is
    // the right outcome either way: the connection was unusable.
    void target.close().catch(() => {});
  });
  return dropped;
}

// Keepalive. Clients never listen for it; its only job is to put bytes on the
// wire, because a connection that is never written to can never be found out.
async function ping(): Promise<void> {
  if (await fanout({ event: "ping", data: "1" })) await broadcastPresence();
}

export async function broadcast(message: ChatMessage): Promise<void> {
  await fanout(JSON.stringify(message));
}

// Named "clear" SSE event so open clients empty their view live on moderation.
export async function broadcastClear(): Promise<void> {
  await fanout({ event: "clear", data: "1" });
}

// Named "remove" event carrying the id, for a hard delete (self-delete). A
// tombstone (admin delete) rides the default event as an updated message.
export async function broadcastRemove(id: string): Promise<void> {
  await fanout({ event: "remove", data: id });
}

// Open SSE connections stand in for "online" viewers. Crawlers do not run JS so
// they never connect, which keeps bots out of the count for free.
export async function broadcastPresence(): Promise<void> {
  // Every round that drops a client makes the number it just sent wrong, so it
  // repeats with the corrected size. The set only shrinks, so this terminates.
  while (await fanout({ event: "presence", data: String(clients.size) }));
}

export function isChatAdmin(login: string): boolean {
  const admins = String(useRuntimeConfig().chatAdmins)
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(login.toLowerCase());
}
