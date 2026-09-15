import type { EventConfig, FinalResult, RuntimeState } from "#shared/types/event";

// One-off, additive migrations of the persisted runtime state. Each step only
// fills in missing fields and never renames or removes anything, so running it
// against an already-migrated file is a no-op. A backup of the untouched file is
// written before the first change.
export default defineNitroPlugin(async () => {
  const storage = useStorage("state");
  const raw = await storage.getItem<RuntimeState>("runtime");
  if (!raw) return;

  // null = nothing to backfill, otherwise the state to persist.
  const next = backfillFinalConfig(raw, eventConfig);
  if (!next) return;

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  await storage.setItem(`runtime-backup-${stamp}`, raw);
  await storage.setItem("runtime", next);
  console.info(`[migrate] backfilled FinalResult.config, backup: runtime-backup-${stamp}`);
});

// Results fired before FinalResult.config existed get the committed config. This
// is only correct as long as config/event.json still describes that event, which
// is why this migration has to be deployed before the config becomes editable.
// Returns null when every result already carries a config.
function backfillFinalConfig(state: RuntimeState, config: EventConfig): RuntimeState | null {
  const missing = (r: FinalResult | null | undefined) => Boolean(r && !r.config);
  if (!missing(state.final) && !(state.archive ?? []).some(missing)) return null;

  // Keep what the result already knows about itself; the committed config only
  // supplies the fields the old shape never stored.
  const fill = (r: FinalResult): FinalResult =>
    r.config
      ? r
      : { ...r, config: { ...config, title: r.title, startsAt: r.startsAt, endsAt: r.endsAt } };
  return {
    ...state,
    final: state.final ? fill(state.final) : state.final,
    archive: (state.archive ?? []).map(fill),
  };
}
