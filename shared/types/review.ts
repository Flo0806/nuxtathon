import type { IssueRef } from "./issue-ref";

// A merged PR in scope that does not score on its own (it closes no qualifying
// issue, or its authors maintain that repository). An organizer decides.
export interface ReviewItem {
  ref: IssueRef;
  title: string;
  // GitHub login of whoever opened it; `people` is who would get the points.
  author: string;
  people: string[];
  reason: string;
  // Maintainers of this repository who worked on it (hint for the reviewer).
  maintainers: string[];
  labels: string[];
  createdAt: string;
  mergedAt: string;
  // Points prefilled in the review form: PR points (or 1), doubled for a v5
  // migration. Only a suggestion; the organizer sets the final number.
  suggested: number;
}

export interface ReviewQueue {
  // Last recompute that wrote the queue.
  updatedAt: string;
  items: ReviewItem[];
}

// PR label that marks a module's migration to Nuxt v5 (announcement #36438).
export const V5_LABEL = "nuxtathon-v5";

// An organizer's call on a queued PR. The item is copied in as it was decided,
// so a later change on GitHub cannot move points that were already granted.
export interface ReviewDecision extends ReviewItem {
  status: "confirmed" | "rejected";
  // Granted to every login in `people` when confirmed; 0 when rejected.
  points: number;
  decidedAt: string;
}

export type ReviewDecisions = Record<string, ReviewDecision>;
