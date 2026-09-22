<script setup lang="ts">
import type { LeaderboardEntry } from "#shared/types/event";
import type { ScoringRules } from "#shared/types/scoring";
import { scoreUnit } from "#shared/utils/scoring";

const { entry, rules } = defineProps<{ entry: LeaderboardEntry; rules?: ScoringRules }>();
</script>

<template>
  <div class="relative flex flex-col items-center gap-2 py-4">
    <div
      class="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl"
      aria-hidden="true"
    />

    <span
      class="i-ph-crown-fill text-3xl text-amber [filter:drop-shadow(0_0_12px_var(--amber))]"
      aria-hidden="true"
    />
    <p class="font-mono text-[0.7rem] uppercase tracking-[0.35em] text-amber">Champion</p>

    <img
      :src="entry.avatarUrl"
      :alt="entry.login"
      width="112"
      height="112"
      class="h-28 w-28 rounded-full border-2 border-primary object-cover [filter:drop-shadow(0_0_24px_rgba(0,220,130,0.5))] animate-champ-in motion-reduce:animate-none"
    />

    <h2
      class="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-mint [text-shadow:0_0_18px_rgba(0,220,130,0.5)]"
    >
      {{ entry.name || entry.login }}
    </h2>
    <p class="font-mono text-sm text-muted">@{{ entry.login }}</p>
    <p class="font-mono text-sm text-primary">{{ scoreUnit(rules, entry.score) }}</p>
  </div>
</template>
