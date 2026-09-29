import type { ReviewItem } from "#shared/types/review";
import {
  readRegistryQueue,
  readReviewDecisions,
  readReviewQueue,
  registryScanStatus,
} from "../../utils/review";

// The open queue (scope PRs from the last leaderboard recompute plus registry
// PRs from the last registry search, minus what was already decided) and the
// decisions.
export default defineEventHandler(async () => {
  const [queue, registry, decisions] = await Promise.all([
    readReviewQueue(),
    readRegistryQueue(),
    readReviewDecisions(),
  ]);
  const byRef = new Map<string, ReviewItem>();
  for (const item of [...queue.items, ...registry.items]) byRef.set(item.ref, item);
  return {
    updatedAt: queue.updatedAt,
    registry: {
      updatedAt: registry.updatedAt,
      repos: registry.repos,
      searches: registry.searches,
      ...registryScanStatus(),
    },
    open: [...byRef.values()]
      .filter((i) => !decisions[i.ref])
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    decided: Object.values(decisions).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    frozen: Boolean((await readRuntimeState()).final),
  };
});
