<script setup lang="ts">
// Reveal timing lives in the Uno theme (animate-* utilities). The shutters are
// base-coloured, so they read only where they cover the backdrop grid and vanish
// invisibly against the page. Overlap with neighbours is handled by stacking (the
// logo sits above via z-index; content below wins by DOM order), not by clipping,
// so the shutters stay visible as they slide out. The title box keeps a stable
// height; decorative layers are absolute, aria-hidden, and dropped for
// reduced-motion users.
defineProps<{
  eyebrow: string;
  title: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center gap-[1.4rem]">
    <div class="relative inline-block px-[0.25em] py-[0.08em]">
      <h1 class="relative z-1 animate-title-in motion-reduce:animate-none">
        <span
          class="font-display font-bold uppercase tracking-[0.06em] leading-[0.9] text-[clamp(2.5rem,12vw,8rem)] text-mint [text-shadow:0_0_4px_rgba(0,220,130,0.9),0_0_28px_rgba(0,220,130,0.55)] animate-neon motion-reduce:animate-none"
        >
          {{ title }}
        </span>
      </h1>

      <!-- Base-coloured shutters that slide apart to "tear" the title open. -->
      <span
        class="absolute left-[-12%] right-[-12%] top-0 h-[52%] z-2 bg-base animate-shutter-up motion-reduce:hidden"
        aria-hidden="true"
      />
      <span
        class="absolute left-[-12%] right-[-12%] bottom-0 h-[52%] z-2 bg-base animate-shutter-down motion-reduce:hidden"
        aria-hidden="true"
      />

      <!-- Bright seam at the split line. -->
      <span
        class="absolute left-[-6%] right-[-6%] top-1/2 h-[2px] z-3 bg-[linear-gradient(90deg,transparent,var(--mint),#fff,var(--mint),transparent)] shadow-[0_0_24px_var(--primary)] animate-seam-flash motion-reduce:hidden"
        aria-hidden="true"
      />

      <svg
        class="absolute inset-y-0 left-[6%] h-full w-auto z-3 fill-amber [filter:drop-shadow(0_0_8px_var(--amber))] animate-bolt-a motion-reduce:hidden"
        viewBox="0 0 40 200"
        aria-hidden="true"
      >
        <polygon points="26,0 6,110 19,110 12,200 40,78 25,78 34,0" />
      </svg>
      <svg
        class="absolute inset-y-0 right-[8%] h-full w-auto -scale-x-100 z-3 fill-amber [filter:drop-shadow(0_0_8px_var(--amber))] animate-bolt-b motion-reduce:hidden"
        viewBox="0 0 40 200"
        aria-hidden="true"
      >
        <polygon points="26,0 6,110 19,110 12,200 40,78 25,78 34,0" />
      </svg>
    </div>

    <p
      class="font-mono text-[0.75rem] tracking-[0.35em] uppercase text-primary animate-fade-up motion-reduce:animate-none"
    >
      {{ eyebrow }}
    </p>
  </div>
</template>
