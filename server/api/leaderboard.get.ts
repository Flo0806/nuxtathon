import { createHash } from "node:crypto";
import type { H3Event } from "h3";
import type {
  ContributionIds,
  EventConfig,
  EventStats,
  LeaderboardEntry,
} from "#shared/types/event";
import { budgetAllows, budgetNotice } from "../utils/github-budget";
import { announceRankingIfChanged } from "../utils/announce";
import {
  activeReviews,
  readReviewDecisions,
  reviewCredits,
  scanRegistry,
  writeReviewQueue,
} from "../utils/review";

// The scoring-relevant config as a short hash: any change to it busts the cache,
// and the stored last board is only reused for the config it was computed with.
const boardKey = (c: EventConfig): string =>
  createHash("sha256")
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

// The resolved config is parked on the event so the handler fetches with the
// exact config the key was built from.
const configKey = async (event: H3Event): Promise<string> => {
  const c = await resolveEventConfig();
  event.context.eventConfig = c;
  return boardKey(c);
};

const LAST_BOARD_KEY = "board-last";

interface Board {
  entries: LeaderboardEntry[];
  coreTeam: LeaderboardEntry[];
  stats: EventStats;
  contributions: ContributionIds;
  fetchedAt: string;
}

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

    // The last computed board stands in whenever GitHub cannot be asked: the
    // budget is nearly gone (see budgetTier), or the recompute fails. A visible
    // board a few minutes old beats an error page on the event weekend. `held`
    // tells the page it is looking at that stored copy. Only a board computed
    // with this very config qualifies: after a scope or window change the old
    // one would show standings the current rules never produced.
    const key = boardKey(config);
    const stored = await useStorage("state").getItem<{ key: string; board: Board }>(LAST_BOARD_KEY);
    const last = stored?.key === key ? stored.board : null;
    if (last && !budgetAllows("board")) {
      console.warn(`[leaderboard] ${budgetNotice()}, serving the board from ${last.fetchedAt}`);
      return { ...last, held: true };
    }
    let result: Awaited<ReturnType<typeof fetchLeaderboard>>;
    try {
      result = await fetchLeaderboard(config, token);
    } catch (e) {
      if (!last) throw e;
      console.error("[leaderboard] recompute failed, serving the last board:", e);
      return { ...last, held: true };
    }
    const fetchedAt = new Date().toISOString();

    // Manual credits are checked against the issues somebody already scored
    // (so one is never paid twice), then the remaining manual issues are folded
    // into the headline count of everything closed.
    const closed = new Set(result.closedIssues);
    // Confirmed review decisions join as credits; see reviewCredits for why.
    const reviews = activeReviews(await readReviewDecisions(), result.contributions);
    const entries = applyCredits(
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
    // Registry modules on their own hourly clock; never blocks the board, and
    // only while the budget has room for extras (scanRegistry checks).
    scanRegistry(token, config)
      .then(({ done }) => done)
      .catch((e) => console.error("[review] registry scan failed:", e));

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

    const board: Board = { entries, coreTeam: result.coreTeam, stats, contributions, fetchedAt };
    await useStorage("state").setItem(LAST_BOARD_KEY, { key, board });
    return board;
  },
  {
    maxAge: 300,
    swr: false,
    name: "leaderboard",
    getKey: configKey,
  },
);
