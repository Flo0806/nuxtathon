import type { ReviewDecision } from "#shared/types/review";
import { parseIssueRef } from "#shared/utils/issue-ref";
import {
  readReviewDecisions,
  readReviewQueue,
  withReviewLock,
  writeReviewDecisions,
} from "../../utils/review";

// Confirm, reject, or undo ("open") one queued PR. Allowed until the event is
// fired; after that the result is frozen and decisions are part of it.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ ref?: string; status?: string; points?: unknown }>(event);
  const ref = parseIssueRef(body?.ref);
  if (!ref) throw createError({ statusCode: 422, statusMessage: "Not a pull request" });
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
    if (status === "open") {
      delete decisions[ref];
    } else {
      // A new decision needs the PR in the current queue; changing an existing
      // one keeps the snapshot it was first decided on.
      const item = decisions[ref] ?? (await readReviewQueue()).items.find((i) => i.ref === ref);
      if (!item) {
        throw createError({ statusCode: 404, statusMessage: "This PR is not in the review queue" });
      }
      const { status: _s, points: _p, decidedAt: _d, ...snapshot } = item as ReviewDecision;
      decisions[ref] = {
        ...snapshot,
        status,
        points: status === "confirmed" ? Math.round(points * 100) / 100 : 0,
        decidedAt: new Date().toISOString(),
      };
    }
    await writeReviewDecisions(decisions);
    // The board shows a decision right away instead of after the cache expires.
    await invalidateLeaderboardCache();
    return { ok: true };
  });
});
