import type { IssueRef } from "./issue-ref";

// A PR an organizer can decide on. Since #2 every merged PR scores on its own,
// so a decision is either a veto on a merged one or points for an open one.
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
  // Prefill when crediting an open PR; the organizer sets the final number.
  suggested: number;
}

export interface SubmittedItem extends ReviewItem {
  state: "open" | "merged" | "closed";
  path: "auto" | "ignored" | null;
  registry: boolean;
}

export interface SubmittedList {
  updatedAt: string;
  items: SubmittedItem[];
}

// PR label that marks a module's migration to Nuxt v5 (announcement #36438).
export const V5_LABEL = "nuxtathon-v5";

// An organizer's call on a submitted PR. The item is copied in as it was
// decided, so a later change on GitHub cannot move points already granted.
//   confirmed: points for an open PR; dropped once the PR scores on its own
//   rejected:  veto on a merged PR, which then scores nothing
export interface ReviewDecision extends ReviewItem {
  status: "confirmed" | "rejected";
  // Granted to every login in `people` when confirmed; 0 when rejected.
  points: number;
  decidedAt: string;
}

export type ReviewDecisions = Record<string, ReviewDecision>;
