import type { IssueRef } from "#shared/types/issue-ref";
import type { ReviewDecision } from "#shared/types/review";
import { parseIssueRef } from "#shared/utils/issue-ref";
import {
  readRegistryQueue,
  readReviewDecisions,
  readReviewQueue,
  withReviewLock,
  writeReviewDecisions,
} from "../../utils/review";

// Confirm, reject, or undo ("open") queued PRs. `ref` for one, `refs` for a
// batch ("reject all shown"), so a bulk action is one write and one cache clear
// rather than fifty. Allowed until the event is fired; after that the result is
// frozen and decisions are part of it.
const MAX_BATCH = 500;

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    ref?: string;
    refs?: unknown;
    status?: string;
    points?: unknown;
  }>(event);
  const raw = Array.isArray(body?.refs) ? body.refs : [body?.ref];
  const refs = raw.map((r) => parseIssueRef(r));
  if (!refs.length || refs.length > MAX_BATCH || refs.some((r) => !r)) {
    throw createError({ statusCode: 422, statusMessage: "Not a pull request" });
  }
  const status = body?.status;
  if (status !== "confirmed" && status !== "rejected" && status !== "open") {
    throw createError({ statusCode: 422, statusMessage: "Unknown decision" });
  }
  const points = Number(body?.points);
  if (status === "confirmed" && (!Number.isFinite(points) || points <= 0 || points > 100)) {
    throw createError({ statusCode: 422, statusMessage: "Points must be above 0 and at most 100" });
  }
  if ((await readRuntimeState()).final) {
    throw createError({ statusCode: 409, statusMessage: "The event is frozen" });
  }

  return withReviewLock(async () => {
    const decisions = await readReviewDecisions();
    const queue = new Map(
      [...(await readReviewQueue()).items, ...(await readRegistryQueue()).items].map((i) => [
        i.ref,
        i,
      ]),
    );
    const decidedAt = new Date().toISOString();
    for (const ref of refs as IssueRef[]) {
      if (status === "open") {
        delete decisions[ref];
        continue;
      }
      // A new decision needs the PR in the current queue; changing an existing
      // one keeps the snapshot it was first decided on.
      const item = decisions[ref] ?? queue.get(ref);
      if (!item) {
        throw createError({ statusCode: 404, statusMessage: `${ref} is not in the review queue` });
      }
      const { status: _s, points: _p, decidedAt: _d, ...snapshot } = item as ReviewDecision;
      decisions[ref] = {
        ...snapshot,
        status,
        points: status === "confirmed" ? Math.round(points * 100) / 100 : 0,
        decidedAt,
      };
    }
    await writeReviewDecisions(decisions);
    // The board shows a decision right away instead of after the cache expires.
    await invalidateLeaderboardCache();
    return { ok: true, count: refs.length };
  });
});
