<script setup lang="ts">
// Header icon for the issue list. It fades in around the middle of the header
// row and rolls left into its slot; the roll is pure CSS so it already runs on
// the server markup. Clicking it shows a larger portrait on top of the page,
// any click elsewhere (or Escape) puts it back. Nothing else moves around.
const open = ref(false);
const root = ref<HTMLElement>();

function onPointerDown(e: PointerEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <button
    ref="root"
    type="button"
    class="slot"
    :aria-expanded="open"
    aria-label="Enlarge the portrait"
    @click="open = !open"
  >
    <img
      src="/flo.png"
      alt=""
      width="512"
      height="512"
      class="mascot"
      :class="{ open }"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
/* The slot keeps the small size in the layout at all times, so enlarging the
   portrait never pushes the title around. */
.slot {
  position: relative;
  display: block;
  flex: none;
  width: 3.25rem;
  height: 3.25rem;
  padding: 0;
  border: 0;
  background: none;
  line-height: 0;
  cursor: pointer;
}
.slot:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
  border-radius: 50%;
}

.mascot {
  /* Start offset and spin of the roll. The spin is not derived from the
     distance (CSS cannot divide lengths), it is picked to look roughly like
     rolling without slipping at typical widths. */
  --from: calc(min(50vw, 36rem) - 4rem);
  --spin: 900deg;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 40;
  width: 3.25rem;
  height: 3.25rem;
  /* The reset caps images at 100% of the containing block, which is the small
     slot here, so the enlarged state would never grow without this. */
  max-width: none;
  border-radius: 50%;
  border: 2px solid var(--primary);
  background: var(--surface);
  object-fit: cover;
  box-shadow: 0 0 14px rgba(0, 220, 130, 0.35);
  transition:
    width 0.35s cubic-bezier(0.3, 0, 0.2, 1),
    height 0.35s cubic-bezier(0.3, 0, 0.2, 1),
    box-shadow 0.35s ease-out;
  animation: roll 1.2s cubic-bezier(0.25, 0.6, 0.3, 1) both;
}
.mascot.open {
  width: min(18rem, calc(100vw - 2.5rem));
  height: min(18rem, calc(100vw - 2.5rem));
  box-shadow: 0 0 40px rgba(0, 220, 130, 0.35);
}

/* Narrow screens have no meaningful middle next to the title, so the icon
   rolls in from beyond the right edge instead. The page clips the overflow. */
@media (max-width: 40rem) {
  .mascot {
    --from: 100vw;
    --spin: 1080deg;
  }
}

@keyframes roll {
  0% {
    opacity: 0;
    transform: translateX(var(--from)) rotate(var(--spin));
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mascot {
    animation: none;
    transition: none;
  }
}
</style>
