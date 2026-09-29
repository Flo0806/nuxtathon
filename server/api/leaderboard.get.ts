import { createHash } from "node:crypto";
import type { H3Event } from "h3";
import type { EventConfig } from "#shared/types/event";
import { announceRankingIfChanged } from "../utils/announce";
import {
  activeReviews,
  readReviewDecisions,
  reviewCredits,
  writeReviewQueue,
} from "../utils/review";

// Keyed on the scoring-relevant config so any change to it busts the cache. The
// resolved config is parked on the event so the handler fetches with the exact
// config the key was built from.
const configKey = async (event: H3Event): Promise<string> => {
  const c = await resolveEventConfig();
  event.context.eventConfig = c;
  return createHash("sha256")
    .update(
      JSON.stringify([
        c.startsAt,
        c.endsAt,
        c.qualifyingBefore,
        c.coreTeam,
        c.closeMarker,
        c.markerAuthors,
        c.scoring,
        c.scope,
      ]),
    )
    .digest("hex")
    .slice(0, 12);
};

// Cached so N page views cost at most one GitHub fetch per maxAge window. Once
// the event is fired, the frozen standings are served and GitHub is never hit
// again.
//
// No SWR on purpose. A background revalidation that started before an admin
// save finishes after the save cleared the cache and writes its stale result
// back, so the change never shows on the site (seen before #1). Without SWR the
// first visitor after expiry waits for the recompute (~7 s with two orgs in
// scope); concurrent visitors share that one computation.
export default defineCachedEventHandler(
  async (event) => {
    const state = await readRuntimeState();

    if (state.final) {
      return {
        entries: state.final.standings,
        coreTeam: state.final.coreTeam ?? [],
        stats: state.final.stats,
        contributions: state.final.contributions ?? {},
        fetchedAt: state.final.finalizedAt,
      };
    }

    const token = useRuntimeConfig().githubToken;
    if (!token) {
      throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
    }

    const config = (event.context.eventConfig as EventConfig) ?? (await resolveEventConfig());
    const result = await fetchLeaderboard(config, token);
    const fetchedAt = new Date().toISOString();

    // PR + marker closed issues. Passed to applyCredits first (so a manual credit
    // for an already-covered issue is dropped, not double-scored), then the
    // remaining manual issues are folded in for the headline count.
    const closed = new Set(result.closedIssues);
    // Confirmed review decisions join as credits; see reviewCredits for why.
    const reviews = activeReviews(await readReviewDecisions(), result.contributions);
    const entries = applyCredits(
      result.entries,
      [...state.credits, ...reviewCredits(reviews)],
      closed,
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
      const existing = entries.find((e) => e.login.toLowerCase() === key);
      const login = existing?.login ?? c.login;
      const bucket = (contributions[login] ??= { issues: [], prs: [] });
      if (!bucket.issues.includes(c.issue)) bucket.issues.push(c.issue);
    }

    const stats = {
      ...result.stats,
      issuesClosed: closed.size,
      upvotes: await totalUpvotes(token, closed, result.issueFacts),
    };

    // Same computation, so the queue always matches what the board scored.
    await writeReviewQueue(result.review, fetchedAt);

    await appendSnapshot(
      entries.map((entry) => entry.login),
      fetchedAt,
    );

    // Not awaited: Discord latency must not delay the board, and a failed post
    // is retried on the next recompute.
    announceRankingIfChanged(
      config,
      resolvePhase(config, state.prizesReleased),
      entries,
      stats,
    ).catch((e) => console.error("[announce] ranking post failed:", e));

    return { entries, coreTeam: result.coreTeam, stats, contributions, fetchedAt };
  },
  {
    maxAge: 300,
    swr: false,
    name: "leaderboard",
    getKey: configKey,
  },
);
