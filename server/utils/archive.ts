import type { EventConfig, FinalResult } from "#shared/types/event";

// Public shape of an archived event. The slug is the start date; fire upserts
// by (title, startsAt), so two archived events never share one.
export interface ArchiveSummary {
  slug: string;
  title: string;
  eyebrow: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string;
  winner: { login: string; name: string | null; avatarUrl: string } | null;
  stats: FinalResult["stats"];
  contributors: number;
}

// Slugs for a whole list: the start date, with "-2", "-3" appended when two
// events share a day (test runs, mostly). Computed over the sorted list so the
// index and the detail lookup agree.
export function archiveSlugs(list: FinalResult[]): Map<FinalResult, string> {
  const seen = new Map<string, number>();
  const out = new Map<FinalResult, string>();
  for (const r of list) {
    const day = r.startsAt.slice(0, 10);
    const n = (seen.get(day) ?? 0) + 1;
    seen.set(day, n);
    out.set(r, n === 1 ? day : `${day}-${n}`);
  }
  return out;
}

// Results archived before FinalResult.config existed are backfilled on boot,
// but a defensive merge keeps this robust for a copied-in old file too.
export const archivedConfig = (r: FinalResult): EventConfig => ({
  ...eventConfig,
  ...r.config,
  title: r.title,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
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
