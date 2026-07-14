<script setup lang="ts">
import type { EventStats } from "#shared/types/event";

defineProps<{ stats: EventStats | null }>();

const tiles = [
  { key: "submitted", label: "PRs submitted", icon: "i-ph-git-pull-request", tone: "text-fg" },
  { key: "merged", label: "PRs merged", icon: "i-ph-git-merge", tone: "text-mint" },
  { key: "issuesClosed", label: "Issues closed", icon: "i-ph-check-circle", tone: "text-primary" },
] as const;
</script>

<template>
  <div class="grid w-full grid-cols-3 gap-3">
    <div v-for="t in tiles" :key="t.key" class="panel flex flex-col items-center gap-1 px-3 py-4">
      <span class="text-lg text-muted" :class="t.icon" aria-hidden="true" />
      <span class="font-mono text-2xl font-extrabold tabular-nums" :class="t.tone">
        {{ stats ? stats[t.key] : 0 }}
      </span>
      <span class="font-mono text-[0.6rem] uppercase tracking-wider text-muted">{{ t.label }}</span>
    </div>
  </div>
</template>
