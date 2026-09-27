// One open, still qualifying issue as the list shows it. Everything comes from a
// single GitHub search, so the list costs a handful of requests no matter how
// many people are looking at it.
export interface BoardIssue {
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
  // Only ever true in the watch column: the open list is filtered to open issues,
  // but a watched one that got closed is still worth showing once.
  closed?: boolean;
}

export interface IssueBoard {
  fetchedAt: string;
  issues: BoardIssue[];
  // Issue numbers this user is watching, newest first.
  watching: number[];
  // Issue number -> when this user last acknowledged it. Anything GitHub touched
  // after that counts as new, which is why it is kept per issue and not once.
  seen: Record<string, string>;
}
