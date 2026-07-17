<script setup lang="ts">
// Fed by ChatWidget's SSE "presence" events (count of open connections).
const online = useState<number>("chat-online", () => 0);
</script>

<template>
  <div
    v-if="online > 0"
    class="inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted"
  >
    <span
      class="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(0,220,130,0.7)] animate-pulse motion-reduce:animate-none"
      aria-hidden="true"
    />
    currently {{ online }} {{ online === 1 ? "user" : "users" }} online
  </div>
</template>
