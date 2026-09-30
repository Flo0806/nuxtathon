<template>
  <div class="relative min-h-dvh overflow-x-hidden">
    <div class="bg-grid" aria-hidden="true" />
    <div class="bg-vignette" aria-hidden="true" />
    <div class="bg-scanlines" aria-hidden="true" />

    <div class="relative z-10 flex min-h-dvh flex-col">
      <slot />
      <AppFooter />
    </div>

    <!-- The developer's view of the shared GitHub budget; nobody else sees it. -->
    <GithubBudget v-if="isDeveloper" source="session" class="fixed bottom-3 left-3 z-50" />

    <AppToast />
    <AppConfirm />
  </div>
</template>

<script setup lang="ts">
import { DEVELOPER_LOGIN } from "#shared/types/event";

const { loggedIn, user } = useUserSession();
const isDeveloper = computed(
  () => loggedIn.value && user.value?.login?.toLowerCase() === DEVELOPER_LOGIN.toLowerCase(),
);
</script>
