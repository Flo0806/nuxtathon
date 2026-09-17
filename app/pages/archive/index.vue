<script setup lang="ts">
interface Summary {
  slug: string;
  title: string;
  eyebrow: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string;
  winner: { login: string; name: string | null; avatarUrl: string } | null;
  stats: { submitted: number; merged: number; issuesClosed: number };
  contributors: number;
}

const { data: events } = await useFetch<Summary[]>("/api/archive");

useSeoMeta({ title: "Nuxtathon - Archive", ogTitle: "Nuxtathon - Archive" });
</script>

<template>
  <main class="mx-auto flex w-full max-w-[42rem] flex-1 flex-col gap-6 px-5 py-10">
    <NuxtLink to="/" class="btn self-start">
      <span class="i-ph-arrow-left" aria-hidden="true" />
      Back
    </NuxtLink>

    <h1 class="font-display text-2xl font-bold uppercase tracking-wider text-mint">Archive</h1>
    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      Every finished Nuxtathon, frozen as it ended.
    </p>

    <p v-if="!events?.length" class="panel px-6 py-10 text-center font-mono text-sm text-muted">
      No finished events yet.
    </p>

    <NuxtLink
      v-for="e in events"
      :key="e.slug"
      :to="`/archive/${e.slug}`"
      class="panel group flex items-center gap-4 px-5 py-4 transition-colors hover:border-primary"
    >
      <img
        v-if="e.winner"
        :src="e.winner.avatarUrl"
        :alt="e.winner.login"
        width="48"
        height="48"
        loading="lazy"
        class="h-12 w-12 shrink-0 rounded-full border border-primary object-cover"
      />
      <div class="min-w-0 flex-1">
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-amber">
          {{ e.eyebrow }}
        </p>
        <p
          class="font-display text-lg font-bold uppercase tracking-wide text-fg group-hover:text-primary"
        >
          {{ e.title }}
        </p>
        <p class="font-mono text-[0.72rem] text-muted">
          {{ formatDateRange(e.startsAt, e.endsAt) }}
        </p>
      </div>
      <div
        class="hidden shrink-0 flex-col items-end gap-1 font-mono text-[0.72rem] text-muted sm:flex"
      >
        <span v-if="e.winner">
          <span
            class="i-ph-crown-fill mr-1 inline-block align-[-2px] text-amber"
            aria-hidden="true"
          />
          <span class="text-fg">{{ e.winner.name || e.winner.login }}</span>
        </span>
        <span>{{ e.stats.issuesClosed }} issues · {{ e.contributors }} contributors</span>
      </div>
      <span
        class="i-ph-caret-right shrink-0 text-muted group-hover:text-primary"
        aria-hidden="true"
      />
    </NuxtLink>
  </main>
</template>
