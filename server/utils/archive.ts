import type { ArchiveSummary, EventConfig, FinalResult } from "#shared/types/event";
import { DEFAULT_SCORING } from "#shared/types/scoring";

// Slugs for a whole list: the start date, with "-2", "-3" appended when two
// events share a day (test runs, mostly). Numbered in firing order so a later
// same-day event never steals an existing url.
export function archiveSlugs(list: FinalResult[]): Map<FinalResult, string> {
  const seen = new Map<string, number>();
  const out = new Map<FinalResult, string>();
  const chronological = [...list].sort((a, b) => a.finalizedAt.localeCompare(b.finalizedAt));
  for (const r of chronological) {
    const day = r.startsAt.slice(0, 10);
    const n = (seen.get(day) ?? 0) + 1;
    seen.set(day, n);
    out.set(r, n === 1 ? day : `${day}-${n}`);
  }
  return out;
}

// Results archived before FinalResult.config existed are backfilled on boot,
// but a defensive merge keeps this robust for a copied-in old file too. The
// result is public, so credentials are blanked whatever the stored config holds.
export const archivedConfig = (r: FinalResult): EventConfig => ({
  ...eventConfig,
  ...r.config,
  title: r.title,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  discordWebhookUrl: "",
  discordAnnounce: false,
  // Results fired before these fields existed carry neither, and an older result
  // may carry an older scoring shape, so it is normalized rather than trusted.
  scoring: normalizeScoringRules(r.config?.scoring, eventConfig.scoring ?? DEFAULT_SCORING),
  showCustomRules: r.config?.showCustomRules ?? eventConfig.showCustomRules ?? true,
});

export function summarize(r: FinalResult, slug: string): ArchiveSummary {
  const config = archivedConfig(r);
  const winner = r.standings[0];
  return {
    slug,
    title: config.title,
    eyebrow: config.eyebrow,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    finalizedAt: r.finalizedAt,
    winner: winner ? { login: winner.login, name: winner.name, avatarUrl: winner.avatarUrl } : null,
    stats: r.stats,
    contributors: r.standings.filter((e) => e.score > 0).length,
    awardCount: (r.awards ?? []).length,
  };
}

// Newest first. `final` is always upserted into the archive on fire, so the
// archive alone is the complete list.
export async function listArchive(): Promise<FinalResult[]> {
  const state = await readRuntimeState();
  return [...state.archive].sort(
    (a, b) => b.startsAt.localeCompare(a.startsAt) || b.finalizedAt.localeCompare(a.finalizedAt),
  );
}
