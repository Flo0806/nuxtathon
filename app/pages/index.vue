<script setup lang="ts">
import { marked } from "marked";

const store = useEventStore();
await store.load();

const route = useRoute();
// from/to query overrides the config window to preview a past, verifiable range.
const previewWindow = route.query.from
  ? { from: String(route.query.from), to: route.query.to ? String(route.query.to) : undefined }
  : undefined;

const showLeaderboard = computed(
  () => store.phase === "live" || store.phase === "results" || Boolean(previewWindow),
);

if (showLeaderboard.value) {
  await store.loadLeaderboard(previewWindow);
}

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
  <main
    class="flex flex-col items-center justify-center gap-8 min-h-[100dvh] px-5 py-12 text-center"
  >
    <NuxtMark
      class="relative z-10 w-16 h-auto animate-logo-in motion-reduce:animate-none [filter:drop-shadow(0_0_10px_rgba(0,220,130,0.35))]"
    />

    <template v-if="store.config && store.phase">
      <IntroReveal :eyebrow="store.config.eyebrow" :title="store.config.title" />
      <p
        class="max-w-[38rem] text-fg leading-[1.6] text-[clamp(1rem,2.5vw,1.2rem)] animate-fade-up motion-reduce:animate-none [&_strong]:(text-mint font-bold) [&_code]:(font-mono text-[0.85em] text-primary bg-surface border border-line rounded px-[0.35em] py-[0.05em])"
        v-html="description"
      />
      <EventCountdown
        :phase="store.phase"
        :starts-at="store.config.startsAt"
        :ends-at="store.config.endsAt"
      />
      <p class="font-mono text-[0.72rem] tracking-[0.2em] uppercase text-muted">{{ dateRange }}</p>
      <a
        href="https://github.com/nuxt/nuxt/issues"
        target="_blank"
        rel="noopener noreferrer"
        class="btn animate-fade-up motion-reduce:animate-none"
      >
        <span class="i-simple-icons-github" aria-hidden="true" />
        Browse open issues
      </a>

      <section v-if="showLeaderboard" class="flex w-full flex-col gap-4">
        <LeaderboardStats :stats="store.stats" />
        <LeaderboardBoard v-if="store.leaderboard.length" :entries="store.leaderboard" />
        <p
          v-else
          class="panel mx-auto max-w-[42rem] px-6 py-10 text-center font-mono text-sm text-muted"
        >
          No issues closed yet. The ranking fills as merged PRs land.
        </p>
      </section>
    </template>
  </main>
</template>
