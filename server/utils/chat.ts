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

export function addClient(stream: EventStream): void {
  clients.add(stream);
}

export function removeClient(stream: EventStream): void {
  clients.delete(stream);
}

export async function broadcast(message: ChatMessage): Promise<void> {
  const data = JSON.stringify(message);
  await Promise.all([...clients].map((c) => c.push(data)));
}

// Named "clear" SSE event so open clients empty their view live on moderation.
export async function broadcastClear(): Promise<void> {
  await Promise.all([...clients].map((c) => c.push({ event: "clear", data: "1" })));
}

// Named "remove" event carrying the id, for a hard delete (self-delete). A
// tombstone (admin delete) rides the default event as an updated message.
export async function broadcastRemove(id: string): Promise<void> {
  await Promise.all([...clients].map((c) => c.push({ event: "remove", data: id })));
}

export function isChatAdmin(login: string): boolean {
  const admins = String(useRuntimeConfig().chatAdmins)
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(login.toLowerCase());
}
