import { readReviewDecisions, readReviewQueue } from "../../utils/review";

// The open queue (as the last leaderboard recompute left it, minus what was
// already decided) and the decisions.
export default defineEventHandler(async () => {
  const [queue, decisions] = await Promise.all([readReviewQueue(), readReviewDecisions()]);
  return {
    updatedAt: queue.updatedAt,
    open: queue.items.filter((i) => !decisions[i.ref]),
    decided: Object.values(decisions).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    frozen: Boolean((await readRuntimeState()).final),
  };
});
