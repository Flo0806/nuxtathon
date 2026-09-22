<script setup lang="ts">
import { marked } from "marked";
import type { Award, EventConfig, FinalResult } from "#shared/types/event";

const route = useRoute();
const { data: event, error } = await useFetch<FinalResult & { config: EventConfig; slug: string }>(
  `/api/archive/${route.params.slug}`,
);
if (error.value || !event.value) {
  throw createError({ statusCode: 404, statusMessage: "No such event", fatal: true });
}

const config = computed(() => event.value!.config);
const winner = computed(() => event.value!.standings[0] ?? null);
// Archived config is admin-written Markdown, same trust as the live page.
const description = computed(() => marked.parseInline(config.value.description) as string);
const rules = computed(() => config.value.rules.map((r) => marked.parseInline(r) as string));
const awards = computed<Award[]>(() => event.value!.awards ?? []);
const standingFor = (login: string) =>
  event.value!.standings.find((e) => e.login.toLowerCase() === login.toLowerCase()) ?? null;
const certificateBase = computed(() => `/archive/${event.value!.slug}/certificate`);

const dateRange = computed(() =>
  formatDateRange(config.value.startsAt, config.value.endsAt, config.value.displayTimeZone),
);

useSeoMeta({
  title: () => `${config.value.title} - ${config.value.eyebrow} · Results`,
  ogTitle: () => `${config.value.title} - ${config.value.eyebrow} · Results`,
  description: () => config.value.description.replace(/[*_`]/g, ""),
});
</script>

<template>
  <main class="flex flex-1 flex-col items-center gap-8 px-5 py-12 text-center">
    <NuxtLink to="/archive" class="btn self-center">
      <span class="i-ph-arrow-left" aria-hidden="true" />
      All events
    </NuxtLink>

    <div class="flex flex-col items-center gap-2">
      <p class="font-mono text-[0.7rem] uppercase tracking-[0.35em] text-amber">
        {{ config.eyebrow }}
      </p>
      <h1
        class="font-display text-[clamp(2.4rem,9vw,4.5rem)] font-bold uppercase leading-none tracking-wider text-mint [text-shadow:0_0_24px_rgba(0,220,130,0.45)]"
      >
        {{ config.title }}
      </h1>
      <p class="font-mono text-[0.72rem] tracking-[0.2em] uppercase text-muted">{{ dateRange }}</p>
    </div>

    <p
      class="max-w-[38rem] text-fg leading-[1.6] text-[clamp(1rem,2.5vw,1.2rem)] [&_strong]:(text-mint font-bold) [&_code]:(font-mono text-[0.85em] text-primary bg-surface border border-line rounded px-[0.35em] py-[0.05em])"
      v-html="description"
    />
    <ul v-if="rules.length" class="flex max-w-[38rem] flex-col gap-2 text-left">
      <li
        v-for="(r, i) in rules"
        :key="i"
        class="flex gap-2 font-mono text-[0.8rem] leading-relaxed text-muted [&_strong]:text-mint [&_code]:(text-primary bg-surface border border-line rounded px-[0.3em] py-[0.02em])"
      >
        <span class="text-primary" aria-hidden="true">&rsaquo;</span>
        <span v-html="r" />
      </li>
    </ul>

    <WinnerReveal v-if="winner" :entry="winner" />

    <section v-if="awards.length" class="mx-auto flex w-full max-w-[42rem] flex-col gap-3">
      <h2 class="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-amber">Awards</h2>
      <div
        v-for="a in awards"
        :key="a.id"
        class="panel flex items-center gap-4 px-5 py-4 text-left"
      >
        <span
          :class="`i-ph-${a.icon}-fill`"
          class="shrink-0 text-2xl text-amber [filter:drop-shadow(0_0_10px_var(--amber))]"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="font-display text-base font-bold uppercase tracking-wide text-mint">
            {{ a.title }}
          </p>
          <p class="mt-0.5 flex items-center gap-2 font-mono text-[0.75rem] text-fg">
            <img
              v-if="standingFor(a.login)"
              :src="standingFor(a.login)!.avatarUrl"
              :alt="a.login"
              width="20"
              height="20"
              loading="lazy"
              class="h-5 w-5 rounded-full border border-line object-cover"
            />
            {{ standingFor(a.login)?.name || a.login }}
            <a
              :href="`https://github.com/${a.login}`"
              target="_blank"
              rel="noopener"
              class="text-primary hover:underline"
              >@{{ a.login }}</a
            >
          </p>
          <p v-if="a.text" class="mt-1 font-mono text-[0.72rem] leading-relaxed text-muted">
            {{ a.text }}
          </p>
        </div>
        <a
          :href="`/archive/${event!.slug}/award/${a.id}.pdf`"
          target="_blank"
          rel="noopener"
          class="btn shrink-0"
        >
          <span class="i-ph-certificate" aria-hidden="true" />
          Certificate
        </a>
      </div>
    </section>

    <section class="mx-auto flex w-full max-w-[42rem] flex-col gap-4">
      <LeaderboardStats :stats="event!.stats" />
      <LeaderboardList
        v-if="event!.standings.length"
        :entries="event!.standings"
        :contributions="event!.contributions"
        :certificate-base="certificateBase"
      />
      <p class="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
        Everyone with a score has a certificate. Use the icon in their row.
      </p>
      <p class="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
        Finalized {{ new Date(event!.finalizedAt).toISOString().slice(0, 10) }}
      </p>
    </section>
  </main>
</template>
