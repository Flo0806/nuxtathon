<script setup lang="ts">
import { marked } from "marked";
import type { EventSettings, SettingsKey } from "#shared/types/event";
import { ORGANIZER_LOGIN, SETTINGS_KEYS } from "#shared/types/event";
import { isKeyLocked, validateWindow } from "#shared/utils/event-window";

definePageMeta({ layout: "admin" });

interface Payload {
  defaults: EventSettings;
  settings: EventSettings;
  // Keys the current phase forbids changing ("*" = all); frozen = event fired.
  locked: string[];
  frozen: boolean;
}

// Drives the form. New key = entry here + SETTINGS_KEYS.
interface Field {
  key: SettingsKey;
  group: "Content" | "Event";
  label: string;
  help: string;
  // list = one entry per line; datetime = UTC.
  type: "text" | "markdown" | "list" | "datetime";
}
const FIELDS: Field[] = [
  {
    key: "eyebrow",
    group: "Content",
    label: "Eyebrow",
    help: "Kicker above the title.",
    type: "text",
  },
  {
    key: "title",
    group: "Content",
    label: "Title",
    help: "Display title in the intro reveal.",
    type: "text",
  },
  {
    key: "description",
    group: "Content",
    label: "Description",
    help: "Intro paragraph. Inline Markdown: **bold**, `code`, [links](url).",
    type: "markdown",
  },
  {
    key: "rules",
    group: "Content",
    label: "Rules",
    help: "One rule per line, inline Markdown. Leave empty to hide the block.",
    type: "list",
  },
  {
    key: "startsAt",
    group: "Event",
    label: "Start (UTC)",
    help: "Event window opens.",
    type: "datetime",
  },
  {
    key: "endsAt",
    group: "Event",
    label: "End (UTC)",
    help: "Event window closes.",
    type: "datetime",
  },
  {
    key: "qualifyingBefore",
    group: "Event",
    label: "Issue cutoff (UTC)",
    help: "An issue only qualifies if it was created before this instant.",
    type: "datetime",
  },
  {
    key: "coreTeam",
    group: "Event",
    label: "Core team",
    help: `GitHub logins excluded from the prize ranking, one per line. ${ORGANIZER_LOGIN} is always included.`,
    type: "list",
  },
  {
    key: "closeMarker",
    group: "Event",
    label: "Close marker",
    help: "Comment keyword that credits a PR-less close. Empty disables it.",
    type: "text",
  },
  {
    key: "markerAuthors",
    group: "Event",
    label: "Marker authors",
    help: `Logins whose "<marker> @user" comments count as a credit, one per line. ${ORGANIZER_LOGIN} is always included.`,
    type: "list",
  },
];
const GROUPS = ["Content", "Event"] as const;

const toast = useToast();
const auth = useAdminAuth();

const defaults = ref<EventSettings>({});
const locked = ref<string[]>(["*"]);
const frozen = ref(false);
// String form state; lists and datetimes are converted on load/save.
const form = reactive(
  Object.fromEntries(SETTINGS_KEYS.map((k) => [k, ""])) as Record<SettingsKey, string>,
);
const busy = ref(false);
const loading = ref(false);

const typeOf = (key: SettingsKey) => FIELDS.find((f) => f.key === key)?.type ?? "text";
const isLocked = (f: Field) => isKeyLocked(locked.value, f.key);

const toLocal = (iso: string) => iso.slice(0, 16);
const toIso = (local: string) => (local ? `${local}:00.000Z` : "");

function toForm(key: SettingsKey, value: EventSettings[SettingsKey] | undefined): string {
  if (Array.isArray(value)) return value.join("\n");
  const v = value ?? "";
  return typeOf(key) === "datetime" ? toLocal(v) : v;
}
function fromForm(key: SettingsKey): string | string[] {
  const v = form[key];
  if (typeOf(key) === "list") return v.split("\n");
  if (typeOf(key) === "datetime") return toIso(v);
  return v;
}
function defaultOf(key: SettingsKey): string {
  return toForm(key, defaults.value[key]);
}
// Empty = default, same as the server.
function effective(key: SettingsKey): string {
  return form[key].trim() || defaultOf(key);
}
function isOverridden(key: SettingsKey): boolean {
  return form[key].trim() !== "" && form[key].trim() !== defaultOf(key);
}
function resetField(key: SettingsKey) {
  form[key] = "";
}

// Same rules as the server, on the effective values; locked fields are skipped.
const windowErrors = computed(() =>
  validateWindow(
    {
      startsAt: toIso(effective("startsAt")),
      endsAt: toIso(effective("endsAt")),
      qualifyingBefore: toIso(effective("qualifyingBefore")),
    },
    locked.value,
  ),
);
const fieldError = (key: SettingsKey) =>
  (windowErrors.value as Partial<Record<SettingsKey, string>>)[key];
const formValid = computed(() => Object.keys(windowErrors.value).length === 0);

// Same renderer as the public page.
const previews = computed(() => ({
  description: marked.parseInline(effective("description")) as string,
  rules: effective("rules")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => marked.parseInline(r) as string),
}));

function apply(p: Payload) {
  defaults.value = p.defaults;
  locked.value = p.locked;
  frozen.value = p.frozen;
  for (const key of SETTINGS_KEYS) form[key] = toForm(key, p.settings[key]);
}

async function load() {
  loading.value = true;
  try {
    apply(await $fetch<Payload>("/api/admin/settings", { headers: auth.authHeaders() }));
  } finally {
    loading.value = false;
  }
}

async function save() {
  busy.value = true;
  try {
    const settings = Object.fromEntries(
      SETTINGS_KEYS.map((k) => [k, fromForm(k)]),
    ) as EventSettings;
    const res = await $fetch<Payload>("/api/admin/settings", {
      method: "PUT",
      headers: auth.authHeaders(),
      body: { settings },
    });
    apply({ ...res, defaults: defaults.value });
    toast.success("Settings saved");
  } catch (e) {
    if (!auth.handle401(e)) toast.error(errMsg(e));
  } finally {
    busy.value = false;
  }
}

const { visible } = useAdminPage(load);
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-8">
    <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
      <span
        v-if="loading || busy"
        class="i-ph-spinner mr-2 inline-block animate-spin text-primary"
        aria-label="working"
      />
      Empty fields use the committed default; a filled field overrides it. Changes go live on the
      next page load.
    </p>
    <p
      v-if="frozen"
      class="panel flex items-start gap-2 px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-amber"
    >
      <span class="i-ph-lock mt-[2px] shrink-0" aria-hidden="true" />
      <span
        >The event is fired. Settings are read-only until you unfreeze or start a new event.</span
      >
    </p>

    <section v-for="g in GROUPS" :key="g" class="flex flex-col gap-6">
      <h2
        class="flex items-center gap-3 border-b border-line pb-2 font-display text-lg font-bold uppercase tracking-wider text-mint"
      >
        {{ g }}
      </h2>

      <div
        v-for="f in FIELDS.filter((x) => x.group === g)"
        :key="f.key"
        class="flex flex-col gap-2"
      >
        <div class="flex items-center justify-between gap-3">
          <label :for="`s-${f.key}`" class="font-mono text-sm uppercase tracking-wider text-fg">
            {{ f.label }}
            <span v-if="isOverridden(f.key)" class="ml-2 text-[0.65rem] text-amber"
              >overridden</span
            >
            <span v-if="isLocked(f) && !frozen" class="ml-2 text-[0.65rem] text-muted">
              <span class="i-ph-lock inline-block align-[-2px]" aria-hidden="true" /> locked in this
              phase
            </span>
          </label>
          <button
            v-if="form[f.key] && !isLocked(f)"
            class="btn"
            :disabled="busy"
            @click="resetField(f.key)"
          >
            <span class="i-ph-arrow-counter-clockwise" aria-hidden="true" />
            Default
          </button>
        </div>
        <p class="font-mono text-[0.72rem] leading-relaxed text-muted">{{ f.help }}</p>

        <input
          v-if="f.type === 'text' || f.type === 'datetime'"
          :id="`s-${f.key}`"
          v-model="form[f.key]"
          :type="f.type === 'datetime' ? 'datetime-local' : 'text'"
          :placeholder="defaultOf(f.key)"
          :disabled="isLocked(f)"
          class="input disabled:opacity-50"
          :class="{ '!border-red-500': fieldError(f.key) }"
          :aria-invalid="Boolean(fieldError(f.key))"
        />
        <textarea
          v-else
          :id="`s-${f.key}`"
          v-model="form[f.key]"
          :placeholder="defaultOf(f.key)"
          :rows="f.type === 'list' ? 4 : 3"
          :disabled="isLocked(f)"
          class="input resize-y leading-relaxed disabled:opacity-50"
        />
        <span v-if="fieldError(f.key)" class="font-mono text-[0.72rem] text-red-400">
          {{ fieldError(f.key) }}
        </span>

        <div
          v-if="f.type === 'markdown'"
          class="panel px-4 py-3 text-fg leading-[1.6] [&_strong]:(text-mint font-bold) [&_code]:(font-mono text-[0.85em] text-primary bg-surface border border-line rounded px-[0.35em] py-[0.05em])"
          v-html="previews.description"
        />
        <ul
          v-else-if="f.key === 'rules' && previews.rules.length"
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
      </div>

      <div v-if="g === 'Event'" class="flex flex-col gap-2">
        <span class="font-mono text-sm uppercase tracking-wider text-fg">Display time zone</span>
        <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
          Fixed to UTC for now; dates above and on the public page are UTC.
        </p>
        <input value="UTC" disabled class="input opacity-50" aria-label="display time zone" />
      </div>
    </section>

    <button
      class="btn self-start"
      :disabled="busy || loading || frozen || !formValid"
      @click="save"
    >
      <span class="i-ph-floppy-disk" aria-hidden="true" />
      Save settings
    </button>
  </div>
</template>
