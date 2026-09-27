<script setup lang="ts">
import type { EventStats } from "#shared/types/event";

const { stats } = defineProps<{ stats: EventStats | null }>();

const TILES = [
  { key: "submitted", label: "PRs submitted", icon: "i-ph-git-pull-request", tone: "text-fg" },
  { key: "merged", label: "PRs merged", icon: "i-ph-git-merge", tone: "text-mint" },
  { key: "issuesClosed", label: "Issues closed", icon: "i-ph-check-circle", tone: "text-primary" },
  { key: "upvotes", label: "Community upvotes", icon: "i-ph-thumbs-up", tone: "text-amber" },
] as const;

// Upvotes are missing on events archived before the counter existed, so that one
// tile is dropped rather than claiming zero. The other three always render, also
// while the board is still loading.
const tiles = computed(() =>
  TILES.filter((t) => t.key !== "upvotes" || stats?.upvotes !== undefined),
);
</script>

<template>
  <div
    class="grid w-full gap-3"
    :class="tiles.length > 3 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'"
  >
    <div v-for="t in tiles" :key="t.key" class="panel flex flex-col items-center gap-1 px-3 py-4">
      <span class="text-lg text-muted" :class="t.icon" aria-hidden="true" />
      <span class="font-mono text-2xl font-extrabold tabular-nums" :class="t.tone">
        {{ stats?.[t.key] ?? 0 }}
      </span>
      <span class="font-mono text-[0.6rem] uppercase tracking-wider text-muted">{{ t.label }}</span>
    </div>
  </div>
</template>
