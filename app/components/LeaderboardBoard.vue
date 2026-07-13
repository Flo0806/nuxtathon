<script setup lang="ts">
import type { LeaderboardEntry } from "#shared/types/event";

defineProps<{ entries: LeaderboardEntry[] }>();

const pad = (n: number) => String(n).padStart(2, "0");
</script>

<template>
  <ol class="panel mx-auto w-full max-w-[42rem] divide-y divide-line/60">
    <li
      v-for="e in entries"
      :key="e.login"
      class="flex items-center gap-4 px-4 py-3"
      :class="e.rank > 10 ? 'opacity-45' : ''"
    >
      <span
        class="w-9 shrink-0 text-right font-mono text-sm tabular-nums"
        :class="e.rank === 1 ? 'text-primary' : 'text-muted'"
      >
        {{ pad(e.rank) }}
      </span>
      <img
        :src="e.avatarUrl"
        :alt="e.login"
        width="40"
        height="40"
        loading="lazy"
        class="h-10 w-10 shrink-0 rounded-full border border-line object-cover"
        :class="e.rank === 1 ? 'ring-2 ring-primary' : ''"
      />
      <div class="min-w-0 flex-1 text-left">
        <p class="truncate font-mono text-sm text-fg">{{ e.name || e.login }}</p>
        <p class="truncate font-mono text-[0.7rem] text-muted">@{{ e.login }}</p>
      </div>
      <div class="shrink-0 text-right">
        <p class="font-mono text-lg font-extrabold leading-none tabular-nums text-primary">
          {{ e.score }}
        </p>
        <p class="mt-1 font-mono text-[0.6rem] uppercase tracking-wider text-muted">
          solved · {{ e.mergedPRs }} prs
        </p>
      </div>
    </li>
  </ol>
</template>
