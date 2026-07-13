<script setup lang="ts">
import { marked } from "marked";

const { data } = await useFetch("/api/state");

// Config description is trusted, committed Markdown, so inline rendering is safe.
const description = computed(() =>
  data.value ? marked.parseInline(data.value.config.description) : "",
);

// Render the window in the event's own display timezone, not the visitor's.
const dateRange = computed(() => {
  if (!data.value) return "";
  const { startsAt, endsAt, displayTimeZone } = data.value.config;
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

    <template v-if="data">
      <IntroReveal :eyebrow="data.config.eyebrow" :title="data.config.title" />
      <p
        class="max-w-[38rem] text-fg leading-[1.6] text-[clamp(1rem,2.5vw,1.2rem)] animate-fade-up motion-reduce:animate-none [&_strong]:(text-mint font-bold) [&_code]:(font-mono text-[0.85em] text-primary bg-surface border border-line rounded px-[0.35em] py-[0.05em])"
        v-html="description"
      />
      <EventCountdown
        :phase="data.phase"
        :starts-at="data.config.startsAt"
        :ends-at="data.config.endsAt"
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
    </template>
  </main>
</template>
