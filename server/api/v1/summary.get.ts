import type { ApiSummary } from "#shared/types/api";

// The one-request endpoint: enough to render a teaser elsewhere and link back
// here. Texts and rules live in /api/v1/event.
export default defineEventHandler(async (event) => {
  const { config, phase, board, stats, awards, released } = await currentEvent();
  const site = apiSiteUrl();
  const top = board.entries
    .slice(0, apiLimit(getQuery(event).top, 3, 100))
    .map((e) => apiContributor(e));
  const first = board.entries[0];
  const winnerKey = first?.login.toLowerCase();

  const payload: ApiSummary = {
    meta: apiMeta(phase),
    event: {
      title: config.title,
      eyebrow: config.eyebrow,
      url: site,
      image: `${site}/og.png?v=${ogHash(ogTextFor(config, phase))}`,
      startsAt: config.startsAt,
      endsAt: config.endsAt,
      timeZone: config.displayTimeZone,
    },
    stats,
    top,
    winner:
      released && first
        ? {
            ...apiContributor(first),
            awards: awards.filter((a) => a.login.toLowerCase() === winnerKey),
          }
        : null,
  };
  return sendApi(event, payload);
});
