import type { ApiUser, ApiUsers } from "#shared/types/api";

// A contributor's record across every finished event. `?logins=a,b,c` on the
// same route returns several at once, so a profile page needs one request.
export default defineEventHandler(async (event) => {
  const primary = (getRouterParam(event, "login") ?? "").trim();
  const extra = String(getQuery(event).logins ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  const wanted = [...new Set([primary, ...extra].filter(Boolean).map((l) => l.toLowerCase()))];
  if (wanted.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No login given" });
  }

  const list = await listArchive();
  const slugs = archiveSlugs(list);
  const site = apiSiteUrl();
  const users: ApiUser[] = [];

  for (const key of wanted) {
    const profile: ApiUser = {
      login: key,
      name: null,
      avatar: apiAvatar(`https://github.com/${key}.png`),
      totals: { score: 0, closedIssues: 0, mergedPRs: 0, events: 0, awards: 0 },
      events: [],
    };

    for (const result of list) {
      const entry = result.standings.find((e) => e.login.toLowerCase() === key);
      if (!entry) continue;
      const slug = slugs.get(result)!;
      const config = archivedConfig(result);
      const awards = (result.awards ?? [])
        .filter((a) => a.login.toLowerCase() === key)
        .map((a) => ({ ...a, certificateUrl: `${site}/archive/${slug}/award/${a.id}.pdf` }));

      // The list is newest first, so the first hit carries the current identity;
      // later (older) events must not overwrite it.
      if (profile.events.length === 0) {
        profile.login = entry.login;
        profile.avatar = apiAvatar(entry.avatarUrl);
      }
      profile.name ??= entry.name;

      profile.events.push({
        slug,
        title: config.title,
        eyebrow: config.eyebrow,
        startsAt: result.startsAt,
        url: `${site}/archive/${slug}`,
        rank: entry.rank,
        score: entry.score,
        closedIssues: entry.closedIssues,
        mergedPRs: entry.mergedPRs,
        issues: result.contributions?.[entry.login]?.issues ?? [],
        prs: result.contributions?.[entry.login]?.prs ?? [],
        awards,
        certificateUrl: `${site}/archive/${slug}/certificate/${entry.login}.pdf`,
      });

      profile.totals.score += entry.score;
      profile.totals.closedIssues += entry.closedIssues;
      profile.totals.mergedPRs += entry.mergedPRs;
      profile.totals.events += 1;
      profile.totals.awards += awards.length;
    }

    if (profile.totals.events > 0) users.push(profile);
  }

  if (users.length === 0) {
    throw createError({ statusCode: 404, statusMessage: "No finished event has this contributor" });
  }

  return sendApi(event, { meta: apiMeta(await currentPhase()), users } satisfies ApiUsers);
});
