import type { ApiArchivedEvent, ApiAward } from "#shared/types/api";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug") ?? "";
  const result = await archivedEvent(slug);
  const config = archivedConfig(result);
  const site = apiSiteUrl();
  const eventUrl = `${site}/archive/${slug}`;

  const awards: ApiAward[] = (result.awards ?? []).map((a) => ({
    ...a,
    certificateUrl: `${site}/archive/${slug}/award/${a.id}.pdf`,
  }));

  const payload: ApiArchivedEvent = {
    meta: apiMeta("results"),
    event: {
      slug,
      title: config.title,
      eyebrow: config.eyebrow,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      finalizedAt: result.finalizedAt,
      url: eventUrl,
      stats: { ...result.stats, contributors: result.standings.filter((e) => e.score > 0).length },
      winner: result.standings[0]
        ? {
            login: result.standings[0].login,
            name: result.standings[0].name,
            avatar: apiAvatar(result.standings[0].avatarUrl),
          }
        : null,
      awardCount: awards.length,
      description: config.description,
      descriptionText: apiPlain(config.description),
      rules: [
        ...(config.showCustomRules === false ? [] : config.rules),
        ...(isDefaultScoring(config.scoring) ? [] : scoringSummary(config.scoring)),
      ],
      qualifyingBefore: config.qualifyingBefore,
      scoring: config.scoring,
    },
    awards,
    contributors: result.standings.map((e) => ({
      ...apiContributor(e, result.contributions?.[e.login]),
      certificateUrl: `${site}/archive/${slug}/certificate/${e.login}.pdf`,
    })),
    coreTeam: (result.coreTeam ?? []).map((e) => apiContributor(e)),
  };
  return sendApi(event, payload);
});
