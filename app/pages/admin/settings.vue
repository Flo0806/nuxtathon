<script setup lang="ts">
import { marked } from "marked";
import type { EventSettings, SettingsKey } from "#shared/types/event";
import { SETTINGS_KEYS } from "#shared/types/event";

interface Payload {
  defaults: EventSettings;
  settings: EventSettings;
}

// Field metadata drives the form. New editable text = one entry here plus the
// key in SETTINGS_KEYS; the template stays untouched.
interface Field {
  key: SettingsKey;
  label: string;
  help: string;
  // text: single line. markdown: inline Markdown with preview. list: one
  // inline-Markdown entry per line.
  type: "text" | "markdown" | "list";
}
const FIELDS: Field[] = [
  { key: "eyebrow", label: "Eyebrow", help: "Kicker above the title.", type: "text" },
  { key: "title", label: "Title", help: "Display title in the intro reveal.", type: "text" },
  {
    key: "description",
    label: "Description",
    help: "Intro paragraph. Inline Markdown: **bold**, `code`, [links](url).",
    type: "markdown",
  },
  {
    key: "rules",
    label: "Rules",
    help: "One rule per line, inline Markdown. Leave empty to hide the block.",
    type: "list",
  },
];

const toast = useToast();
const auth = useAdminAuth();

const defaults = ref<EventSettings>({});
// Form state as strings so the textarea for rules can bind directly; converted
// back to string[] on save.
const form = reactive<Record<SettingsKey, string>>({
  title: "",
  eyebrow: "",
  description: "",
  rules: "",
});
const busy = ref(false);
const loading = ref(false);

function errMsg(e: unknown): string {
  const err = e as { data?: { statusMessage?: string; message?: string }; message?: string };
  return err?.data?.statusMessage || err?.data?.message || err?.message || "Request failed";
}

function toForm(value: EventSettings[SettingsKey] | undefined): string {
  return Array.isArray(value) ? value.join("\n") : (value ?? "");
}
function defaultOf(key: SettingsKey): string {
  return toForm(defaults.value[key]);
}
// Empty input falls back to the default, both in the preview and on the server.
function effective(key: SettingsKey): string {
  return form[key].trim() || defaultOf(key);
}
function isOverridden(key: SettingsKey): boolean {
  return form[key].trim() !== "" && form[key].trim() !== defaultOf(key);
}
function resetField(key: SettingsKey) {
  form[key] = "";
}

// Same renderer as the public page, so the preview is what visitors get.
const previews = computed(() => ({
  description: marked.parseInline(effective("description")) as string,
  rules: effective("rules")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => marked.parseInline(r) as string),
}));

async function load() {
  loading.value = true;
  try {
    const p = await $fetch<Payload>("/api/admin/settings", { headers: auth.authHeaders() });
    defaults.value = p.defaults;
    for (const key of SETTINGS_KEYS) form[key] = toForm(p.settings[key]);
  } finally {
    loading.value = false;
  }
}

async function save() {
  busy.value = true;
  try {
    const settings: EventSettings = {
      title: form.title,
      eyebrow: form.eyebrow,
      description: form.description,
      rules: form.rules.split("\n"),
    };
    const res = await $fetch<{ settings: EventSettings }>("/api/admin/settings", {
      method: "PUT",
      headers: auth.authHeaders(),
      body: { settings },
    });
    for (const key of SETTINGS_KEYS) form[key] = toForm(res.settings[key]);
    toast.success("Settings saved");
  } catch (e) {
    toast.error(errMsg(e));
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  // Login lives on the event page for now. Bounce there until the dialog is
  // shared between admin pages.
  if (!auth.isAuthed.value) {
    await navigateTo("/admin/nuxtathon");
    return;
  }
  try {
    await load();
  } catch (e) {
    toast.error(errMsg(e));
  }
});
</script>

<template>
  <main class="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-6 px-5 py-10">
    <NuxtLink to="/admin/nuxtathon" class="btn self-start">
      <span class="i-ph-arrow-left" aria-hidden="true" />
      Back
    </NuxtLink>

    <h1
      class="flex items-center gap-3 font-display text-2xl font-bold uppercase tracking-wider text-mint"
    >
      Settings
      <span v-if="loading || busy" class="i-ph-spinner animate-spin text-base text-primary" />
    </h1>

    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      Texts on the public page. Empty fields use the committed default; a filled field overrides it.
      Changes go live on the next page load.
    </p>

    <section v-for="f in FIELDS" :key="f.key" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <label :for="`s-${f.key}`" class="font-mono text-sm uppercase tracking-wider text-fg">
          {{ f.label }}
          <span v-if="isOverridden(f.key)" class="ml-2 text-[0.65rem] text-amber">overridden</span>
        </label>
        <button v-if="form[f.key]" class="btn" :disabled="busy" @click="resetField(f.key)">
          <span class="i-ph-arrow-counter-clockwise" aria-hidden="true" />
          Default
        </button>
      </div>
      <p class="font-mono text-[0.72rem] leading-relaxed text-muted">{{ f.help }}</p>

      <input
        v-if="f.type === 'text'"
        :id="`s-${f.key}`"
        v-model="form[f.key]"
        :placeholder="defaultOf(f.key)"
        class="input"
      />
      <textarea
        v-else
        :id="`s-${f.key}`"
        v-model="form[f.key]"
        :placeholder="defaultOf(f.key)"
        :rows="f.type === 'list' ? 4 : 3"
        class="input resize-y leading-relaxed"
      />

      <div
        v-if="f.type === 'markdown'"
        class="panel px-4 py-3 text-fg leading-[1.6] [&_strong]:(text-mint font-bold) [&_code]:(font-mono text-[0.85em] text-primary bg-surface border border-line rounded px-[0.35em] py-[0.05em])"
        v-html="previews.description"
      />
      <ul
        v-else-if="f.type === 'list' && previews.rules.length"
        class="panel flex flex-col gap-2 px-4 py-3"
      >
        <li
          v-for="(r, i) in previews.rules"
          :key="i"
          class="flex gap-2 font-mono text-[0.8rem] leading-relaxed text-muted [&_strong]:text-mint [&_code]:(text-primary bg-surface border border-line rounded px-[0.3em] py-[0.02em])"
        >
          <span class="text-primary" aria-hidden="true">&rsaquo;</span>
          <span v-html="r" />
        </li>
      </ul>
    </section>

    <button class="btn self-start" :disabled="busy || loading" @click="save">
      <span class="i-ph-floppy-disk" aria-hidden="true" />
      Save settings
    </button>
  </main>
</template>
