import type { IssueRef } from "./issue-ref";

// One open, still qualifying issue as the list shows it. Everything comes from a
// single GitHub search, so the list costs a handful of requests no matter how
// many people are looking at it.
export interface BoardIssue {
  ref: IssueRef;
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  upvotes: number;
  labels: string[];
  assignee: string | null;
  // A pull request references this issue, so someone is likely on it already.
  hasPr: boolean;
  // Only set on `watchedExtra` entries, where it is the reason they left the
  // open list.
  closed?: boolean;
}

export interface IssueBoard {
  fetchedAt: string;
  // The repo `issues` comes from, and every repo the list can switch to.
  repo: string;
  repos: string[];
  // Qualifying cutoff as a calendar day (exclusive), for the page to say so.
  createdBefore: string;
  // Exactly what the open search returned. The left column shows this and
  // nothing else.
  issues: BoardIssue[];
  // Watched issues the open search no longer returns, fetched one by one so the
  // watch column can still show their outcome. Kept apart rather than mixed in,
  // so membership is never inferred from a flag.
  watchedExtra: BoardIssue[];
  // Issues this user is watching, newest first.
  watching: IssueRef[];
  // Issue -> when this user last acknowledged it. Anything GitHub touched after
  // that counts as new, which is why it is kept per issue and not once.
  seen: Record<IssueRef, string>;
}
