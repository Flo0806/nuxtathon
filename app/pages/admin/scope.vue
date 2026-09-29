<script setup lang="ts">
import type { IssueRef } from "#shared/types/issue-ref";
import { issueRefUrl } from "#shared/utils/issue-ref";

definePageMeta({ layout: "admin" });

interface CheckResult {
  summary: string;
  ms: number;
  searches: { search: string; count: number }[];
  prs: {
    ref: IssueRef;
    author: string;
    bot: boolean;
    createdAt: string;
    mergedAt: string;
    closes: { ref: IssueRef; createdAt: string }[];
  }[];
}

const toast = useToast();
const auth = useAdminAuth();

// Last full weekend in UTC, the natural test window for a two-day event.
function lastWeekend(): { from: string; to: string } {
  const d = new Date();
  const back = ((d.getUTCDay() + 1) % 7) + 7;
  const saturday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
  const sunday = new Date(saturday.getTime() + 86_400_000);
  return { from: saturday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

const range = reactive(lastWeekend());
const result = ref<CheckResult | null>(null);
const busy = ref(false);

async function run() {
  busy.value = true;
  try {
    result.value = await $fetch<CheckResult>("/api/admin/scope-check", {
      method: "POST",
      headers: auth.authHeaders(),
      // Whole days in UTC, inclusive, like an event weekend.
      body: { from: `${range.from}T00:00:00Z`, to: `${range.to}T23:59:59Z` },
    });
  } catch (e) {
    if (!auth.handle401(e)) toast.error(errMsg(e));
  } finally {
    busy.value = false;
  }
}

// Nothing to preload; the gate only keeps the page out of SSR and behind login.
const { visible } = useAdminPage(async () => {});

const day = (iso: string) => iso.slice(0, 16).replace("T", " ");
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
        Runs the saved scope against a window and lists every merged pull request opened in it,
        exactly as the leaderboard will look them up. Nothing here changes the board. Each run asks
        GitHub live, so pick past weekends rather than clicking repeatedly.
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">From (UTC)</span>
        <input v-model="range.from" type="date" class="input" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">To (UTC)</span>
        <input v-model="range.to" type="date" class="input" />
      </label>
      <button class="btn" :disabled="busy" @click="run">
        <span :class="busy ? 'i-ph-spinner animate-spin' : 'i-ph-play'" aria-hidden="true" />
        Run
      </button>
    </div>

    <template v-if="result">
      <p class="panel px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-mint">
        {{ result.summary }}
      </p>

      <div class="flex flex-col gap-1">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
          Searches ({{ result.ms }} ms)
        </span>
        <p v-for="s in result.searches" :key="s.search" class="font-mono text-[0.68rem] text-muted">
          <span class="inline-block w-10 text-right text-fg">{{ s.count }}</span>
          {{ s.search }}
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
          Pull requests ({{ result.prs.length }}, duplicates across searches removed)
        </span>
        <p
          v-if="!result.prs.length"
          class="panel px-4 py-6 text-center font-mono text-xs text-muted"
        >
          Nothing merged was opened in this window.
        </p>
        <div v-else class="panel divide-y divide-line/60">
          <div
            v-for="pr in result.prs"
            :key="pr.ref"
            class="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2 font-mono text-[0.72rem]"
          >
            <a
              :href="issueRefUrl(pr.ref)"
              target="_blank"
              rel="noopener noreferrer"
              class="w-64 text-fg hover:text-primary hover:underline"
              >{{ pr.ref }}</a
            >
            <span class="w-40 truncate" :class="pr.bot ? 'text-faint' : 'text-muted'">
              @{{ pr.author }}<span v-if="pr.bot"> (bot)</span>
            </span>
            <span class="text-muted">opened {{ day(pr.createdAt) }}</span>
            <span class="text-muted">merged {{ day(pr.mergedAt) }}</span>
            <span class="text-muted">
              closes
              <template v-if="pr.closes.length">
                <a
                  v-for="c in pr.closes"
                  :key="c.ref"
                  :href="issueRefUrl(c.ref)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mr-2 text-amber hover:underline"
                  >{{ c.ref }}</a
                >
              </template>
              <span v-else>nothing</span>
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
