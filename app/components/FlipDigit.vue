<script setup lang="ts">
// One split-flap card. On a value change the top flap folds down showing the
// old digit, then the bottom flap drops in with the new one. The static halves
// underneath already show the new digit (top) and the old digit (bottom), so
// the two animated flaps only cover the transition.
const props = defineProps<{ value: string }>();

const current = ref(props.value);
const previous = ref(props.value);
// Bumped per change so the flaps remount and restart their animation.
const tick = ref(0);

watch(
  () => props.value,
  (next, old) => {
    previous.value = old;
    current.value = next;
    tick.value++;
  },
);
</script>

<template>
  <span class="flip" aria-hidden="true">
    <span class="half top"
      ><i>{{ current }}</i></span
    >
    <span class="half bottom"
      ><i>{{ previous }}</i></span
    >
    <!-- Reduced motion: no flaps, so this static bottom shows the new digit. -->
    <span class="half bottom still"
      ><i>{{ current }}</i></span
    >
    <template v-if="tick">
      <span :key="`t${tick}`" class="half top flap fold"
        ><i>{{ previous }}</i></span
      >
      <span :key="`b${tick}`" class="half bottom flap drop"
        ><i>{{ current }}</i></span
      >
    </template>
  </span>
</template>

<style scoped>
.flip {
  --h: clamp(2.4rem, 7vw, 4rem);
  position: relative;
  display: inline-block;
  width: calc(var(--h) * 0.72);
  height: var(--h);
  perspective: calc(var(--h) * 4);
}
.half {
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--line);
  backface-visibility: hidden;
}
.half i {
  display: block;
  height: var(--h);
  line-height: var(--h);
  font-style: normal;
  font-family: "JetBrains Mono", monospace;
  font-weight: 800;
  font-size: calc(var(--h) * 0.8);
  text-align: center;
  color: var(--mint);
  text-shadow: 0 0 12px rgba(0, 220, 130, 0.35);
}
.top {
  top: 0;
  border-radius: 4px 4px 0 0;
  border-bottom: none;
  transform-origin: bottom;
}
.bottom {
  bottom: 0;
  border-radius: 0 0 4px 4px;
  border-top: none;
  transform-origin: top;
}
/* Shift the glyph up so its lower half sits in the bottom box. */
.bottom i {
  transform: translateY(-50%);
}
/* Seam between the flaps. */
.flip::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--base);
  z-index: 3;
}
.flap {
  z-index: 2;
}
.fold {
  animation: fold 0.28s ease-in forwards;
}
.drop {
  transform: rotateX(90deg);
  animation: drop 0.28s ease-out 0.28s forwards;
}
.still {
  display: none;
}
@keyframes fold {
  to {
    transform: rotateX(-90deg);
  }
}
@keyframes drop {
  to {
    transform: rotateX(0deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .flap {
    display: none;
  }
  .still {
    display: block;
  }
}
</style>
