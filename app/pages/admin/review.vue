<script setup lang="ts">
import type { ReviewQueue } from "#shared/types/review";
import { V5_LABEL } from "#shared/types/review";
import { issueRefUrl, splitIssueRef } from "#shared/utils/issue-ref";

definePageMeta({ layout: "admin" });

const auth = useAdminAuth();
const queue = ref<ReviewQueue | null>(null);

async function load() {
  queue.value = await $fetch<ReviewQueue>("/api/admin/review", { headers: auth.authHeaders() });
}
const { visible } = useAdminPage(load);

const day = (iso: string) => iso.slice(0, 16).replace("T", " ");
const isV5 = (labels: string[]) => labels.some((l) => l.toLowerCase() === V5_LABEL);
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-6">
    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      Merged pull requests in the event's scope that do not score on their own: they close no issue
      from before the cutoff, or the people behind them maintain that repository. You decide whether
      they count and for how many points. PRs that close a qualifying issue score automatically and
      never show up here; bots and core-team-only PRs neither. The list is refreshed with the
      leaderboard, every five minutes while the event runs.
    </p>

    <p
      v-if="queue && !queue.items.length"
      class="panel px-6 py-10 text-center font-mono text-sm text-muted"
    >
      Nothing to review{{ queue.updatedAt ? "" : " yet: the list fills once the event is live" }}.
    </p>

    <template v-else-if="queue">
      <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
        To review ({{ queue.items.length }}), as of {{ day(queue.updatedAt) }} UTC
      </span>
      <div class="panel divide-y divide-line/60">
        <div
          v-for="item in queue.items"
          :key="item.ref"
          class="flex flex-col gap-1 px-4 py-3 font-mono text-[0.72rem]"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              class="rounded-sm border border-amber/50 bg-amber/10 px-1.5 py-px text-[0.62rem] font-bold text-amber"
              >{{ splitIssueRef(item.ref).repo }}</span
            >
            <a
              :href="issueRefUrl(item.ref)"
              target="_blank"
              rel="noopener noreferrer"
              class="min-w-0 flex-1 truncate text-fg hover:text-primary hover:underline"
              >#{{ splitIssueRef(item.ref).number }} {{ item.title }}</a
            >
            <span class="text-mint">suggested {{ item.suggested }}</span>
          </div>
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-muted">
            <span>
              points to
              <span class="text-fg">{{ item.people.map((p) => `@${p}`).join(", ") }}</span>
            </span>
            <span>{{ item.reason }}</span>
            <span v-if="item.maintainers.length" class="text-amber">
              maintainer {{ item.maintainers.map((m) => `@${m}`).join(", ") }}
            </span>
            <span v-if="isV5(item.labels)" class="font-bold text-amber">v5 migration</span>
            <span>merged {{ day(item.mergedAt) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
