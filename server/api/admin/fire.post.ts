import { randomUUID } from "node:crypto";
import type { Award, FinalResult } from "#shared/types/event";
import { isDefaultScoring, scoreUnit } from "#shared/utils/scoring";
import { announceFinal } from "~~/server/utils/announce";
import { activeReviews, readReviewDecisions, reviewCredits } from "~~/server/utils/review";

// Freeze the ranking, release prizes, and archive the result in one shot.
export default defineEventHandler(async () => {
  const token = useRuntimeConfig().githubToken;
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
  }

  const state = await readRuntimeState();
  const config = await resolveEventConfig();
  const result = await fetchLeaderboard(config, token);

  // Same order as the live endpoint: dedup manual credits against the issues
  // somebody already scored, then fold the remaining manual issues into the
  // frozen count so it matches what was on screen.
  const closed = new Set(result.closedIssues);
  // Confirmed review decisions join as credits; see reviewCredits for why.
  const reviews = activeReviews(await readReviewDecisions(), result.contributions);
  const standings = applyCredits(
    result.entries,
    [...state.credits, ...reviewCredits(reviews)],
    new Set(result.creditedIssues),
    {
      rules: config.scoring,
      facts: result.issueFacts,
      contributions: result.contributions,
    },
  );
  const contributions = { ...result.contributions };

  for (const c of state.credits) {
    if (!c.issue) continue;
    closed.add(c.issue);
    const key = c.login.toLowerCase();
    const existing = standings.find((e) => e.login.toLowerCase() === key);
    const login = existing?.login ?? c.login;
    const bucket = (contributions[login] ??= { issues: [], prs: [] });
    if (!bucket.issues.includes(c.issue)) bucket.issues.push(c.issue);
  }

  // Re-firing the same event (unfreeze, wait for late merges, fire again) must
  // not throw away the prizes the organizer already handed out.
  const previous = state.archive.find(
    (a) => a.title === config.title && a.startsAt === config.startsAt,
  );
  // Seed the obvious prize so the awards tab does not start empty; the organizer
  // renames or removes it. Only a scoring entry can hold an award, otherwise the
  // awards editor and the certificate routes would reject it.
  const first = standings.find((e) => e.score > 0);
  const awards: Award[] = previous?.awards?.length
    ? previous.awards
    : first
      ? [
          {
            id: randomUUID(),
            login: first.login,
            title: "Most issues closed",
            text: `for ${isDefaultScoring(config.scoring) ? `closing ${scoreUnit(config.scoring, first.score)}` : `scoring ${scoreUnit(config.scoring, first.score)}`} during the event`,
            icon: "trophy",
          },
        ]
      : [];

  const final: FinalResult = {
    finalizedAt: new Date().toISOString(),
    title: config.title,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
    config: archivableConfig(config),
    awards,
    stats: {
      ...result.stats,
      issuesClosed: closed.size,
      upvotes: await totalUpvotes(token, closed, result.issueFacts),
    },
    standings,
    coreTeam: result.coreTeam,
    contributions,
    reviews,
  };

  // Upsert by (title, startsAt) so re-firing the same event does not duplicate.
  const archive = state.archive.filter(
    (a) => !(a.title === final.title && a.startsAt === final.startsAt),
  );
  archive.push(final);

  await writeRuntimeState({ ...state, final, prizesReleased: true, archive });
  await invalidateLeaderboardCache();
  announceFinal(config, standings, final.stats).catch((e) =>
    console.error("[announce] final post failed:", e),
  );

  return { finalizedAt: final.finalizedAt, winner: final.standings[0]?.login ?? null };
});
