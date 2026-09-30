<script setup lang="ts">
import type { IssueRef } from "#shared/types/issue-ref";
import type { BoardIssue, IssueBoard } from "#shared/types/issues";

const { loggedIn } = useUserSession();
const route = useRoute();
const router = useRouter();

const board = ref<IssueBoard | null>(null);
// In the URL so a link to the list can point at a repo. Lowercase like the
// server's repo list, or the dropdown would not find "Nuxt/UI".
const repo = ref(
  typeof route.query.repo === "string" ? route.query.repo.toLowerCase() : "nuxt/nuxt",
);
const busy = ref(false);
const error = ref("");
// Bumped whenever the watch state is about to change. A poll that started before
// that must not apply its now stale `watching`/`seen` on top of the newer one.
const watchRevision = ref(0);
const query = ref("");
const sort = ref<"age" | "upvotes" | "updated">("age");
const hidePr = ref(false);

async function load() {
  const revision = watchRevision.value;
  const wanted = repo.value;
  const next = await $fetch<IssueBoard>("/api/issues", { query: { repo: wanted } });
  // A repo switch or a toggle in the meantime makes this answer stale.
  if (revision !== watchRevision.value || wanted !== repo.value) return;
  board.value = next;
  error.value = "";
}

const switching = ref(false);
async function switchRepo() {
  await router.replace({ query: { ...route.query, repo: repo.value } });
  switching.value = true;
  try {
    await load();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    switching.value = false;
  }
}

const watching = computed(() => new Set(board.value?.watching ?? []));
// Novelty only means something for issues you chose to follow, and it is
// measured from the moment you started following that one.
const isNew = (i: BoardIssue) => {
  const since = board.value?.seen[i.ref];
  return Boolean(since) && Date.parse(i.updatedAt) > Date.parse(since!);
};

const sorted = computed(() => {
  const all = board.value?.issues ?? [];
  const term = query.value.trim().toLowerCase().replace(/^#/, "");
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
  const byRef = new Map(
    [...(board.value?.issues ?? []), ...(board.value?.watchedExtra ?? [])].map((i) => [i.ref, i]),
  );
  const rows = (board.value?.watching ?? []).flatMap((r) => {
    const issue = byRef.get(r);
    return issue ? [issue] : [];
  });
  return [...rows].sort((a, b) => Number(b.closed ?? false) - Number(a.closed ?? false));
});
const freshCount = computed(() => watched.value.filter(isNew).length);

function errorText(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }; statusMessage?: string };
  return err?.data?.statusMessage || err?.statusMessage || "That did not work, try again.";
}

async function toggle(issue: BoardIssue) {
  if (!board.value || busy.value) return;
  busy.value = true;
  error.value = "";
  watchRevision.value++;
  const watch = !watching.value.has(issue.ref);
  try {
    const res = await $fetch<{ watching: IssueRef[]; seen: Record<IssueRef, string> }>(
      "/api/issues/watch",
      { method: "POST", body: { issue: issue.ref, watch } },
    );
    board.value.watching = res.watching;
    board.value.seen = res.seen;
  } catch (e) {
    // The list cap and a lost session both land here; silence would look like a
    // dead button.
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

async function markSeen() {
  if (!board.value) return;
  error.value = "";
  watchRevision.value++;
  try {
    const res = await $fetch<{ seen: Record<IssueRef, string> }>("/api/issues/seen", {
      method: "POST",
    });
    board.value.seen = res.seen;
  } catch (e) {
    error.value = errorText(e);
  }
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
  // The first load has no board to fall back on, so a failure has to say so;
  // otherwise the page just stays empty.
  load().catch((e) => {
    error.value = errorText(e);
  });
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
          Open issues that still qualify. Star the ones you care about; they stay on the right
          whichever repo you look at.
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

    <p
      v-if="loggedIn && !board && error"
      class="panel px-4 py-2 font-mono text-[0.72rem] text-red-400"
      role="alert"
    >
      Could not load the list: {{ error }}
    </p>

    <template v-else-if="board">
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-model="repo"
          class="input"
          aria-label="repository"
          :disabled="switching"
          @change="switchRepo"
        >
          <option v-for="r in board.repos" :key="r" :value="r">{{ r }}</option>
        </select>
        <input
          v-model="query"
          placeholder="filter by title or #number"
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

      <p v-if="error" class="panel px-4 py-2 font-mono text-[0.72rem] text-red-400" role="alert">
        {{ error }}
      </p>

      <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section class="flex min-w-0 flex-col gap-2">
          <h2 class="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-muted">
            {{ board.repo }} ({{ sorted.length }})
          </h2>
          <p class="font-mono text-[0.62rem] text-muted">
            Open issues created before {{ board.createdBefore }}.
          </p>
          <p v-if="!sorted.length" class="panel px-5 py-8 text-center font-mono text-xs text-muted">
            {{
              query || hidePr ? "Nothing matches the filter." : "No qualifying open issues here."
            }}
          </p>
          <div v-else class="panel max-h-[70vh] divide-y divide-line/60 overflow-y-auto">
            <IssueRow
              v-for="i in sorted"
              :key="i.ref"
              :issue="i"
              :watched="watching.has(i.ref)"
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
          <p class="font-mono text-[0.62rem] text-muted">All repos.</p>
          <p
            v-if="!watched.length"
            class="panel px-5 py-8 text-center font-mono text-xs text-muted"
          >
            Nothing yet. Use the star on the left.
          </p>
          <div v-else class="panel max-h-[70vh] divide-y divide-line/60 overflow-y-auto">
            <IssueRow
              v-for="i in watched"
              :key="i.ref"
              :issue="i"
              watched
              show-repo
              :fresh="isNew(i)"
              :age="age(i.createdAt)"
              :busy="busy"
              @toggle="toggle(i)"
            />
          </div>
        </section>
      </div>

      <p class="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
        <span v-if="board.stale" class="text-amber">GitHub is not answering right now.</span>
        Updated {{ new Date(board.fetchedAt).toISOString().slice(11, 16) }} UTC, and again every
        five minutes while this page is open. Watching is private and reserves nothing.
      </p>
    </template>
  </main>
</template>
