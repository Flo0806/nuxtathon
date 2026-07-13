<script setup lang="ts">
const { toasts } = useToast();
</script>

<template>
  <div class="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
    <TransitionGroup
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition-all duration-300 ease-out absolute"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="panel px-4 py-2 font-mono text-sm shadow-[0_0_20px_rgba(0,0,0,0.5)]"
        :class="t.type === 'error' ? 'border-amber text-amber' : 'border-primary text-primary'"
      >
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
