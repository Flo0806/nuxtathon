<script setup lang="ts">
import type { BoardIssue } from "#shared/types/issues";
import { splitIssueRef } from "#shared/utils/issue-ref";

defineProps<{
  issue: BoardIssue;
  watched: boolean;
  fresh: boolean;
  age: string;
  busy: boolean;
  // The watch column mixes repos, so every row there names its own.
  showRepo?: boolean;
}>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <!-- A change on something you follow should be impossible to scroll past, so
       the whole row lights up rather than just the label. -->
  <div
    class="flex items-start gap-3 px-4 py-2.5 transition-colors"
    :class="
      fresh
        ? 'border-l-2 border-primary bg-primary/8 shadow-[inset_0_0_18px_rgba(0,220,130,0.18)]'
        : 'border-l-2 border-transparent'
    "
  >
    <button
      class="mt-0.5 shrink-0 transition-colors"
      :class="watched ? 'text-amber' : 'text-faint hover:text-muted'"
      :disabled="busy"
      :aria-pressed="watched"
      :aria-label="watched ? 'Stop watching' : 'Watch this issue'"
      @click="$emit('toggle')"
    >
      <span
        :class="watched ? 'i-ph-star-fill' : 'i-ph-star'"
        class="block text-[1rem]"
        aria-hidden="true"
      />
    </button>

    <div class="min-w-0 flex-1">
      <a
        :href="issue.url"
        target="_blank"
        rel="noopener noreferrer"
        class="block truncate font-mono text-[0.8rem] hover:text-primary hover:underline"
        :class="issue.closed ? 'text-muted line-through decoration-muted/60' : 'text-fg'"
      >
        <span class="text-muted">#{{ issue.number }}</span>
        {{ issue.title }}
      </a>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-[0.62rem] text-muted">
        <span
          v-if="showRepo"
          class="rounded-sm border border-amber/50 bg-amber/10 px-1.5 py-px font-bold text-amber"
          >{{ splitIssueRef(issue.ref).repo }}</span
        >
        <span>{{ age }} old</span>
        <span v-if="issue.upvotes">{{ issue.upvotes }} &#128077;</span>
        <span v-if="issue.comments">{{ issue.comments }} comments</span>
        <span v-if="issue.closed" class="font-bold uppercase tracking-wider text-primary">
          closed
        </span>
        <span v-if="issue.hasPr" class="text-amber">has a PR</span>
        <span v-if="issue.assignee" class="text-amber">@{{ issue.assignee }}</span>
        <span
          v-if="fresh"
          class="glow rounded-sm bg-primary/15 px-1.5 py-0.5 font-bold uppercase tracking-wider text-primary"
          >updated</span
        >
      </p>
    </div>
  </div>
</template>
