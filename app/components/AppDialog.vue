<script setup lang="ts">
const open = defineModel<boolean>({ default: false });
const props = defineProps<{ title?: string; persistent?: boolean }>();

const dismiss = () => {
  if (!props.persistent) open.value = false;
};
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center p-5"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="dismiss" />
        <div class="panel relative z-10 w-full max-w-[24rem] p-6">
          <h2
            v-if="title"
            class="mb-4 font-display text-lg font-bold uppercase tracking-wider text-mint"
          >
            {{ title }}
          </h2>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
