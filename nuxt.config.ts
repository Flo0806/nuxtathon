// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@unocss/nuxt", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    // Server-only secrets, populated from NUXT_* env vars at runtime.
    githubToken: "",
    adminUser: "",
    adminPassword: "",
  },
  nitro: {
    storage: {
      // Production: hosted KV. Credentials are read from env at runtime
      // (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
      state: { driver: "upstash", base: "nuxtathon" },
    },
    devStorage: {
      // Local dev: plain filesystem, no external service required.
      state: { driver: "fs", base: ".data/state" },
    },
  },
});
