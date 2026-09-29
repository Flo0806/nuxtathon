<script setup lang="ts">
import type { IssueRef } from "#shared/types/issue-ref";
import type { ReviewDecision, ReviewItem } from "#shared/types/review";
import { V5_LABEL } from "#shared/types/review";
import { issueRefUrl, splitIssueRef } from "#shared/utils/issue-ref";

definePageMeta({ layout: "admin" });

interface Review {
  updatedAt: string;
  open: ReviewItem[];
  decided: ReviewDecision[];
  frozen: boolean;
}

const auth = useAdminAuth();
const toast = useToast();
const review = ref<Review | null>(null);
// Points typed per PR, prefilled with the suggestion and kept across reloads of
// the list so a half-done edit is not lost when another row is decided.
const points = reactive<Record<string, number>>({});
const busy = ref<IssueRef | null>(null);

async function load() {
  review.value = await $fetch<Review>("/api/admin/review", { headers: auth.authHeaders() });
  for (const item of review.value.open) points[item.ref] ??= item.suggested;
}
const { visible } = useAdminPage(load);

async function decide(ref: IssueRef, status: "confirmed" | "rejected" | "open") {
  busy.value = ref;
  try {
    await $fetch("/api/admin/review", {
      method: "POST",
      headers: auth.authHeaders(),
      body: { ref, status, points: points[ref] },
    });
    await load();
  } catch (e) {
    if (!auth.handle401(e)) toast.error(errMsg(e));
  } finally {
    busy.value = null;
  }
}

const day = (iso: string) => iso.slice(0, 16).replace("T", " ");
const isV5 = (labels: string[]) => labels.some((l) => l.toLowerCase() === V5_LABEL);
const repo = (ref: IssueRef) => splitIssueRef(ref).repo;
const number = (ref: IssueRef) => splitIssueRef(ref).number;
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-6">
    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      Merged pull requests in the event's scope that do not score on their own: they close no issue
      from before the cutoff, or the people behind them maintain that repository. Confirm one and
      every person listed gets the points you set; reject it and it counts nothing. Both can be
      undone until the event is fired. PRs that close a qualifying issue score automatically and
      never show up here; bots and core-team-only PRs neither. The list is refreshed with the
      leaderboard, every five minutes while the event runs.
    </p>

    <p
      v-if="review?.frozen"
      class="panel px-4 py-3 font-mono text-[0.72rem] text-amber"
      role="status"
    >
      The event is fired. Decisions are frozen with the result.
    </p>

    <template v-if="review">
      <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
        To review ({{ review.open.length }})<template v-if="review.updatedAt">
          , as of {{ day(review.updatedAt) }} UTC</template
        >
      </span>
      <p
        v-if="!review.open.length"
        class="panel px-6 py-10 text-center font-mono text-sm text-muted"
      >
        Nothing to review{{
          review.updatedAt ? "" : " yet: the list fills once the event is live"
        }}.
      </p>
      <div v-else class="panel divide-y divide-line/60">
        <div
          v-for="item in review.open"
          :key="item.ref"
          class="flex flex-col gap-2 px-4 py-3 font-mono text-[0.72rem]"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              class="rounded-sm border border-amber/50 bg-amber/10 px-1.5 py-px text-[0.62rem] font-bold text-amber"
              >{{ repo(item.ref) }}</span
            >
            <a
              :href="issueRefUrl(item.ref)"
              target="_blank"
              rel="noopener noreferrer"
              class="min-w-0 flex-1 truncate text-fg hover:text-primary hover:underline"
              >#{{ number(item.ref) }} {{ item.title }}</a
            >
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
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model.number="points[item.ref]"
              type="number"
              step="0.5"
              min="0.5"
              class="input w-20"
              :aria-label="`points for ${item.ref}`"
              :disabled="review.frozen || busy === item.ref"
            />
            <span class="text-muted">suggested {{ item.suggested }}</span>
            <button
              class="btn"
              :disabled="review.frozen || busy === item.ref"
              @click="decide(item.ref, 'confirmed')"
            >
              <span class="i-ph-check" aria-hidden="true" />
              Confirm
            </button>
            <button
              class="btn"
              :disabled="review.frozen || busy === item.ref"
              @click="decide(item.ref, 'rejected')"
            >
              <span class="i-ph-x" aria-hidden="true" />
              Reject
            </button>
          </div>
        </div>
      </div>

      <template v-if="review.decided.length">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
          Decided ({{ review.decided.length }})
        </span>
        <div class="panel divide-y divide-line/60">
          <div
            v-for="d in review.decided"
            :key="d.ref"
            class="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2 font-mono text-[0.72rem]"
          >
            <span
              class="w-24 font-bold uppercase tracking-wider"
              :class="d.status === 'confirmed' ? 'text-primary' : 'text-faint'"
            >
              {{ d.status === "confirmed" ? `+${d.points}` : "rejected" }}
            </span>
            <a
              :href="issueRefUrl(d.ref)"
              target="_blank"
              rel="noopener noreferrer"
              class="min-w-0 flex-1 truncate text-fg hover:text-primary hover:underline"
              >{{ repo(d.ref) }}#{{ number(d.ref) }} {{ d.title }}</a
            >
            <span class="text-muted">{{ d.people.map((p) => `@${p}`).join(", ") }}</span>
            <button
              v-if="!review.frozen"
              class="text-muted hover:text-primary hover:underline"
              :disabled="busy === d.ref"
              @click="decide(d.ref, 'open')"
            >
              undo
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
