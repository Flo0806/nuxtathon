<script setup lang="ts">
import { marked } from "marked";

const store = useEventStore();
await store.load();

const showLeaderboard = computed(() => store.phase === "live" || store.phase === "results");
if (showLeaderboard.value) {
  await store.loadLeaderboard();
}

const winner = computed(() => (store.phase === "results" ? (store.leaderboard[0] ?? null) : null));

// Config-driven qualification rules (inline Markdown). Empty array hides them.
const rules = computed(() => (store.config?.rules ?? []).map((r) => marked.parseInline(r)));

const updatedAt = computed(() => {
  if (!store.fetchedAt || !store.config) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: store.config.displayTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(store.fetchedAt));
});

// GitHub is pulled at most every 5 min (server cache); this poll only re-reads
// so open pages pick up a refresh and the board reshuffles.
const POLL_MS = 2 * 60 * 1000;
let poll: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (store.phase === "live") {
    poll = setInterval(() => store.loadLeaderboard(true), POLL_MS);
  }
});

onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});

// Config description is trusted, committed Markdown, so inline rendering is safe.
const description = computed(() =>
  store.config ? marked.parseInline(store.config.description) : "",
);

// Render the window in the event's own display timezone, not the visitor's.
const dateRange = computed(() => {
  if (!store.config) return "";
  const { startsAt, endsAt, displayTimeZone } = store.config;
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: displayTimeZone, ...opts }).format(new Date(iso));
  const start = fmt(startsAt, { month: "short", day: "numeric" });
  const end = fmt(endsAt, { day: "numeric", year: "numeric" });
  return `${start} - ${end} · ${displayTimeZone}`;
});
</script>

<template>
  <main class="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-12 text-center">
    <NuxtMark
      class="relative z-10 w-16 h-auto animate-logo-in motion-reduce:animate-none [filter:drop-shadow(0_0_10px_rgba(0,220,130,0.35))]"
    />

    <template v-if="store.config && store.phase">
      <IntroReveal :eyebrow="store.config.eyebrow" :title="store.config.title" />
      <p
        class="max-w-[38rem] text-fg leading-[1.6] text-[clamp(1rem,2.5vw,1.2rem)] animate-fade-up motion-reduce:animate-none [&_strong]:(text-mint font-bold) [&_code]:(font-mono text-[0.85em] text-primary bg-surface border border-line rounded px-[0.35em] py-[0.05em])"
        v-html="description"
      />
      <ul
        v-if="rules.length"
        class="flex max-w-[38rem] flex-col gap-2 text-left animate-fade-up motion-reduce:animate-none"
      >
        <li
          v-for="(r, i) in rules"
          :key="i"
          class="flex gap-2 font-mono text-[0.8rem] leading-relaxed text-muted [&_strong]:text-mint [&_code]:(text-primary bg-surface border border-line rounded px-[0.3em] py-[0.02em])"
        >
          <span class="text-primary" aria-hidden="true">&rsaquo;</span>
          <span v-html="r" />
        </li>
      </ul>
      <EventCountdown
        v-if="store.phase !== 'results'"
        :phase="store.phase"
        :starts-at="store.config.startsAt"
        :ends-at="store.config.endsAt"
      />
      <WinnerReveal v-else-if="winner" :entry="winner" />
      <p class="font-mono text-[0.72rem] tracking-[0.2em] uppercase text-muted">{{ dateRange }}</p>
      <a
        href="https://github.com/nuxt/nuxt/issues?q=sort%3Aupdated-desc%20is%3Aissue%20state%3Aopen%20created%3A%3C2026-07-13"
        target="_blank"
        rel="noopener noreferrer"
        class="btn animate-fade-up motion-reduce:animate-none"
      >
        <span class="i-simple-icons-github" aria-hidden="true" />
        Browse open issues
      </a>

      <section v-if="showLeaderboard" class="mx-auto flex w-full max-w-[42rem] flex-col gap-4">
        <LeaderboardStats :stats="store.stats" />
        <LeaderboardBoard v-if="store.leaderboard.length" :entries="store.leaderboard" />
        <p v-else class="panel px-6 py-10 text-center font-mono text-sm text-muted">
          No issues closed yet. The ranking fills as merged PRs land.
        </p>
        <p v-if="updatedAt" class="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
          Last updated {{ updatedAt }} {{ store.config?.displayTimeZone }}
        </p>
      </section>
    </template>
  </main>
</template>
