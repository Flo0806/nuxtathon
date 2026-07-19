<script setup lang="ts">
import type { ChatMessage } from "#shared/types/chat";

const { loggedIn, user } = useUserSession();

const open = ref(false);
const messages = ref<ChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const listEl = ref<HTMLElement | null>(null);
let source: EventSource | undefined;
const now = ref(Date.now());
const online = useState<number>("chat-online", () => 0);
let ticker: ReturnType<typeof setInterval> | undefined;
// Keep the in-memory list bounded on a long-lived tab (server history is capped).
const MAX_CLIENT = 200;

async function scrollToBottom() {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  try {
    // The message echoes back over SSE, so no optimistic insert.
    await $fetch("/api/chat", { method: "POST", body: { text } });
    draft.value = "";
  } catch {
    // Keep the draft on error (e.g. rate-limited) so the user can retry.
  } finally {
    sending.value = false;
  }
}

async function clearChat() {
  await $fetch("/api/chat/clear", { method: "POST" });
  messages.value = [];
}

function canDelete(m: ChatMessage): boolean {
  if (m.deleted) return false;
  if (user.value?.isChatAdmin) return true;
  return (
    m.login.toLowerCase() === user.value?.login.toLowerCase() &&
    now.value - Date.parse(m.at) < 5 * 60 * 1000
  );
}

async function deleteMessage(id: string) {
  await $fetch(`/api/chat/${id}`, { method: "DELETE" });
}

async function loadHistory() {
  const { messages: history } = await $fetch<{ messages: ChatMessage[] }>("/api/chat/history");
  messages.value = history;
  scrollToBottom();
}

onMounted(async () => {
  await loadHistory();

  source = new EventSource("/api/chat/stream");
  // A reconnect can miss events sent during the gap; re-sync the full history
  // then. The first open is the initial connect, already loaded above.
  let firstOpen = true;
  source.onopen = () => {
    if (firstOpen) {
      firstOpen = false;
      return;
    }
    loadHistory();
  };
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data) as ChatMessage;
    const i = messages.value.findIndex((m) => m.id === msg.id);
    if (i >= 0) {
      messages.value[i] = msg;
    } else {
      messages.value.push(msg);
      if (messages.value.length > MAX_CLIENT) {
        messages.value.splice(0, messages.value.length - MAX_CLIENT);
      }
      scrollToBottom();
    }
  };
  source.addEventListener("presence", (e) => {
    online.value = Number((e as MessageEvent).data) || 0;
  });
  source.addEventListener("remove", (e) => {
    messages.value = messages.value.filter((m) => m.id !== (e as MessageEvent).data);
  });
  source.addEventListener("clear", () => {
    messages.value = [];
  });

  ticker = setInterval(() => (now.value = Date.now()), 15000);
});

onBeforeUnmount(() => {
  source?.close();
  if (ticker) clearInterval(ticker);
});

watch(open, (v) => v && scrollToBottom());
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 text-left">
    <div
      v-if="open"
      class="panel flex h-[60vh] max-h-[26rem] w-[calc(100vw-2rem)] max-w-[21rem] flex-col overflow-hidden md:max-h-[32rem] md:max-w-[24rem] lg:max-h-[38rem] lg:max-w-[27rem]"
    >
      <header class="flex items-center justify-between border-b border-line px-3 py-2">
        <span class="font-mono text-xs uppercase tracking-wider text-primary">Community chat</span>
        <div class="flex items-center gap-3">
          <button
            v-if="user?.isChatAdmin"
            class="font-mono text-[0.65rem] uppercase tracking-wider text-muted transition-colors hover:text-red-400"
            @click="clearChat"
          >
            clear
          </button>
          <button
            class="text-muted transition-colors hover:text-fg"
            aria-label="Close"
            @click="open = false"
          >
            <span class="i-ph-x block" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div ref="listEl" class="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <p v-if="!messages.length" class="font-mono text-xs text-muted">No messages yet. Say hi.</p>
        <div v-for="m in messages" :key="m.id" class="flex items-start gap-2">
          <img
            :src="m.avatarUrl"
            :alt="m.login"
            class="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line"
          />
          <div class="min-w-0 flex-1">
            <span class="font-mono text-[0.7rem] text-primary">{{ m.login }}</span>
            <p v-if="m.deleted" class="text-sm italic text-muted">message deleted</p>
            <p v-else class="whitespace-pre-wrap break-words text-sm text-fg">{{ m.text }}</p>
          </div>
          <button
            v-if="canDelete(m)"
            class="mt-0.5 shrink-0 text-red-400 transition-colors hover:text-red-500"
            aria-label="Delete message"
            @click="deleteMessage(m.id)"
          >
            <span class="i-ph-trash-simple block text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      <footer class="border-t border-line p-2">
        <form v-if="loggedIn" class="flex gap-2" @submit.prevent="send">
          <input
            v-model="draft"
            maxlength="500"
            placeholder="Message..."
            class="input min-w-0 flex-1"
          />
          <button class="btn shrink-0" :disabled="sending || !draft.trim()">Send</button>
        </form>
        <a v-else href="/auth/github" class="btn w-full justify-center">
          <span class="i-simple-icons-github" aria-hidden="true" />
          Login to chat
        </a>
      </footer>
    </div>

    <button class="btn" @click="open = !open">
      <span class="i-ph-chat-circle block" aria-hidden="true" />
      Chat
    </button>
  </div>
</template>
