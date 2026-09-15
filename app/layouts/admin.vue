<script setup lang="ts">
// Shared admin chrome: tab navigation, login gate, and the login dialog. Pages
// under /admin only render once a session exists, so their onMounted can load
// data straight away with auth.authHeaders(). A 401 later on (see
// useAdminAuth.handle401) clears the session, which unmounts the page and brings
// the dialog back.
const TABS = [
  { to: "/admin/nuxtathon", label: "Event", icon: "i-ph-lightning" },
  { to: "/admin/settings", label: "Settings", icon: "i-ph-sliders-horizontal" },
];

const auth = useAdminAuth();
const toast = useToast();

// The token lives in sessionStorage, so SSR always renders logged-out. Gate on
// mount to avoid a hydration mismatch.
const ready = ref(false);
onMounted(() => (ready.value = true));

const showLogin = computed(() => ready.value && !auth.isAuthed.value);
const loginUser = ref("");
const loginPass = ref("");
const loggingIn = ref(false);

async function submitLogin() {
  loggingIn.value = true;
  try {
    // Any admin endpoint verifies the credentials; overview is the cheapest.
    const token = btoa(`${loginUser.value}:${loginPass.value}`);
    await $fetch("/api/admin/overview", { headers: { authorization: `Basic ${token}` } });
    auth.set(loginUser.value, loginPass.value);
    loginPass.value = "";
  } catch (e) {
    toast.error(is401(e) ? "Wrong username or password" : errMsg(e));
  } finally {
    loggingIn.value = false;
  }
}
</script>

<template>
  <div class="relative min-h-dvh overflow-x-hidden">
    <div class="bg-grid" aria-hidden="true" />
    <div class="bg-vignette" aria-hidden="true" />
    <div class="bg-scanlines" aria-hidden="true" />

    <div class="relative z-10 flex min-h-dvh flex-col">
      <main class="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-6 px-5 py-10">
        <div class="flex flex-wrap items-center gap-3">
          <NuxtLink to="/" class="btn">
            <span class="i-ph-arrow-left" aria-hidden="true" />
            Back
          </NuxtLink>
          <h1 class="font-display text-2xl font-bold uppercase tracking-wider text-mint">Admin</h1>
          <button v-if="auth.isAuthed.value" class="btn ml-auto" @click="auth.clear()">
            <span class="i-ph-sign-out" aria-hidden="true" />
            Log out
          </button>
        </div>

        <nav class="flex gap-1 border-b border-line" aria-label="Admin sections">
          <NuxtLink
            v-for="t in TABS"
            :key="t.to"
            :to="t.to"
            class="-mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-fg"
            active-class="!border-primary !text-primary"
          >
            <span :class="t.icon" aria-hidden="true" />
            {{ t.label }}
          </NuxtLink>
        </nav>

        <slot v-if="ready && auth.isAuthed.value" />
      </main>
      <AppFooter />
    </div>

    <AppToast />
    <AppConfirm />

    <AppDialog :model-value="showLogin" title="Admin login" persistent>
      <form class="flex flex-col gap-3" @submit.prevent="submitLogin">
        <input v-model="loginUser" placeholder="username" autocomplete="username" class="input" />
        <input
          v-model="loginPass"
          type="password"
          placeholder="password"
          autocomplete="current-password"
          class="input"
        />
        <button class="btn mt-1 self-end" type="submit" :disabled="loggingIn">
          <span v-if="loggingIn" class="i-ph-spinner animate-spin" aria-hidden="true" />
          Log in
        </button>
      </form>
    </AppDialog>
  </div>
</template>
