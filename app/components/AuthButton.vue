<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession();

async function logout() {
  await $fetch("/auth/logout", { method: "POST" });
  await clear();
}
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="loggedIn && user">
      <img
        :src="user.avatarUrl"
        :alt="user.login"
        class="h-5 w-5 rounded-full border border-line"
      />
      <span class="font-mono text-xs text-fg">{{ user.login }}</span>
      <button
        class="font-mono text-xs text-muted transition-colors hover:text-primary"
        @click="logout"
      >
        logout
      </button>
    </template>
    <a
      v-else
      href="/auth/github"
      class="inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-primary"
    >
      <span class="i-simple-icons-github" aria-hidden="true" />
      login
    </a>
  </div>
</template>
