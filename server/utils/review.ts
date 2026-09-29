import type { ContributionIds, EventConfig, ManualCredit } from "#shared/types/event";
import type { IssueRef } from "#shared/types/issue-ref";
import { fetchRegistryReview } from "./github";
import { budgetAllows, budgetNotice } from "./github-budget";
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

// Registry modules are searched on their own clock (see fetchRegistryReview) and
// stored apart from the scope queue, which every leaderboard recompute rewrites.
const REGISTRY_KEY = "review-queue-registry";
const REGISTRY_EVERY_MS = 60 * 60 * 1000;
// "Search now" in the admin: generous for a person, cheap for the budget.
const REGISTRY_MANUAL_MS = 10 * 60 * 1000;

export interface RegistryQueue extends ReviewQueue {
  repos: number;
  searches: number;
}

export async function readRegistryQueue(): Promise<RegistryQueue> {
  return (
    (await useStorage("state").getItem<RegistryQueue>(REGISTRY_KEY)) ?? {
      updatedAt: "",
      items: [],
      repos: 0,
      searches: 0,
    }
  );
}

export async function clearRegistryQueue(): Promise<void> {
  await useStorage("state").removeItem(REGISTRY_KEY);
}

let scanning: Promise<RegistryQueue> | null = null;
// Every attempt counts toward the interval, failed ones too: when GitHub refuses
// (budget used up), retrying on the next five-minute recompute would only keep
// the account blocked. Kept in memory; a restart simply allows one try.
let lastAttemptAt = 0;
let lastError = "";
// Set while scans wait for budget; cleared by the next scan that runs.
let pausedReason = "";

export const registryScanStatus = () => ({
  running: scanning !== null,
  lastAttemptAt: lastAttemptAt ? new Date(lastAttemptAt).toISOString() : "",
  lastError,
  pausedReason,
});

// Starts the registry search when it is due: registry in scope, the event has
// started, and the last attempt is older than the interval (or than the manual
// cooldown when an admin asks). One run at a time; a second caller joins it.
// `started` tells the caller whether a run is under way, which it cannot learn
// from the promise alone because the due check itself reads storage.
export async function scanRegistry(
  token: string,
  config: EventConfig,
  manual = false,
): Promise<{ started: boolean; done: Promise<RegistryQueue> }> {
  if (scanning) return { started: true, done: scanning };
  const current = await readRegistryQueue();
  const now = Date.now();
  const last = Math.max(lastAttemptAt, current.updatedAt ? Date.parse(current.updatedAt) : 0);
  const due =
    config.scope.registry &&
    now >= Date.parse(config.startsAt) &&
    now - last >= (manual ? REGISTRY_MANUAL_MS : REGISTRY_EVERY_MS);
  if (!due) return { started: false, done: Promise.resolve(current) };
  // Extras wait while the budget is low; the next recompute asks again.
  if (!budgetAllows("extras")) {
    pausedReason = budgetNotice();
    return { started: false, done: Promise.resolve(current) };
  }
  pausedReason = "";

  lastAttemptAt = now;
  scanning ??= (async () => {
    try {
      const updatedAt = new Date().toISOString();
      const result = await fetchRegistryReview(
        token,
        config,
        config.startsAt,
        new Date(Math.min(now, Date.parse(config.endsAt))).toISOString(),
      );
      const next: RegistryQueue = { updatedAt, ...result };
      await useStorage("state").setItem(REGISTRY_KEY, next);
      lastError = "";
      return next;
    } catch (e) {
      lastError = (e as { statusMessage?: string; message?: string }).statusMessage ?? String(e);
      throw e;
    } finally {
      scanning = null;
    }
  })();
  return { started: true, done: scanning };
}
