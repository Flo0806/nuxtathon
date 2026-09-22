<script setup lang="ts">
import { marked } from "marked";
import type { EventSettings, SettingsKey } from "#shared/types/event";
import { ORGANIZER_LOGIN, SETTINGS_KEYS } from "#shared/types/event";
import type { ScoringRules } from "#shared/types/scoring";
import { DEFAULT_SCORING } from "#shared/types/scoring";
import { isKeyLocked, validateWindow } from "#shared/utils/event-window";

definePageMeta({ layout: "admin" });

interface DiscordStatus {
  running: boolean;
  source: string;
  configured: boolean;
}
interface Payload {
  defaults: EventSettings;
  settings: EventSettings;
  discord: DiscordStatus;
  // Keys the current phase forbids changing ("*" = all); frozen = event fired.
  locked: string[];
  frozen: boolean;
}

// Drives the form. New key = entry here + SETTINGS_KEYS.
interface Field {
  key: TextKey;
  group: "Content" | "Event" | "Integrations";
  label: string;
  help: string;
  // list = one entry per line; datetime = UTC; secret = masked text; toggle =
  // boolean held as "1" / "" in the string form state.
  type: "text" | "markdown" | "list" | "datetime" | "secret" | "toggle";
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
  {
    key: "discordWebhookUrl",
    group: "Integrations",
    label: "Discord webhook",
    help: "Webhook url of the announcement channel (Discord: channel settings, Integrations). Empty turns announcements off.",
    type: "secret",
  },
  {
    key: "discordAnnounce",
    group: "Integrations",
    label: "Announce ranking changes",
    help: "Post to Discord whenever the top 3 changes while the event is live. Fire always posts the final result.",
    type: "toggle",
  },
];
const GROUPS = ["Content", "Event", "Integrations"] as const;
// Everything except `scoring`, which is an object and has its own editor below.
type TextKey = Exclude<SettingsKey, "scoring">;
const TEXT_KEYS = SETTINGS_KEYS.filter((k): k is TextKey => k !== "scoring");

const toast = useToast();
const auth = useAdminAuth();

const defaults = ref<EventSettings>({});
const locked = ref<string[]>(["*"]);
const frozen = ref(false);
const discordStatus = ref<DiscordStatus | null>(null);
const testing = ref(false);
// String form state; lists and datetimes are converted on load/save.
const form = reactive(Object.fromEntries(TEXT_KEYS.map((k) => [k, ""])) as Record<TextKey, string>);
// Point rules, edited as a real object. Label factors live in a row list
// because an object is not directly editable in a form.
const scoring = reactive<ScoringRules>(structuredClone(DEFAULT_SCORING));
const labelRows = ref<{ label: string; points: number }[]>([]);
const scoringLocked = computed(() => isKeyLocked(locked.value, "scoring"));

// Worked example under the rules: an old, labelled, popular issue, computed
// with whatever is currently in the form.
const scoringExample = computed(() => {
  const first = labelRows.value.find((r) => r.label.trim());
  const base = scoring.issuePoints.enabled ? Number(scoring.issuePoints.points) || 0 : 1;
  const parts = [`${base} base`];
  let total = base;
  if (scoring.ageBonus.enabled) {
    const p = Number(scoring.ageBonus.points) || 0;
    parts.push(`+${p} older than ${scoring.ageBonus.afterMonths} months`);
    total += p;
  }
  if (scoring.labelBonus.enabled && first) {
    const p = Number(first.points) || 0;
    parts.push(`+${p} ${first.label.trim()}`);
    total += p;
  }
  if (scoring.upvoteBonus.enabled) {
    const per = Number(scoring.upvoteBonus.per) || 0;
    const p = Number(scoring.upvoteBonus.points) || 0;
    if (per > 0) {
      parts.push(`+${p} for ${per} thumbs-up`);
      total += p;
    }
  }
  return `${parts.join("  ")}  =  ${Math.round(total * 100) / 100} points`;
});
const busy = ref(false);
const loading = ref(false);

const typeOf = (key: TextKey) => FIELDS.find((f) => f.key === key)?.type ?? "text";
const isLocked = (f: Field) => isKeyLocked(locked.value, f.key);

const toLocal = (iso: string) => iso.slice(0, 16);
const toIso = (local: string) => (local ? `${local}:00.000Z` : "");

function toForm(key: TextKey, value: EventSettings[TextKey] | undefined): string {
  if (Array.isArray(value)) return value.join("\n");
  if (typeof value === "boolean") return value ? "1" : "";
  const v = value ?? "";
  return typeOf(key) === "datetime" ? toLocal(v) : v;
}
function fromForm(key: TextKey): string | string[] | boolean {
  const v = form[key];
  if (typeOf(key) === "list") return v.split("\n");
  if (typeOf(key) === "datetime") return toIso(v);
  if (typeOf(key) === "toggle") return v === "1";
  return v;
}
function defaultOf(key: TextKey): string {
  return toForm(key, defaults.value[key]);
}
// Empty = default, same as the server.
function effective(key: TextKey): string {
  return form[key].trim() || defaultOf(key);
}
function isOverridden(key: TextKey): boolean {
  return form[key].trim() !== "" && form[key].trim() !== defaultOf(key);
}
function resetField(key: TextKey) {
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
const fieldError = (key: TextKey) => (windowErrors.value as Partial<Record<TextKey, string>>)[key];
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
  discordStatus.value = p.discord;
  for (const key of TEXT_KEYS) form[key] = toForm(key, p.settings[key]);
  Object.assign(
    scoring,
    structuredClone(p.settings.scoring ?? p.defaults.scoring ?? DEFAULT_SCORING),
  );
  labelRows.value = Object.entries(scoring.labelBonus.points).map(([label, points]) => ({
    label,
    points,
  }));
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
    const settings = Object.fromEntries(TEXT_KEYS.map((k) => [k, fromForm(k)])) as EventSettings;
    settings.scoring = {
      ...structuredClone(toRaw(scoring)),
      labelBonus: {
        enabled: scoring.labelBonus.enabled,
        points: Object.fromEntries(
          labelRows.value
            .map((r) => [r.label.trim(), Number(r.points)] as const)
            .filter(([label, points]) => label && Number.isFinite(points)),
        ),
      },
    };
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

// Uses the url currently in the form, saved or not, so a wrong url is caught
// before it is stored.
async function sendTest() {
  testing.value = true;
  try {
    await $fetch("/api/admin/announce-test", {
      method: "POST",
      headers: auth.authHeaders(),
      body: { webhookUrl: form.discordWebhookUrl },
    });
    toast.success("Test message sent");
  } catch (e) {
    if (!auth.handle401(e)) toast.error(errMsg(e));
  } finally {
    testing.value = false;
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
        >The event is fired. Content and event settings are read-only until you unfreeze or start a
        new event; integrations stay editable.</span
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

        <label
          v-if="f.type === 'toggle'"
          class="inline-flex cursor-pointer items-center gap-3 font-mono text-sm text-fg"
        >
          <input
            :id="`s-${f.key}`"
            type="checkbox"
            :checked="form[f.key] === '1'"
            :disabled="isLocked(f)"
            class="h-4 w-4 accent-[var(--primary)]"
            @change="form[f.key] = ($event.target as HTMLInputElement).checked ? '1' : ''"
          />
          {{ form[f.key] === "1" ? "on" : "off" }}
        </label>
        <input
          v-else-if="f.type === 'text' || f.type === 'datetime' || f.type === 'secret'"
          :id="`s-${f.key}`"
          v-model="form[f.key]"
          :type="
            f.type === 'datetime' ? 'datetime-local' : f.type === 'secret' ? 'password' : 'text'
          "
          autocomplete="off"
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

      <div v-if="g === 'Event'" class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <span class="font-mono text-sm uppercase tracking-wider text-fg">Point rules</span>
          <span v-if="scoringLocked" class="text-[0.65rem] text-muted">
            <span class="i-ph-lock inline-block align-[-2px]" aria-hidden="true" /> locked in this
            phase
          </span>
        </div>
        <p class="font-mono text-[0.72rem] leading-relaxed text-muted">
          Everything adds up, nothing multiplies: an issue is worth its base points plus every bonus
          that applies to it. All rules off means one point per qualifying closed issue plus manual
          credits, which is how the first event was scored. Rules lock the moment the event starts.
        </p>

        <label class="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <input
            v-model="scoring.issuePoints.enabled"
            type="checkbox"
            :disabled="scoringLocked"
            class="h-4 w-4 accent-[var(--primary)]"
          />
          <span class="font-mono text-sm text-fg">Points per closed issue</span>
          <input
            v-model.number="scoring.issuePoints.points"
            type="number"
            step="0.5"
            :disabled="scoringLocked || !scoring.issuePoints.enabled"
            class="input w-24 disabled:opacity-40"
            aria-label="points per issue"
          />
          <span class="font-mono text-[0.72rem] text-muted">default 1 when off</span>
        </label>

        <label class="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <input
            v-model="scoring.prPoints.enabled"
            type="checkbox"
            :disabled="scoringLocked"
            class="h-4 w-4 accent-[var(--primary)]"
          />
          <span class="font-mono text-sm text-fg">Points per merged PR</span>
          <input
            v-model.number="scoring.prPoints.points"
            type="number"
            step="0.5"
            :disabled="scoringLocked || !scoring.prPoints.enabled"
            class="input w-24 disabled:opacity-40"
            aria-label="points per merged pr"
          />
          <span class="font-mono text-[0.72rem] text-muted">on top of the issues it closed</span>
        </label>

        <label class="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <input
            v-model="scoring.ageBonus.enabled"
            type="checkbox"
            :disabled="scoringLocked"
            class="h-4 w-4 accent-[var(--primary)]"
          />
          <span class="font-mono text-sm text-fg">Age bonus</span>
          <span class="font-mono text-[0.72rem] text-muted">issues older than</span>
          <input
            v-model.number="scoring.ageBonus.afterMonths"
            type="number"
            min="1"
            :disabled="scoringLocked || !scoring.ageBonus.enabled"
            class="input w-20 disabled:opacity-40"
            aria-label="months"
          />
          <span class="font-mono text-[0.72rem] text-muted">months add</span>
          <input
            v-model.number="scoring.ageBonus.points"
            type="number"
            step="0.5"
            :disabled="scoringLocked || !scoring.ageBonus.enabled"
            class="input w-20 disabled:opacity-40"
            aria-label="bonus points"
          />
          <span class="font-mono text-[0.72rem] text-muted">points</span>
        </label>

        <div class="panel flex flex-col gap-3 px-4 py-3">
          <label class="flex flex-wrap items-center gap-3">
            <input
              v-model="scoring.labelBonus.enabled"
              type="checkbox"
              :disabled="scoringLocked"
              class="h-4 w-4 accent-[var(--primary)]"
            />
            <span class="font-mono text-sm text-fg">Label bonus</span>
            <span class="font-mono text-[0.72rem] text-muted">
              extra points per label, several labels add up
            </span>
          </label>
          <div v-for="(row, i) in labelRows" :key="i" class="flex flex-wrap items-center gap-2">
            <input
              v-model="row.label"
              placeholder="label, e.g. p4-important"
              :disabled="scoringLocked || !scoring.labelBonus.enabled"
              class="input min-w-48 flex-1 disabled:opacity-40"
            />
            <span class="font-mono text-[0.72rem] text-muted">adds</span>
            <input
              v-model.number="row.points"
              type="number"
              step="0.5"
              :disabled="scoringLocked || !scoring.labelBonus.enabled"
              class="input w-20 disabled:opacity-40"
              aria-label="bonus points"
            />
            <span class="font-mono text-[0.72rem] text-muted">points</span>
            <button
              class="btn"
              :disabled="scoringLocked || !scoring.labelBonus.enabled"
              aria-label="remove label"
              @click="labelRows.splice(i, 1)"
            >
              <span class="i-ph-x" aria-hidden="true" />
            </button>
          </div>
          <button
            class="btn self-start"
            :disabled="scoringLocked || !scoring.labelBonus.enabled"
            @click="labelRows.push({ label: '', points: 1 })"
          >
            <span class="i-ph-plus" aria-hidden="true" />
            Add label
          </button>
        </div>

        <label class="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <input
            v-model="scoring.upvoteBonus.enabled"
            type="checkbox"
            :disabled="scoringLocked"
            class="h-4 w-4 accent-[var(--primary)]"
          />
          <span class="font-mono text-sm text-fg">Upvote bonus</span>
          <span class="font-mono text-[0.72rem] text-muted">every</span>
          <input
            v-model.number="scoring.upvoteBonus.per"
            type="number"
            min="1"
            :disabled="scoringLocked || !scoring.upvoteBonus.enabled"
            class="input w-20 disabled:opacity-40"
            aria-label="upvotes per step"
          />
          <span class="font-mono text-[0.72rem] text-muted">thumbs-up adds</span>
          <input
            v-model.number="scoring.upvoteBonus.points"
            type="number"
            step="0.5"
            :disabled="scoringLocked || !scoring.upvoteBonus.enabled"
            class="input w-20 disabled:opacity-40"
            aria-label="bonus points"
          />
          <span class="font-mono text-[0.72rem] text-muted">points</span>
        </label>

        <p class="panel px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-mint">
          <span class="text-muted">One issue that hits every active rule: </span>
          {{ scoringExample }}
        </p>
      </div>

      <div v-if="g === 'Integrations'" class="flex flex-wrap items-center gap-3">
        <span class="font-mono text-[0.72rem] uppercase tracking-wider text-muted">
          discord
          <span :class="discordStatus?.configured ? 'text-primary' : 'text-amber'">
            {{ discordStatus?.configured ? "configured" : "not configured" }}
          </span>
          <span v-if="discordStatus?.configured">({{ discordStatus.source }})</span>
        </span>
        <button class="btn" :disabled="testing || !form.discordWebhookUrl.trim()" @click="sendTest">
          <span
            :class="testing ? 'i-ph-spinner animate-spin' : 'i-ph-paper-plane-tilt'"
            aria-hidden="true"
          />
          Send test message
        </button>
      </div>
    </section>

    <button class="btn self-start" :disabled="busy || loading || !formValid" @click="save">
      <span class="i-ph-floppy-disk" aria-hidden="true" />
      Save settings
    </button>
  </div>
</template>
