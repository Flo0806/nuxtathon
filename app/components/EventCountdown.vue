<script setup lang="ts">
import type { EventPhase } from "#shared/types/event";

const props = defineProps<{
  phase: EventPhase;
  startsAt: string;
  endsAt: string;
}>();

// Before the event we count down to the start, during it to the end.
const target = computed(() => (props.phase === "upcoming" ? props.startsAt : props.endsAt));
const label = computed(() => (props.phase === "upcoming" ? "Starts in" : "Time remaining"));

// The clock is simply client only
const now = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  now.value = Date.now();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const remaining = computed(() => Math.max(0, Date.parse(target.value) - now.value));

const pad = (n: number) => String(n).padStart(2, "0");

const slots = computed(() => {
  const total = Math.floor(remaining.value / 1000);
  return [
    { value: pad(Math.floor(total / 86400)), unit: "days" },
    { value: pad(Math.floor((total % 86400) / 3600)), unit: "hrs" },
    { value: pad(Math.floor((total % 3600) / 60)), unit: "min" },
    { value: pad(total % 60), unit: "sec" },
  ];
});

const units = ["days", "hrs", "min", "sec"];
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <template v-if="phase === 'upcoming' || phase === 'live'">
      <p
        class="inline-flex items-center gap-[0.55rem] font-mono text-[0.72rem] tracking-[0.28em] uppercase text-muted"
      >
        <span v-if="phase === 'live'" class="pulse-dot" aria-hidden="true" />
        {{ label }}
      </p>
      <ClientOnly>
        <div class="flex gap-[0.6rem]">
          <div
            v-for="s in slots"
            :key="s.unit"
            class="panel flex flex-col items-center gap-[0.35rem] min-w-[clamp(3.4rem,9vw,5.2rem)] px-[0.5rem] pt-[0.7rem] pb-[0.55rem]"
          >
            <span
              class="glow font-mono font-extrabold leading-none tabular-nums text-[clamp(1.7rem,5.5vw,3rem)]"
            >
              {{ s.value }}
            </span>
            <span class="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-muted">{{
              s.unit
            }}</span>
          </div>
        </div>
        <template #fallback>
          <div class="flex gap-[0.6rem]">
            <div
              v-for="u in units"
              :key="u"
              class="panel flex flex-col items-center gap-[0.35rem] min-w-[clamp(3.4rem,9vw,5.2rem)] px-[0.5rem] pt-[0.7rem] pb-[0.55rem]"
            >
              <span
                class="glow font-mono font-extrabold leading-none tabular-nums text-[clamp(1.7rem,5.5vw,3rem)]"
              >
                --
              </span>
              <span class="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-muted">{{
                u
              }}</span>
            </div>
          </div>
        </template>
      </ClientOnly>
    </template>

    <div
      v-else-if="phase === 'evaluating'"
      class="panel relative inline-flex items-center gap-[0.7rem] overflow-hidden px-6 py-[0.85rem]"
    >
      <span class="pulse-dot" aria-hidden="true" />
      <span class="font-mono text-[0.9rem] tracking-[0.24em] uppercase text-amber"
        >Evaluating results</span
      >
      <span
        class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber/15 to-transparent animate-scan motion-reduce:hidden"
        aria-hidden="true"
      />
    </div>

    <div v-else class="panel inline-flex items-center px-6 py-[0.85rem]">
      <span class="font-mono text-[0.9rem] tracking-[0.24em] uppercase text-primary"
        >Results are live</span
      >
    </div>
  </div>
</template>
