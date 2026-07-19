<script setup lang="ts">
import type { ContributionIds, LeaderboardEntry } from "#shared/types/event";

const { entry, contributions } = defineProps<{
  entry: LeaderboardEntry;
  contributions?: ContributionIds;
}>();

const linkIssues = computed(() => githubList("issue", idsFor(entry, "issues")));
const linkPrs = computed(() => githubList("pr", idsFor(entry, "prs")));

const pad = (n: number) => String(n).padStart(2, "0");

// Deep-link a user's credited issues/PRs by their exact nuxt/nuxt numbers.
// Empty list -> no link (plain text), so the count still renders.
function githubList(kind: "issue" | "pr", ids: number[]): string | null {
  if (!ids.length) return null;
  const path = kind === "pr" ? "pulls" : "issues";
  return `https://github.com/nuxt/nuxt/${path}?q=${encodeURIComponent(ids.join(" "))}`;
}

function idsFor(e: LeaderboardEntry, kind: "issues" | "prs"): number[] {
  const c = contributions?.[e.login];
  return c?.[kind] ?? [];
}
</script>

<template>
  <div
    class="flex items-center gap-4 px-4 py-3 transition-opacity duration-500"
    :class="entry.rank > 10 ? 'opacity-45' : ''"
  >
    <span
      class="w-7 shrink-0 text-right font-mono text-sm tabular-nums"
      :class="entry.rank === 1 ? 'text-primary' : 'text-muted'"
    >
      {{ pad(entry.rank) }}
    </span>

    <img
      :src="entry.avatarUrl"
      :alt="entry.login"
      width="40"
      height="40"
      loading="lazy"
      class="h-10 w-10 shrink-0 rounded-full border border-line object-cover"
      :class="entry.rank === 1 ? 'ring-2 ring-primary' : ''"
    />

    <div class="min-w-0 flex-1 text-left">
      <p class="truncate font-mono text-sm text-fg">{{ entry.name || entry.login }}</p>
      <p class="truncate font-mono text-[0.7rem] text-muted">
        <NuxtLink
          class="hover:text-primary hover:underline"
          :href="`https://github.com/${entry.login}`"
          target="_blank"
          >@{{ entry.login }}</NuxtLink
        >
      </p>
    </div>

    <div class="shrink-0 text-right">
      <p class="font-mono text-lg font-extrabold leading-none tabular-nums text-primary">
        {{ entry.score }}
      </p>

      <p class="mt-1 font-mono text-[0.6rem] uppercase tracking-wider text-muted">
        <NuxtLink
          v-if="linkIssues"
          class="hover:text-primary hover:underline"
          :href="linkIssues"
          target="_blank"
          >{{ entry.closedIssues }} issues</NuxtLink
        >
        <span v-else>{{ entry.closedIssues }} issues</span>

        <span> · </span>

        <NuxtLink
          v-if="linkPrs"
          class="hover:text-primary hover:underline"
          :href="linkPrs"
          target="_blank"
          >{{ entry.mergedPRs }} prs</NuxtLink
        >
        <span v-else>{{ entry.mergedPRs }} prs</span>
      </p>
    </div>
  </div>
</template>
