import type { EventConfig, EventSettings } from "#shared/types/event";
import { SETTINGS_KEYS } from "#shared/types/event";

// Own storage key, separate from RuntimeState, so fire/reset/unfreeze can never
// touch content settings and a settings save can never race an event write.
const SETTINGS_KEY = "settings";

export async function readSettings(): Promise<EventSettings> {
  const stored = await useStorage("state").getItem<EventSettings>(SETTINGS_KEY);
  return pickSettings(stored ?? {});
}

export async function writeSettings(next: EventSettings): Promise<void> {
  await useStorage("state").setItem(SETTINGS_KEY, pickSettings(next));
}

// Committed defaults with the stored overrides on top. Everything that renders
// or archives config should go through this, not eventConfig directly.
export async function resolveEventConfig(): Promise<EventConfig> {
  return { ...eventConfig, ...(await readSettings()) };
}

// Keep only known keys that actually differ from the default. Empty string /
// empty array means "back to default", and a value identical to the default is
// dropped too, so the stored file only ever holds real overrides.
function pickSettings(input: EventSettings): EventSettings {
  const out: EventSettings = {};
  for (const key of SETTINGS_KEYS) {
    const value = input[key];
    if (key === "rules") {
      const rules = Array.isArray(value) ? value.map((r) => String(r).trim()).filter(Boolean) : [];
      if (rules.length && rules.join("\n") !== eventConfig.rules.join("\n")) out.rules = rules;
    } else if (typeof value === "string" && value.trim() && value.trim() !== eventConfig[key]) {
      out[key] = value.trim();
    }
  }
  return out;
}
