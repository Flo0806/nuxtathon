import type { ApiEvent } from "#shared/types/api";

// The full current event: texts, rules and the point rules in structured form.
export default defineEventHandler(async (event) => {
  const { config, phase, stats } = await currentEvent();
  const site = apiSiteUrl();

  const payload: ApiEvent = {
    meta: apiMeta(phase),
    event: {
      title: config.title,
      eyebrow: config.eyebrow,
      url: site,
      image: `${site}/og.png?v=${ogHash(ogTextFor(config, phase))}`,
      startsAt: config.startsAt,
      endsAt: config.endsAt,
      timeZone: config.displayTimeZone,
      description: config.description,
      descriptionText: apiPlain(config.description),
      rules: [
        ...(config.showCustomRules === false ? [] : config.rules),
        ...(isDefaultScoring(config.scoring) ? [] : scoringSummary(config.scoring)),
      ],
      qualifyingBefore: config.qualifyingBefore,
      coreTeam: config.coreTeam,
      scoring: config.scoring,
    },
    stats,
  };
  return sendApi(event, payload);
});
