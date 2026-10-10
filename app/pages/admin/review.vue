<script setup lang="ts">
import type { IssueRef } from "#shared/types/issue-ref";
import type { ReviewDecision, SubmittedItem } from "#shared/types/review";
import { issueRefUrl, splitIssueRef } from "#shared/utils/issue-ref";

definePageMeta({ layout: "admin" });

interface Submitted {
  updatedAt: string;
  registry: {
    updatedAt: string;
    repos: number;
    searches: number;
    running: boolean;
    lastAttemptAt: string;
    lastError: string;
    pausedReason: string;
  };
  items: SubmittedItem[];
  decisions: Record<string, ReviewDecision>;
  frozen: boolean;
}

const auth = useAdminAuth();
const toast = useToast();
const data = ref<Submitted | null>(null);
// Kept across reloads so a half-typed number survives another row's decision.
const points = reactive<Record<string, number>>({});
const busy = ref<IssueRef | null>(null);

async function load() {
  data.value = await $fetch<Submitted>("/api/admin/review", { headers: auth.authHeaders() });
  for (const item of data.value.items) points[item.ref] ??= item.suggested;
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

const ORDER: Record<SubmittedItem["state"], number> = { open: 0, merged: 1, closed: 2 };
const STATE_TONE: Record<SubmittedItem["state"], string> = {
  open: "text-amber border-amber/50",
  merged: "text-primary border-primary/50",
  closed: "text-faint border-line",
};

const repoFilter = ref("");
const repoCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const i of data.value?.items ?? []) {
    counts.set(repo(i.ref), (counts.get(repo(i.ref)) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
});
const shown = computed(() =>
  (data.value?.items ?? [])
    .filter((i) => !repoFilter.value || repo(i.ref) === repoFilter.value)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.createdAt.localeCompare(b.createdAt)),
);
const count = (state: SubmittedItem["state"]) =>
  data.value?.items.filter((i) => i.state === state).length ?? 0;
// Decisions on PRs that left the list (the window changed); shown so they can be undone.
const orphans = computed(() => {
  const listed = new Set(data.value?.items.map((i) => i.ref));
  return Object.values(data.value?.decisions ?? {}).filter((d) => !listed.has(d.ref));
});

const scanning = ref(false);
let poll: ReturnType<typeof setTimeout> | undefined;

// The search runs on the server for about two minutes; follow it until it ends.
async function follow() {
  try {
    await load();
  } catch {
    // A failed poll must not leave the page stuck on "searching".
    scanning.value = false;
    return;
  }
  if (data.value?.registry.running) {
    poll = setTimeout(follow, 5000);
  } else {
    scanning.value = false;
  }
}

async function scanNow() {
  scanning.value = true;
  try {
    const res = await $fetch<{ running: boolean }>("/api/admin/review-scan", {
      method: "POST",
      headers: auth.authHeaders(),
    });
    if (res.running) toast.success("Registry search started, it takes about two minutes");
    else toast.success("Searched less than ten minutes ago, showing that result");
    await follow();
  } catch (e) {
    scanning.value = false;
    if (!auth.handle401(e)) toast.error(errMsg(e));
  }
}
onBeforeUnmount(() => clearTimeout(poll));

const day = (iso: string) => iso.slice(0, 16).replace("T", " ");
const repo = (ref: IssueRef) => splitIssueRef(ref).repo;
const number = (ref: IssueRef) => splitIssueRef(ref).number;
const handles = (logins: string[]) => logins.map((l) => `@${l}`).join(", ");
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-6">
    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      Every pull request opened during the event. Merged ones score automatically, except bots,
      core-team-only work and maintainers on their own repository; "Don't count" takes one off the
      board. An open one can get points by hand when its maintainer is not around to merge it; once
      it is merged it scores on its own instead. Everything can be undone until the event is fired.
      The list is refreshed with the leaderboard, every five minutes while the event runs.
    </p>

    <p
      v-if="data?.frozen"
      class="panel px-4 py-3 font-mono text-[0.72rem] text-amber"
      role="status"
    >
      The event is fired. Decisions are frozen with the result.
    </p>

    <template v-if="data">
      <div class="flex flex-wrap items-center gap-3 font-mono text-[0.72rem] text-muted">
        <span>
          Registry modules:
          <template v-if="data.registry.running">searching, about two minutes...</template>
          <template v-else-if="data.registry.updatedAt">
            {{ data.registry.repos }} repositories searched {{ day(data.registry.updatedAt) }} UTC,
            again every hour while the event runs.
          </template>
          <template v-else>not searched yet (starts with the event, if in scope).</template>
          <span v-if="!data.registry.running && data.registry.pausedReason" class="text-amber">
            Paused: {{ data.registry.pausedReason }}. It resumes on its own.
          </span>
          <span v-else-if="!data.registry.running && data.registry.lastError" class="text-red-400">
            Last attempt {{ day(data.registry.lastAttemptAt) }} UTC failed:
            {{ data.registry.lastError }}. Retried automatically after an hour.
          </span>
        </span>
        <button
          class="btn"
          :disabled="scanning || data.registry.running || data.frozen"
          @click="scanNow"
        >
          <span
            :class="scanning ? 'i-ph-spinner animate-spin' : 'i-ph-arrows-clockwise'"
            aria-hidden="true"
          />
          Search now
        </button>
      </div>

      <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
        Submitted ({{ data.items.length }}): {{ count("open") }} open, {{ count("merged") }} merged,
        {{ count("closed") }} closed<template v-if="data.updatedAt">
          , as of {{ day(data.updatedAt) }} UTC</template
        >
      </span>
      <p
        v-if="!data.items.length"
        class="panel px-6 py-10 text-center font-mono text-sm text-muted"
      >
        Nothing submitted{{ data.updatedAt ? "" : " yet: the list fills once the event is live" }}.
      </p>
      <template v-else>
        <select v-model="repoFilter" class="input self-start" aria-label="filter by repository">
          <option value="">all repositories ({{ data.items.length }})</option>
          <option v-for="[r, n] in repoCounts" :key="r" :value="r">{{ r }} ({{ n }})</option>
        </select>
        <div class="panel divide-y divide-line/60">
          <div
            v-for="item in shown"
            :key="item.ref"
            class="flex flex-col gap-2 px-4 py-3 font-mono text-[0.72rem]"
            :class="{ 'opacity-50': item.state === 'closed' || item.path === 'ignored' }"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                class="rounded-sm border px-1.5 py-px text-[0.62rem] font-bold uppercase"
                :class="STATE_TONE[item.state]"
                >{{ item.state }}</span
              >
              <span class="text-muted">{{ repo(item.ref) }}</span>
              <a
                :href="issueRefUrl(item.ref)"
                target="_blank"
                rel="noopener noreferrer"
                class="min-w-0 flex-1 truncate text-fg hover:text-primary hover:underline"
                >#{{ number(item.ref) }} {{ item.title }}</a
              >
            </div>
            <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-muted">
              <span
                >by <span class="text-fg">@{{ item.author }}</span></span
              >
              <span>{{ item.reason }}</span>
              <span v-if="item.maintainers.length" class="text-amber">
                maintainer {{ handles(item.maintainers) }}
              </span>
              <span v-if="item.registry">registry module</span>
              <span>opened {{ day(item.createdAt) }}</span>
              <span v-if="item.mergedAt">merged {{ day(item.mergedAt) }}</span>
            </div>

            <div
              v-if="data.decisions[item.ref]"
              class="flex flex-wrap items-baseline gap-x-4 gap-y-1"
            >
              <span
                v-if="data.decisions[item.ref]!.status === 'confirmed'"
                class="font-bold text-primary"
              >
                +{{ data.decisions[item.ref]!.points }} to
                {{ handles(data.decisions[item.ref]!.people) }}
                <span v-if="item.state === 'merged'" class="font-normal text-muted">
                  (merged since, scores on its own now)
                </span>
              </span>
              <span v-else class="font-bold text-faint">not counted</span>
              <button
                v-if="!data.frozen"
                class="text-muted hover:text-primary hover:underline"
                :disabled="busy === item.ref"
                @click="decide(item.ref, 'open')"
              >
                undo
              </button>
            </div>
            <div v-else-if="item.state === 'open'" class="flex flex-wrap items-center gap-2">
              <input
                v-model.number="points[item.ref]"
                type="number"
                step="0.5"
                min="0.5"
                class="input w-20"
                :aria-label="`points for ${item.ref}`"
                :disabled="data.frozen || busy === item.ref"
              />
              <button
                class="btn"
                :disabled="data.frozen || busy === item.ref"
                @click="decide(item.ref, 'confirmed')"
              >
                <span class="i-ph-check" aria-hidden="true" />
                Give points to @{{ item.author }}
              </button>
            </div>
            <div v-else-if="item.path === 'auto'" class="flex flex-wrap items-center gap-3">
              <span class="text-muted">scores for {{ handles(item.people) }}</span>
              <button
                class="btn"
                :disabled="data.frozen || busy === item.ref"
                @click="decide(item.ref, 'rejected')"
              >
                <span class="i-ph-x" aria-hidden="true" />
                Don't count
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-if="orphans.length">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-fg">
          Decided, no longer listed ({{ orphans.length }})
        </span>
        <div class="panel divide-y divide-line/60">
          <div
            v-for="d in orphans"
            :key="d.ref"
            class="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2 font-mono text-[0.72rem]"
          >
            <span class="w-24 font-bold uppercase tracking-wider text-faint">
              {{ d.status === "confirmed" ? `+${d.points}` : "not counted" }}
            </span>
            <a
              :href="issueRefUrl(d.ref)"
              target="_blank"
              rel="noopener noreferrer"
              class="min-w-0 flex-1 truncate text-fg hover:text-primary hover:underline"
              >{{ repo(d.ref) }}#{{ number(d.ref) }} {{ d.title }}</a
            >
            <button
              v-if="!data.frozen"
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
