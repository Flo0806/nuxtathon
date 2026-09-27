<script setup lang="ts">
import type { BoardIssue, IssueBoard } from "#shared/types/issues";

const { loggedIn } = useUserSession();

const board = ref<IssueBoard | null>(null);
const busy = ref(false);
const query = ref("");
const sort = ref<"age" | "upvotes" | "updated">("age");
const hidePr = ref(false);

async function load() {
  board.value = await $fetch<IssueBoard>("/api/issues");
}

const watching = computed(() => new Set(board.value?.watching ?? []));
// Novelty only means something for issues you chose to follow, and it is
// measured from the moment you started following that one.
const isNew = (i: BoardIssue) => {
  const since = board.value?.seen[String(i.number)];
  return Boolean(since) && Date.parse(i.updatedAt) > Date.parse(since!);
};

const sorted = computed(() => {
  // Closed entries ride along only for the watch column.
  const all = (board.value?.issues ?? []).filter((i) => !i.closed);
  const term = query.value.trim().toLowerCase();
  const filtered = all.filter((i) => {
    if (hidePr.value && i.hasPr) return false;
    if (!term) return true;
    return i.title.toLowerCase().includes(term) || String(i.number).includes(term);
  });
  const by = {
    age: (a: BoardIssue, b: BoardIssue) => a.createdAt.localeCompare(b.createdAt),
    upvotes: (a: BoardIssue, b: BoardIssue) => b.upvotes - a.upvotes,
    updated: (a: BoardIssue, b: BoardIssue) => b.updatedAt.localeCompare(a.updatedAt),
  }[sort.value];
  return [...filtered].sort(by);
});

// Watch order is kept by the server (newest first), so the column mirrors it,
// except that anything closed floats to the top: it is the outcome you waited
// for, and the row is only there so you can see it and clear it.
const watched = computed(() => {
  const byNumber = new Map((board.value?.issues ?? []).map((i) => [i.number, i]));
  const rows = (board.value?.watching ?? []).flatMap((n) => {
    const issue = byNumber.get(n);
    return issue ? [issue] : [];
  });
  return [...rows].sort((a, b) => Number(b.closed ?? false) - Number(a.closed ?? false));
});
const freshCount = computed(() => watched.value.filter(isNew).length);

async function toggle(issue: BoardIssue) {
  if (!board.value || busy.value) return;
  busy.value = true;
  const watch = !watching.value.has(issue.number);
  try {
    const res = await $fetch<{ watching: number[]; seen: Record<string, string> }>(
      "/api/issues/watch",
      { method: "POST", body: { number: issue.number, watch } },
    );
    board.value.watching = res.watching;
    board.value.seen = res.seen;
  } finally {
    busy.value = false;
  }
}

async function markSeen() {
  if (!board.value) return;
  const res = await $fetch<{ seen: Record<string, string> }>("/api/issues/seen", {
    method: "POST",
  });
  board.value.seen = res.seen;
}

const age = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 31) return `${days}d`;
  const months = Math.floor(days / 30);
  return months < 24 ? `${months}mo` : `${Math.floor(days / 365)}y`;
};

// The server recomputes at most every five minutes, so polling faster would
// only hand back the same cached list. A hidden tab is skipped and refreshed the
// moment it comes back, otherwise a laptop that woke up shows a stale board for
// minutes.
const POLL_MS = 5 * 60 * 1000;
let poll: ReturnType<typeof setInterval> | undefined;

async function refresh() {
  // A toggle owns the watch state while it is in flight; let it finish.
  if (busy.value || document.visibilityState !== "visible") return;
  try {
    await load();
  } catch {
    // Keep showing the board we have rather than emptying the page.
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") void refresh();
}

onMounted(() => {
  if (!loggedIn.value) return;
  load();
  poll = setInterval(() => void refresh(), POLL_MS);
  document.addEventListener("visibilitychange", onVisibility);
});

onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  document.removeEventListener("visibilitychange", onVisibility);
});

useSeoMeta({ title: "Nuxtathon - Issue list", robots: "noindex" });
</script>

<template>
  <main class="mx-auto flex w-full max-w-[72rem] flex-1 flex-col gap-6 px-5 py-10">
    <div class="flex flex-wrap items-center gap-4">
      <FloSplash />
      <div>
        <h1 class="font-display text-2xl font-bold uppercase tracking-wider text-mint">
          Flo's list
        </h1>
        <p class="font-mono text-[0.72rem] text-muted">
          Open issues that still qualify. Keep the ones you care about on the right.
        </p>
      </div>
      <NuxtLink to="/" class="btn ml-auto">
        <span class="i-ph-arrow-left" aria-hidden="true" />
        Back
      </NuxtLink>
    </div>

    <div v-if="!loggedIn" class="panel flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p class="font-mono text-sm text-muted">The list is for contributors, so it needs a login.</p>
      <a href="/auth/github" class="btn">
        <span class="i-simple-icons-github" aria-hidden="true" />
        Sign in with GitHub
      </a>
    </div>

    <template v-else-if="board">
      <div class="flex flex-wrap items-center gap-3">
        <input
          v-model="query"
          placeholder="filter by title or number"
          class="input min-w-56 flex-1"
        />
        <select v-model="sort" class="input" aria-label="sort">
          <option value="age">oldest first</option>
          <option value="upvotes">most upvotes</option>
          <option value="updated">recently updated</option>
        </select>
        <label class="inline-flex items-center gap-2 font-mono text-[0.72rem] text-muted">
          <input v-model="hidePr" type="checkbox" class="check" />
          hide issues with a PR
        </label>
        <button v-if="freshCount" class="btn" @click="markSeen">
          <span class="i-ph-check" aria-hidden="true" />
          Mark {{ freshCount }} as seen
        </button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section class="flex min-w-0 flex-col gap-2">
          <h2 class="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-muted">
            All issues ({{ sorted.length }})
          </h2>
          <div class="panel max-h-[70vh] divide-y divide-line/60 overflow-y-auto">
            <IssueRow
              v-for="i in sorted"
              :key="i.number"
              :issue="i"
              :watched="watching.has(i.number)"
              :fresh="false"
              :age="age(i.createdAt)"
              :busy="busy"
              @toggle="toggle(i)"
            />
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-2">
          <h2 class="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-amber">
            Watching ({{ watched.length }})
          </h2>
          <p
            v-if="!watched.length"
            class="panel px-5 py-8 text-center font-mono text-xs text-muted"
          >
            Nothing yet. Use the star on the left.
          </p>
          <div v-else class="panel max-h-[70vh] divide-y divide-line/60 overflow-y-auto">
            <IssueRow
              v-for="i in watched"
              :key="i.number"
              :issue="i"
              watched
              :fresh="isNew(i)"
              :age="age(i.createdAt)"
              :busy="busy"
              @toggle="toggle(i)"
            />
          </div>
        </section>
      </div>

      <p class="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
        Updated {{ new Date(board.fetchedAt).toISOString().slice(11, 16) }} UTC, and again every
        five minutes while this page is open. Watching is private and reserves nothing.
      </p>
    </template>
  </main>
</template>
