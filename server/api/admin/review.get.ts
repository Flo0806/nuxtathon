import {
  readRegistryScan,
  readReviewDecisions,
  readSubmitted,
  registryScanStatus,
} from "../../utils/review";

// A decision whose PR left the list (the window changed) is still returned, so
// it can be undone.
export default defineEventHandler(async () => {
  const [submitted, registry, decisions] = await Promise.all([
    readSubmitted(),
    readRegistryScan(),
    readReviewDecisions(),
  ]);
  return {
    updatedAt: submitted.updatedAt,
    registry: {
      updatedAt: registry.updatedAt,
      repos: registry.repos,
      searches: registry.searches,
      ...registryScanStatus(),
    },
    items: submitted.items,
    decisions,
    frozen: Boolean((await readRuntimeState()).final),
  };
});
