<script setup lang="ts">
import type { Award, AwardIcon } from "#shared/types/event";
import { AWARD_ICONS } from "#shared/types/event";

definePageMeta({ layout: "admin" });

interface Recipient {
  login: string;
  name: string | null;
  score: number;
  rank: number;
}
interface ArchivedEvent {
  slug: string;
  title: string;
  eyebrow: string;
  startsAt: string;
  finalizedAt: string;
  awards: Award[];
  recipients: Recipient[];
}

const toast = useToast();
const auth = useAdminAuth();

const events = ref<ArchivedEvent[]>([]);
const slug = ref("");
const awards = ref<Award[]>([]);
const busy = ref(false);

const current = computed(() => events.value.find((e) => e.slug === slug.value) ?? null);

async function load() {
  events.value = await $fetch<ArchivedEvent[]>("/api/admin/awards", {
    headers: auth.authHeaders(),
  });
  // Newest first from the server; keep the selection across reloads.
  if (!events.value.some((e) => e.slug === slug.value)) slug.value = events.value[0]?.slug ?? "";
  pick();
}
function pick() {
  awards.value = (current.value?.awards ?? []).map((a) => ({ ...a }));
}
watch(slug, pick);

function add() {
  const r = current.value?.recipients[0];
  awards.value.push({
    id: "",
    login: r?.login ?? "",
    title: "",
    text: "",
    icon: "trophy",
  });
}
const remove = (i: number) => awards.value.splice(i, 1);

async function save() {
  busy.value = true;
  try {
    const res = await $fetch<{ awards: Award[] }>("/api/admin/awards", {
      method: "PUT",
      headers: auth.authHeaders(),
      body: { slug: slug.value, awards: awards.value },
    });
    awards.value = res.awards.map((a) => ({ ...a }));
    if (current.value) current.value.awards = res.awards;
    toast.success("Awards saved");
  } catch (e) {
    if (!auth.handle401(e)) toast.error(errMsg(e));
  } finally {
    busy.value = false;
  }
}

// Fetches with the auth header (a plain link could not send it) and opens the
// PDF in a new tab.
const previewing = ref<number | null>(null);
async function preview(i: number) {
  previewing.value = i;
  try {
    const blob = await $fetch<Blob>("/api/admin/awards/preview", {
      method: "POST",
      headers: auth.authHeaders(),
      body: { slug: slug.value, award: awards.value[i] },
      responseType: "blob",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    if (!auth.handle401(e)) toast.error(errMsg(e));
  } finally {
    previewing.value = null;
  }
}

const { visible } = useAdminPage(load);
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-6">
    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      Prizes for a finished event. Everyone in the standings gets a participation certificate;
      recipients listed here get an award certificate with the title, line and icon you choose.
    </p>

    <p v-if="!events.length" class="panel px-6 py-10 text-center font-mono text-sm text-muted">
      No finished event yet. Awards are handed out after fire.
    </p>

    <template v-else>
      <label
        class="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-wider text-muted"
      >
        Event
        <select v-model="slug" class="input">
          <option v-for="e in events" :key="e.slug" :value="e.slug">
            {{ e.title }} · {{ e.eyebrow }} · fired {{ e.finalizedAt.slice(0, 10) }} ·
            {{ e.recipients.length }} recipients
          </option>
        </select>
      </label>

      <p
        v-if="current && !current.recipients.length"
        class="panel px-6 py-6 text-center font-mono text-sm text-muted"
      >
        This event has no contributors with a score, so nobody can receive an award.
      </p>

      <div v-for="(a, i) in awards" :key="a.id || i" class="panel flex flex-col gap-3 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="a.login" class="input min-w-56 flex-1" aria-label="recipient">
            <option v-for="r in current?.recipients" :key="r.login" :value="r.login">
              #{{ r.rank }} {{ r.name || r.login }} (@{{ r.login }}) · {{ r.score }}
            </option>
          </select>
          <button class="btn" :disabled="busy || previewing !== null" @click="preview(i)">
            <span
              :class="previewing === i ? 'i-ph-spinner animate-spin' : 'i-ph-eye'"
              aria-hidden="true"
            />
            Preview
          </button>
          <button class="btn" :disabled="busy" aria-label="remove award" @click="remove(i)">
            <span class="i-ph-x" aria-hidden="true" />
          </button>
        </div>
        <input
          v-model="a.title"
          placeholder="Title, e.g. Most helpful community member"
          class="input"
        />
        <input
          v-model="a.text"
          placeholder="One line, e.g. for answering every question in the Discord"
          class="input"
        />
        <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="icon">
          <button
            v-for="ic in AWARD_ICONS"
            :key="ic"
            type="button"
            class="btn px-2 py-1"
            :class="a.icon === ic ? '!border-primary !text-primary' : ''"
            :aria-pressed="a.icon === ic"
            :title="ic"
            @click="a.icon = ic as AwardIcon"
          >
            <span :class="`i-ph-${ic}-fill`" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="flex gap-3">
        <button class="btn" :disabled="busy || !current" @click="add">
          <span class="i-ph-plus" aria-hidden="true" />
          Add award
        </button>
        <button class="btn" :disabled="busy || !current" @click="save">
          <span class="i-ph-floppy-disk" aria-hidden="true" />
          Save awards
        </button>
      </div>
    </template>
  </div>
</template>
