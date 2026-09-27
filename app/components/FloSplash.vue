<script setup lang="ts">
// Intro for the issue list: the mascot lands in the middle, gives a beat, then
// flies into the header and stays there as the page icon. One shot per mount,
// under a second and a half, then it is furniture. Clicking it once it has
// landed plays the whole thing again, because of course people will try.
const landed = ref(false);
// Keying the image on this restarts the CSS animations on replay.
const run = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;

// `restart` swaps the element to replay the CSS animation. It stays off for the
// first run: the markup comes from the server and is already animating, so
// bumping the key on hydration would play the whole thing a second time.
function play(restart = false) {
  clearTimeout(timer);
  if (restart) run.value++;
  landed.value = false;
  timer = setTimeout(() => (landed.value = true), 900);
}

onMounted(() => play());
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="splash" :class="{ landed }">
    <!-- The button stays mounted so keyboard focus survives a replay; only the
         image is keyed, which is what restarts the CSS animation. -->
    <button type="button" class="trigger" :class="{ landed }" @click="play(true)">
      <span class="sr-only">Play the intro again</span>
      <img
        :key="run"
        src="/flo.png"
        alt=""
        width="512"
        height="512"
        class="mascot"
        :class="{ landed }"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
/* The travelling layer: fixed and centred while flying, static once landed. */
.splash {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.splash.landed {
  position: static;
  display: block;
  /* Only the landed icon is clickable; the flying one must not eat clicks. */
  pointer-events: auto;
}

.trigger {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  line-height: 0;
  cursor: default;
}
.trigger.landed {
  cursor: pointer;
}
.trigger:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
  border-radius: 50%;
}

.mascot {
  /* As large as the viewport comfortably allows, capped so it stays a portrait
     rather than a wallpaper. */
  width: min(20rem, 62vmin);
  height: min(20rem, 62vmin);
  border-radius: 50%;
  border: 2px solid var(--primary);
  background: var(--surface);
  object-fit: cover;
  box-shadow: 0 0 40px rgba(0, 220, 130, 0.35);
  animation: pop 0.55s cubic-bezier(0.2, 1.3, 0.35, 1) both;
}
.mascot.landed {
  width: 3.25rem;
  height: 3.25rem;
  box-shadow: 0 0 14px rgba(0, 220, 130, 0.35);
  /* The size change alone reads as the flight, because the element moves from
     the centred overlay into the header in the same frame. */
  transition:
    width 0.5s cubic-bezier(0.5, 0, 0.2, 1),
    height 0.5s cubic-bezier(0.5, 0, 0.2, 1),
    box-shadow 0.5s ease-out;
  animation: none;
}

@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(-14deg);
  }
  70% {
    opacity: 1;
    transform: scale(1.06) rotate(3deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .splash {
    position: static;
    display: block;
  }
  .mascot,
  .mascot.landed {
    width: 3.25rem;
    height: 3.25rem;
    animation: none;
    /* Repeated for the landed state: it is more specific, so without this its
       own transition would still animate the shadow. */
    transition: none;
  }
}
</style>
