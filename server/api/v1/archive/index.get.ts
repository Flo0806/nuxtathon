import type { ApiArchive, ApiArchiveEntry } from "#shared/types/api";

export default defineEventHandler(async (event) => {
  const list = await listArchive();
  const slugs = archiveSlugs(list);
  const site = apiSiteUrl();

  const events: ApiArchiveEntry[] = list.map((r) => {
    const config = archivedConfig(r);
    const winner = r.standings[0];
    const slug = slugs.get(r)!;
    return {
      slug,
      title: config.title,
      eyebrow: config.eyebrow,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      finalizedAt: r.finalizedAt,
      url: `${site}/archive/${slug}`,
      stats: { ...r.stats, contributors: r.standings.filter((e) => e.score > 0).length },
      winner: winner
        ? { login: winner.login, name: winner.name, avatar: apiAvatar(winner.avatarUrl) }
        : null,
      awardCount: (r.awards ?? []).length,
    };
  });

  return sendApi(event, { meta: apiMeta(await currentPhase()), events } satisfies ApiArchive);
});
