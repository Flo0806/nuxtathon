<script setup lang="ts">
import type { FinalResult, LeaderboardEntry, ManualCredit } from "#shared/types/event";

interface Overview {
  phase: string;
  prizesReleased: boolean;
  credits: ManualCredit[];
  finalized: boolean;
  finalizedAt: string | null;
  archiveCount: number;
}
interface Board {
  entries: LeaderboardEntry[];
  coreTeam: LeaderboardEntry[];
}

const toast = useToast();
const auth = useAdminAuth();
const { confirm } = useConfirm();

const overview = ref<Overview | null>(null);
const board = ref<Board | null>(null);
const archive = ref<FinalResult[]>([]);
const credits = ref<ManualCredit[]>([]);
// Issue numbers the last save rejected, so their row inputs can be flagged.
const invalidIssues = ref(new Set<number>());
const busy = ref(false);
const loading = ref(false);

const showLogin = ref(false);
const loginUser = ref("");
const loginPass = ref("");

function errMsg(e: unknown): string {
  const err = e as { data?: { statusMessage?: string; message?: string }; message?: string };
  return err?.data?.statusMessage || err?.data?.message || err?.message || "Request failed";
}
function is401(e: unknown): boolean {
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } };
  return err?.statusCode === 401 || err?.status === 401 || err?.response?.status === 401;
}
function requireAuth(e: unknown): boolean {
  if (!is401(e)) return false;
  auth.clear();
  showLogin.value = true;
  toast.error("Please log in again");
  return true;
}

async function loadOverview() {
  const o = await $fetch<Overview>("/api/admin/overview", { headers: auth.authHeaders() });
  overview.value = o;
  credits.value = o.credits.map((c) => ({ ...c }));
}
async function loadBoard() {
  // Bust the browser cache; server keys on config, no extra GitHub hit.
  board.value = await $fetch<Board>("/api/leaderboard", { query: { t: Date.now() } });
}
async function loadArchive() {
  archive.value = await $fetch<FinalResult[]>("/api/admin/archive", {
    headers: auth.authHeaders(),
  });
}
async function loadAll() {
  loading.value = true;
  try {
    await Promise.all([loadOverview(), loadBoard(), loadArchive()]);
  } finally {
    loading.value = false;
  }
}

async function submitLogin() {
  loading.value = true;
  try {
    const token = btoa(`${loginUser.value}:${loginPass.value}`);
    const o = await $fetch<Overview>("/api/admin/overview", {
      headers: { authorization: `Basic ${token}` },
    });
    auth.set(loginUser.value, loginPass.value);
    overview.value = o;
    credits.value = o.credits.map((c) => ({ ...c }));
    loginPass.value = "";
    showLogin.value = false;
    await Promise.all([loadBoard(), loadArchive()]);
  } catch (e) {
    toast.error(is401(e) ? "Wrong username or password" : errMsg(e));
  } finally {
    loading.value = false;
  }
}

async function act(path: string, successMsg: string) {
  busy.value = true;
  try {
    await $fetch(path, { method: "POST", headers: auth.authHeaders() });
    toast.success(successMsg);
    await loadAll();
  } catch (e) {
    if (!requireAuth(e)) toast.error(errMsg(e));
  } finally {
    busy.value = false;
  }
}

async function saveCredits() {
  busy.value = true;
  invalidIssues.value = new Set();
  try {
    await $fetch("/api/admin/credits", {
      method: "POST",
      headers: auth.authHeaders(),
      body: { credits: credits.value },
    });
    toast.success("Credits saved");
    await Promise.all([loadOverview(), loadBoard()]);
  } catch (e) {
    // The 422 carries the offending issue numbers so we can point at the rows.
    const bad = (e as { data?: { data?: { invalid?: number[] } } })?.data?.data?.invalid;
    if (Array.isArray(bad)) invalidIssues.value = new Set(bad);
    if (!requireAuth(e)) toast.error(errMsg(e));
  } finally {
    busy.value = false;
  }
}

// Standings show the last saved state (the server applies credits when the board
// is fetched). Editing the list below does not move them until Save, so a GitHub
// avatar request is not fired for every keystroke in a login field.
const preview = computed(() => (board.value?.entries ?? []).filter((e) => e.score > 0));

const addCredit = () => credits.value.push({ login: "", amount: 1, note: "", issueNumber: undefined });
const removeCredit = (i: number) => credits.value.splice(i, 1);

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const downloadEntry = (entry: FinalResult) =>
  downloadJson(`nuxtathon-${slug(entry.title)}-${entry.finalizedAt.slice(0, 10)}.json`, entry);

async function fire() {
  const ok = await confirm({
    title: "Fire",
    message: "Freeze the ranking, release prizes, and show the winner? The count stops here.",
    confirmLabel: "Fire",
  });
  if (ok) act("/api/admin/fire", "Fired - winner is live");
}
async function reset() {
  const ok = await confirm({
    title: "Reset event",
    message:
      "Clear the live event to start a new Nuxtathon? The finalized result stays in the archive.",
    confirmLabel: "Reset",
  });
  if (ok) act("/api/admin/reset", "Reset - ready for a new event");
}

onMounted(async () => {
  if (!auth.isAuthed.value) {
    showLogin.value = true;
    return;
  }
  try {
    await loadAll();
  } catch (e) {
    if (is401(e)) {
      auth.clear();
      showLogin.value = true;
    } else {
      toast.error(errMsg(e));
    }
  }
});
</script>

<template>
  <main class="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-6 px-5 py-10">
    <NuxtLink to="/" class="btn self-start">
      <span class="i-ph-arrow-left" aria-hidden="true" />
      Back
    </NuxtLink>

    <h1
      class="flex items-center gap-3 font-display text-2xl font-bold uppercase tracking-wider text-mint"
    >
      Admin
      <span v-if="loading || busy" class="i-ph-spinner animate-spin text-base text-primary" />
    </h1>

    <template v-if="overview">
      <div class="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span class="font-mono text-xs uppercase tracking-wider text-muted">
          phase <span class="text-primary">{{ overview.phase }}</span>
        </span>
        <span class="font-mono text-xs uppercase tracking-wider text-muted">
          state
          <span :class="overview.finalized ? 'text-amber' : 'text-primary'">
            {{ overview.finalized ? "frozen" : "live" }}
          </span>
        </span>
        <span v-if="overview.finalizedAt" class="font-mono text-xs text-muted">
          fired {{ overview.finalizedAt }}
        </span>
      </div>

      <div class="flex flex-wrap gap-3">
        <button v-if="!overview.finalized" class="btn" :disabled="busy" @click="fire">
          <span class="i-ph-lightning" aria-hidden="true" />
          Fire (freeze + release)
        </button>
        <button
          v-else
          class="btn"
          :disabled="busy"
          @click="act('/api/admin/unfreeze', 'Unfrozen - back to live')"
        >
          <span class="i-ph-lock-open" aria-hidden="true" />
          Unfreeze
        </button>
        <button
          class="btn"
          :disabled="busy"
          @click="act('/api/admin/refresh', 'Recomputed from GitHub')"
        >
          <span class="i-ph-arrows-clockwise" aria-hidden="true" />
          Refresh
        </button>
        <button
          v-if="overview.finalized"
          class="btn text-amber hover:border-amber"
          :disabled="busy"
          @click="reset"
        >
          <span class="i-ph-trash" aria-hidden="true" />
          Reset
        </button>
      </div>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="font-mono text-sm uppercase tracking-wider text-fg">Manual credits</h2>
          <button class="btn" :disabled="busy" @click="addCredit">
            <span class="i-ph-plus" aria-hidden="true" />
            Add
          </button>
        </div>
        <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
          For issues closed without a PR (e.g. a non-reproducible issue you close and credit the
          reporter). Each point counts as one closed issue in that person's score. The standings
          below update live as you edit; hit Save to keep it.
        </p>
        <div v-for="(c, i) in credits" :key="i" class="flex flex-wrap items-center gap-2">
          <input v-model="c.login" placeholder="github login" class="input w-40" />
          <input v-model.number="c.amount" type="number" aria-label="points" class="input w-20" />
          <input
            v-model.number="c.issueNumber"
            type="number"
            placeholder="issue #"
            aria-label="issue number (optional)"
            class="input w-28"
            :class="{ '!border-red-500 text-red-400': c.issueNumber && invalidIssues.has(c.issueNumber) }"
            @input="invalidIssues.clear()"
          />
          <input
            v-model="c.note"
            :title="c.note || undefined"
            placeholder="note (optional)"
            class="input min-w-40 flex-1 truncate"
          />
          <button class="btn" :disabled="busy" @click="removeCredit(i)">
            <span class="i-ph-x" aria-hidden="true" />
          </button>
        </div>
        <button class="btn self-start" :disabled="busy" @click="saveCredits">Save credits</button>
      </section>

      <section v-if="preview.length" class="flex flex-col gap-3">
        <h2 class="font-mono text-sm uppercase tracking-wider text-fg">
          Standings <span class="text-muted">(saved)</span>
        </h2>
        <LeaderboardBoard :entries="preview" />
      </section>

      <section v-if="board?.coreTeam?.length" class="flex flex-col gap-3">
        <h2 class="font-mono text-sm uppercase tracking-wider text-fg">
          Core team <span class="text-muted">(excluded from ranking)</span>
        </h2>
        <div class="panel flex flex-col divide-y divide-line/60">
          <div v-for="c in board.coreTeam" :key="c.login" class="flex items-center gap-3 px-4 py-2">
            <img
              :src="c.avatarUrl"
              :alt="c.login"
              width="28"
              height="28"
              loading="lazy"
              class="h-7 w-7 rounded-full border border-line object-cover"
            />
            <span class="font-mono text-sm text-fg">{{ c.name || c.login }}</span>
            <span class="ml-auto font-mono text-xs text-muted">
              {{ c.closedIssues }} issues / {{ c.mergedPRs }} PRs
            </span>
          </div>
        </div>
      </section>

      <section v-if="archive.length" class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="font-mono text-sm uppercase tracking-wider text-fg">Archive</h2>
          <button class="btn" @click="downloadJson('nuxtathon-archive.json', archive)">
            <span class="i-ph-download-simple" aria-hidden="true" />
            Download all
          </button>
        </div>
        <div
          v-for="a in archive"
          :key="a.finalizedAt"
          class="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 font-mono text-xs text-muted"
        >
          <span class="text-fg">{{ a.title }}</span>
          <span
            >winner <span class="text-primary">{{ a.standings[0]?.login ?? "-" }}</span></span
          >
          <span>{{ a.standings.length }} contributors</span>
          <span>{{ a.finalizedAt }}</span>
          <button class="btn ml-auto" @click="downloadEntry(a)">
            <span class="i-ph-download-simple" aria-hidden="true" />
            JSON
          </button>
        </div>
      </section>
    </template>

    <AppDialog v-model="showLogin" title="Admin login" persistent>
      <form class="flex flex-col gap-3" @submit.prevent="submitLogin">
        <input v-model="loginUser" placeholder="username" autocomplete="username" class="input" />
        <input
          v-model="loginPass"
          type="password"
          placeholder="password"
          autocomplete="current-password"
          class="input"
        />
        <button class="btn mt-1 self-end" type="submit" :disabled="loading">
          <span v-if="loading" class="i-ph-spinner animate-spin" aria-hidden="true" />
          Log in
        </button>
      </form>
    </AppDialog>
  </main>
</template>
