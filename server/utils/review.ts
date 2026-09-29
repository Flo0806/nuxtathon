import type { ContributionIds, ManualCredit } from "#shared/types/event";
import type { IssueRef } from "#shared/types/issue-ref";
import type {
  ReviewDecision,
  ReviewDecisions,
  ReviewItem,
  ReviewQueue,
} from "#shared/types/review";

// The queue is rewritten from scratch by every leaderboard recompute, so it
// always matches the board: a PR that later gets linked to a qualifying issue
// drops out on its own. Decisions are stored apart (they must survive rewrites).
const QUEUE_KEY = "review-queue";

export async function readReviewQueue(): Promise<ReviewQueue> {
  return (
    (await useStorage("state").getItem<ReviewQueue>(QUEUE_KEY)) ?? { updatedAt: "", items: [] }
  );
}

export async function writeReviewQueue(items: ReviewItem[], updatedAt: string): Promise<void> {
  await useStorage("state").setItem(QUEUE_KEY, { updatedAt, items });
}

export async function clearReviewQueue(): Promise<void> {
  await useStorage("state").removeItem(QUEUE_KEY);
}

const DECISIONS_KEY = "review-decisions";

export async function readReviewDecisions(): Promise<ReviewDecisions> {
  return (await useStorage("state").getItem<ReviewDecisions>(DECISIONS_KEY)) ?? {};
}

export async function writeReviewDecisions(next: ReviewDecisions): Promise<void> {
  await useStorage("state").setItem(DECISIONS_KEY, next);
}

export async function clearReviewDecisions(): Promise<void> {
  await useStorage("state").removeItem(DECISIONS_KEY);
}

// Two clicks racing (confirm, then undo) must not lose one of them.
let chain: Promise<unknown> = Promise.resolve();
export function withReviewLock<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

// Confirmed decisions that still apply. A PR that meanwhile scores on its own
// (someone linked a qualifying issue to it) is left out, so it never counts twice.
export function activeReviews(
  decisions: ReviewDecisions,
  contributions: ContributionIds,
): ReviewDecision[] {
  const auto = new Set<IssueRef>(Object.values(contributions).flatMap((c) => c.prs));
  return Object.values(decisions).filter((d) => d.status === "confirmed" && !auto.has(d.ref));
}

// As manual credits: organizer-granted points, one per person, never weighted by
// the point rules and not counted as merged PRs (the organizer's number already
// includes whatever a PR is worth; adding PR points on top would count it twice).
export const reviewCredits = (reviews: ReviewDecision[]): ManualCredit[] =>
  reviews.flatMap((d) =>
    d.people.map((login) => ({ login, amount: d.points, note: `reviewed ${d.ref}` })),
  );
