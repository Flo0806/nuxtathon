// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@unocss/nuxt", "@pinia/nuxt", "nuxt-auth-utils"],
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    // Server-only secrets, populated from NUXT_* env vars at runtime.
    githubToken: "",
    adminUser: "",
    adminPassword: "",
    // Comma-separated GitHub logins allowed to moderate the chat (NUXT_CHAT_ADMINS).
    chatAdmins: "",
    public: {
      // Public site origin for absolute OG/canonical URLs. Set via
      // NUXT_PUBLIC_SITE_URL, e.g. "https://nuxtathon.live".
      siteUrl: "",
    },
  },
  nitro: {
    // Single self-hosted instance: one process, so filesystem storage is both
    // shared and persistent. `.data` lives next to the running server; no
    // external KV needed.
    storage: {
      state: { driver: "fs", base: ".data/state" },
      cache: { driver: "fs", base: ".data/cache" },
    },
  },
});
