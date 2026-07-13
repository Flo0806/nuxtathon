<template>
  <div class="relative min-h-dvh overflow-x-hidden">
    <div class="bg-grid" aria-hidden="true" />
    <div class="bg-vignette" aria-hidden="true" />
    <div class="bg-scanlines" aria-hidden="true" />

    <div class="relative z-10 flex min-h-dvh flex-col">
      <slot />
      <AppFooter />
    </div>

    <AppToast />
    <AppConfirm />
  </div>
</template>
