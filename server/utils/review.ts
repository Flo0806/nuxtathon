import type { ReviewItem, ReviewQueue } from "#shared/types/review";

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
