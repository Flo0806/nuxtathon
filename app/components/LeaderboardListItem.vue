<script setup lang="ts">
import type { ContributionIds, LeaderboardEntry } from "#shared/types/event";
import type { IssueRef } from "#shared/types/issue-ref";
import { HOME_REPO, issueRefUrl, splitIssueRef } from "#shared/utils/issue-ref";

const { entry, contributions, certificateBase } = defineProps<{
  entry: LeaderboardEntry;
  contributions?: ContributionIds;
  // Archive only: "/archive/<slug>/certificate" turns on the download.
  certificateBase?: string;
}>();

const pad = (n: number) => String(n).padStart(2, "0");

type Kind = "issues" | "prs";

function refsFor(kind: Kind): IssueRef[] {
  return contributions?.[entry.login]?.[kind] ?? [];
}

// Grouped by repo, the home repo first, then alphabetical. Numbers sorted so a
// long list reads like GitHub's own.
function groups(kind: Kind): { repo: string; refs: IssueRef[] }[] {
  const byRepo = new Map<string, IssueRef[]>();
  for (const ref of refsFor(kind)) {
    const { repo } = splitIssueRef(ref);
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), ref]);
  }
  return [...byRepo]
    .sort(([a], [b]) => Number(b === HOME_REPO) - Number(a === HOME_REPO) || a.localeCompare(b))
    .map(([repo, refs]) => ({
      repo,
      refs: refs.sort((x, y) => splitIssueRef(x).number - splitIssueRef(y).number),
    }));
}

// Everything in one repo: GitHub's list search shows them all on one page.
// Across repos no single GitHub URL can, so the row expands a list instead,
// built from the refs the board already carries (no extra request).
function githubList(kind: Kind): string | null {
  const g = groups(kind);
  if (g.length !== 1) return null;
  const { repo, refs } = g[0]!;
  const ids = refs.map((r) => splitIssueRef(r).number);
  return `https://github.com/${repo}/${kind === "prs" ? "pulls" : "issues"}?q=${encodeURIComponent(ids.join(" "))}`;
}

const linkIssues = computed(() => githubList("issues"));
const linkPrs = computed(() => githubList("prs"));
const expandable = (kind: Kind) => groups(kind).length > 1;

const open = ref<Kind | null>(null);
const toggle = (kind: Kind) => (open.value = open.value === kind ? null : kind);
</script>

<template>
  <div class="transition-opacity duration-500" :class="entry.rank > 10 ? 'opacity-45' : ''">
    <div class="flex items-center gap-4 px-4 py-3">
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
          <template v-for="(kind, i) in ['issues', 'prs'] as const" :key="kind">
            <span v-if="i"> · </span>
            <NuxtLink
              v-if="kind === 'issues' ? linkIssues : linkPrs"
              class="hover:text-primary hover:underline"
              :href="(kind === 'issues' ? linkIssues : linkPrs)!"
              target="_blank"
              >{{ kind === "issues" ? entry.closedIssues : entry.mergedPRs }} {{ kind }}</NuxtLink
            >
            <button
              v-else-if="expandable(kind)"
              class="uppercase tracking-wider hover:text-primary hover:underline"
              :class="open === kind ? 'text-primary' : ''"
              :aria-expanded="open === kind"
              @click="toggle(kind)"
            >
              {{ kind === "issues" ? entry.closedIssues : entry.mergedPRs }} {{ kind }}
              <span
                class="i-ph-caret-down inline-block align-[-1px] transition-transform"
                :class="open === kind ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>
            <span v-else>
              {{ kind === "issues" ? entry.closedIssues : entry.mergedPRs }} {{ kind }}
            </span>
          </template>
        </p>
      </div>

      <a
        v-if="certificateBase && entry.score > 0"
        :href="`${certificateBase}/${entry.login}.pdf`"
        target="_blank"
        rel="noopener"
        class="shrink-0 text-muted transition-colors hover:text-primary"
        :title="`Certificate for ${entry.name || entry.login}`"
        :aria-label="`Download certificate for ${entry.name || entry.login}`"
      >
        <span class="i-ph-certificate block text-lg" aria-hidden="true" />
      </a>
    </div>

    <div
      v-if="open"
      class="flex flex-col gap-2 border-t border-line/40 bg-base/40 px-4 py-3 pl-[4.25rem] text-left"
    >
      <div v-for="g in groups(open)" :key="g.repo" class="flex flex-wrap items-baseline gap-x-2">
        <a
          :href="`https://github.com/${g.repo}`"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-sm border border-amber/50 bg-amber/10 px-1.5 py-px font-mono text-[0.62rem] font-bold text-amber hover:underline"
          >{{ g.repo }}</a
        >
        <a
          v-for="ref in g.refs"
          :key="ref"
          :href="issueRefUrl(ref)"
          target="_blank"
          rel="noopener noreferrer"
          class="font-mono text-[0.7rem] text-muted hover:text-primary hover:underline"
          >#{{ splitIssueRef(ref).number }}</a
        >
      </div>
    </div>
  </div>
</template>
