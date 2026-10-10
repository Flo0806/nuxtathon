import type { IssueRef } from "#shared/types/issue-ref";
import type { SubmittedItem } from "#shared/types/review";
import { parseIssueRef } from "#shared/utils/issue-ref";
import {
  readReviewDecisions,
  readSubmitted,
  withReviewLock,
  writeReviewDecisions,
} from "../../utils/review";

// Credit an open PR ("confirmed"), veto a merged one that scores ("rejected"),
// or undo either ("open"). `ref` for one, `refs` for a batch, so a bulk action
// is one write and one cache clear rather than fifty. Allowed until the event
// is fired; after that the result is frozen and decisions are part of it.
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
    const list = new Map((await readSubmitted()).items.map((i) => [i.ref, i]));
    const decidedAt = new Date().toISOString();
    for (const ref of refs as IssueRef[]) {
      if (status === "open") {
        delete decisions[ref];
        continue;
      }
      const item = list.get(ref);
      if (!item) {
        throw createError({
          statusCode: 404,
          statusMessage: `${ref} is not in the submitted list`,
        });
      }
      // Points only for work that cannot score on its own yet, a veto only for
      // work that does; anything else would be a decision without effect.
      if (status === "confirmed" && item.state !== "open") {
        throw createError({ statusCode: 422, statusMessage: `${ref} is not open` });
      }
      if (status === "rejected" && !(item.state === "merged" && item.path === "auto")) {
        throw createError({ statusCode: 422, statusMessage: `${ref} does not score` });
      }
      const { state: _s, path: _p, registry: _r, ...snapshot }: SubmittedItem = item;
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
