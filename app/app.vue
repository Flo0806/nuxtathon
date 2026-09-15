<script setup lang="ts">
// Site-wide SEO and social tags from the resolved event config (a fired event
// keeps its archived texts). `siteUrl` makes the OG/canonical URLs absolute
// once NUXT_PUBLIC_SITE_URL is set; without it the image falls back to a path.
const site = useRuntimeConfig().public.siteUrl || "";
const store = useEventStore();
await store.load();

const plain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

const title = computed(() =>
  store.config ? `${store.config.title} - ${store.config.eyebrow}` : "Nuxtathon",
);
const description = computed(() => (store.config ? plain(store.config.description) : ""));
const ogImage = computed(() => `${site}/og.png?v=${store.ogVersion}`);

useHead({
  htmlAttrs: { lang: "en" },
  link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
});

useSeoMeta({
  title,
  description,
  ogSiteName: "Nuxtathon",
  ogType: "website",
  ogTitle: title,
  ogDescription: description,
  ogImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: title,
  twitterCard: "summary_large_image",
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: ogImage,
});
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLoadingIndicator color="#00DC82" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
