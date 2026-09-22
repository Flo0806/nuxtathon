// Archived events with what the awards editor needs: recipients to pick from
// and the current awards.
export default defineEventHandler(async () => {
  const list = await listArchive();
  const slugs = archiveSlugs(list);
  // Most recently fired first: that is the one being edited right after fire.
  const byFire = [...list].sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt));
  return byFire.map((r) => ({
    slug: slugs.get(r)!,
    title: r.title,
    eyebrow: archivedConfig(r).eyebrow,
    startsAt: r.startsAt,
    finalizedAt: r.finalizedAt,
    awards: r.awards ?? [],
    recipients: r.standings
      .filter((e) => e.score > 0)
      .map((e) => ({ login: e.login, name: e.name, score: e.score, rank: e.rank })),
  }));
});
