<script setup lang="ts">
import type { ContributionIds, LeaderboardEntry } from "#shared/types/event";

const props = defineProps<{ entries: LeaderboardEntry[]; contributions?: ContributionIds }>();
</script>

<template>
  <TransitionGroup
    tag="ol"
    move-class="transition-transform duration-700 ease-out"
    class="panel w-full divide-y divide-line/60"
  >
    <li v-for="e in entries" :key="e.login">
      <LeaderboardListItem :entry="e" :contributions="props.contributions" />
    </li>
  </TransitionGroup>
</template>
