<script setup lang="ts">
// The shared GitHub token's budget, from the headers of the site's own GitHub
// calls. Admin: behind the admin login. Session: the developer's GitHub login.
type Resource = "graphql" | "search" | "core";
interface Reading {
  remaining: number;
  limit: number;
  used: number;
  resetAt: string;
  seenAt: string;
}
interface Call {
  at: string;
  resource: Resource;
  label: string;
  raw: string;
  cost: number | null;
  remaining: number;
  limited: boolean;
}
interface Budget {
  readings: Partial<Record<Resource, Reading>>;
  calls: Call[];
}

const { source } = defineProps<{ source: "admin" | "session" }>();
const auth = useAdminAuth();

const budget = ref<Budget | null>(null);
const open = ref(false);

async function load(probe = false) {
  const url = source === "admin" ? "/api/admin/github-budget" : "/api/github-budget";
  try {
    budget.value = await $fetch<Budget>(url, {
      query: probe ? { probe: 1 } : undefined,
      headers: source === "admin" ? auth.authHeaders() : undefined,
    });
  } catch {
    // A counter must never break the page it sits on.
  }
}

// Numbers only change when the site talks to GitHub, which is at most every few
// minutes; half a minute keeps the counter honest without chattiness.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  await load();
  if (!budget.value?.readings.graphql) await load(true);
  timer = setInterval(() => void load(), 30_000);
});
onBeforeUnmount(() => clearInterval(timer));

const LABELS: Record<Resource, string> = { graphql: "GraphQL", search: "search", core: "REST" };
const time = (iso: string) => new Date(iso).toISOString().slice(11, 16);
// Share left decides the colour; a refusal in the recent calls always shows red.
const tone = (r: Reading) => {
  const share = r.remaining / r.limit;
  return share < 0.2 ? "text-red-400" : share < 0.5 ? "text-amber" : "text-primary";
};
const limitedRecently = computed(() =>
  (budget.value?.calls ?? []).some((c) => c.limited && Date.now() - Date.parse(c.at) < 15 * 60_000),
);
const entries = computed(
  () =>
    (["graphql", "search", "core"] as const)
      .map((k) => [k, budget.value?.readings[k]] as const)
      .filter(([, r]) => r) as [Resource, Reading][],
);
</script>

<template>
  <div
    v-if="budget"
    class="panel max-w-[calc(100vw-1.5rem)] px-3 py-2 font-mono text-[0.68rem] text-muted"
  >
    <button
      class="flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="i-simple-icons-github" aria-hidden="true" />
      <span v-if="limitedRecently" class="font-bold text-red-400">rate limited</span>
      <span v-for="[k, r] in entries" :key="k">
        {{ LABELS[k] }}
        <span :class="tone(r)">{{ r.remaining }}</span
        >/{{ r.limit }}
        <span class="text-faint">until {{ time(r.resetAt) }}</span>
      </span>
      <span v-if="!entries.length">no GitHub call yet</span>
      <span
        class="i-ph-caret-down transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="open"
      class="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto border-t border-line/40 pt-2"
    >
      <p class="text-faint">
        What the site asked GitHub for, newest first (UTC). Cost is points for GraphQL, requests for
        search and REST; "?" when there is no earlier reading to compare. Left is what remained
        after the call. Hover a row for the exact query.
      </p>
      <p class="flex gap-2 uppercase tracking-wider text-faint">
        <span class="w-10 shrink-0">time</span>
        <span class="w-14 shrink-0">budget</span>
        <span class="w-12 shrink-0 text-right">cost</span>
        <span class="w-12 shrink-0 text-right">left</span>
        <span>for</span>
      </p>
      <p v-for="c in budget.calls" :key="c.at + c.raw" class="flex gap-2" :title="c.raw">
        <span class="w-10 shrink-0">{{ time(c.at) }}</span>
        <span class="w-14 shrink-0">{{ LABELS[c.resource] }}</span>
        <span class="w-12 shrink-0 text-right" :class="c.limited ? 'text-red-400' : 'text-fg'">
          {{ c.limited ? "refused" : (c.cost ?? "?") }}
        </span>
        <span class="w-12 shrink-0 text-right">{{ c.remaining }}</span>
        <span class="truncate">{{ c.label }}</span>
      </p>
    </div>
  </div>
</template>
