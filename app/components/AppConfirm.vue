<script setup lang="ts">
const { state, answer } = useConfirm();
</script>

<template>
  <AppDialog
    :model-value="state.open"
    :title="state.title"
    @update:model-value="(v: boolean) => !v && answer(false)"
  >
    <p class="font-mono text-sm leading-relaxed text-fg">{{ state.message }}</p>
    <div class="mt-6 flex justify-end gap-3">
      <button class="btn" @click="answer(false)">Cancel</button>
      <button class="btn border-amber text-amber hover:border-amber" @click="answer(true)">
        {{ state.confirmLabel }}
      </button>
    </div>
  </AppDialog>
</template>
