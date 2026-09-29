import type { IssueRef } from "#shared/types/issue-ref";
import type { BoardIssue } from "#shared/types/issues";
import { HOME_REPO, issueRef, normalizeIssueRefs, parseIssueRef } from "#shared/utils/issue-ref";
import { issueSearchQuery } from "#shared/utils/issue-search";
import { batchedIssueQuery, githubQuery, type RepoAliases } from "./github";

export const PER_PAGE = 100;
// 500 issues of headroom over the ~280 that qualify in nuxt/nuxt today; GitHub's
// search stops at 1000 regardless.
export const MAX_PAGES = 5;
// A watch list is a working aid, not an archive. The cap also keeps the batched
// alias query for closed entries to a sane size.
export const MAX_WATCHED = 100;

export interface RestIssue {
  number: number;
  // "https://api.github.com/repos/<owner>/<repo>"; the delta search spans repos.
  repository_url: string;
  state: "open" | "closed";
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  user: { login: string } | null;
  assignee: { login: string } | null;
  labels: { name: string }[];
  reactions?: { "+1"?: number };
}

export async function restSearchPage(token: string, q: string, page: number) {
  try {
    return await $fetch<{ total_count: number; items: RestIssue[] }>(
      "https://api.github.com/search/issues",
      {
        query: { q, per_page: PER_PAGE, page, sort: "created", order: "asc" },
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "nuxtathon-leaderboard",
        },
      },
    );
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    throw createError({ statusCode: 502, statusMessage: `GitHub responded ${status ?? "error"}` });
  }
}

export async function restSearchAll(token: string, q: string): Promise<RestIssue[]> {
  const out: RestIssue[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items } = await restSearchPage(token, q, page);
    out.push(...items);
    if (items.length < PER_PAGE) break;
  }
  return out;
}

export const restRef = (i: RestIssue): IssueRef | null =>
  issueRef(i.repository_url.replace(/^https:\/\/api\.github\.com\/repos\//, ""), i.number);

export function toBoardIssue(i: RestIssue, ref: IssueRef, hasPr: boolean): BoardIssue {
  return {
    ref,
    number: i.number,
    title: i.title,
    url: i.html_url,
    author: i.user?.login ?? "ghost",
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    comments: i.comments,
    upvotes: i.reactions?.["+1"] ?? 0,
    labels: i.labels.map((l) => l.name),
    assignee: i.assignee?.login ?? null,
    hasPr,
  };
}

// The whole eligible backlog of one repo, oldest first. A second search marks the
// ones a PR already references; that set is small, so it is cheaper than asking
// per issue.
export async function fetchRepoBacklog(token: string, query: string): Promise<BoardIssue[]> {
  const [all, linked] = await Promise.all([
    restSearchAll(token, query),
    restSearchAll(token, `${query} linked:pr`),
  ]);
  const withPr = new Set(linked.map(restRef));
  return all.flatMap((i) => {
    const ref = restRef(i);
    return ref ? [toBoardIssue(i, ref, withPr.has(ref))] : [];
  });
}

// Watched issues that left the open list: closed, or no longer qualifying. One
// batched query with an alias per number, so a handful costs a single request.
// Without this a watched issue would simply vanish the moment someone solved it,
// which is the one outcome the watcher actually waits for.
// Cached like the board: this is the only lookup whose cost follows the users
// rather than the repo, so repeated polls must not each pay for it.
export const fetchClosedWatched = defineCachedFunction(
  (token: string, refs: IssueRef[]) => closedWatched(token, refs),
  {
    maxAge: 300,
    name: "closed-watched",
    getKey: (_token: string, refs: IssueRef[]) => [...refs].sort().join(","),
  },
);

async function closedWatched(token: string, refs: IssueRef[]): Promise<BoardIssue[]> {
  const unique = [...new Set(refs)].slice(0, MAX_WATCHED);
  if (unique.length === 0) return [];

  interface Node {
    number: number;
    title: string;
    url: string;
    createdAt: string;
    updatedAt: string;
    state: string;
    author: { login: string } | null;
    comments: { totalCount: number };
    reactions: { totalCount: number };
    labels: { nodes: { name: string }[] };
    assignees: { nodes: { login: string }[] };
  }

  const { query, paths } = batchedIssueQuery(
    unique,
    `number title url createdAt updatedAt state
    author { login }
    comments { totalCount }
    reactions(content: THUMBS_UP) { totalCount }
    labels(first: 20) { nodes { name } }
    assignees(first: 1) { nodes { login } }`,
  );
  const data = await githubQuery<RepoAliases<Node>>(token, query);

  const out: BoardIssue[] = [];
  for (const p of paths) {
    const node = data[p.repo]?.[p.issue];
    if (!node) continue;
    out.push({
      ref: p.ref,
      number: node.number,
      title: node.title,
      url: node.url,
      author: node.author?.login ?? "ghost",
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      comments: node.comments.totalCount,
      upvotes: node.reactions.totalCount,
      labels: node.labels.nodes.map((l) => l.name),
      assignee: node.assignees.nodes[0]?.login ?? null,
      hasPr: false,
      closed: node.state === "CLOSED",
    });
  }
  return out;
}

export const boardQuery = (config: Parameters<typeof issueSearchQuery>[0], repo?: string) =>
  issueSearchQuery(config, repo);

// Repos the list can switch between: every public nuxt/* repo that takes issues
// and has anything open.
// Repos appear or get archived a few times a year, so six hours is plenty and
// keeps the dropdown free. The core repo leads, the rest is alphabetical.
export const ISSUE_ORG = "nuxt";
export const fetchIssueRepos = defineCachedFunction(
  async (token: string): Promise<string[]> => {
    interface RestRepo {
      full_name: string;
      archived: boolean;
      fork: boolean;
      has_issues: boolean;
      // Issues plus PRs; only used to hide repos with nothing open at all.
      open_issues_count: number;
    }
    const names: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const repos = await $fetch<RestRepo[]>(`https://api.github.com/orgs/${ISSUE_ORG}/repos`, {
        query: { type: "public", per_page: PER_PAGE, page },
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "nuxtathon-leaderboard",
        },
      });
      for (const r of repos) {
        if (!r.archived && !r.fork && r.has_issues && r.open_issues_count > 0) {
          names.push(r.full_name.toLowerCase());
        }
      }
      if (repos.length < PER_PAGE) break;
    }
    return names.sort(
      (a, b) => Number(b === HOME_REPO) - Number(a === HOME_REPO) || a.localeCompare(b),
    );
  },
  { maxAge: 6 * 60 * 60, name: "issue-repos", getKey: () => ISSUE_ORG },
);

// Per-user watch list. Its own key per login, so two people never race.
//
// The acknowledged time is stored per issue, not once per user: an issue you
// started watching today must not light up because of a comment from last year,
// and adding one after a "mark as seen" has to behave the same way.
interface WatchState {
  // Issues in display order, newest first.
  watching: IssueRef[];
  // Issue -> when this user last acknowledged it.
  seen: Record<IssueRef, string>;
}
const watchKey = (login: string) => `watch:${login.toLowerCase()}`;

// Lists saved before refs hold bare nuxt/nuxt numbers, and their `seen` keys are
// those numbers as strings. Both are read as refs; the next write stores refs.
export async function readWatch(login: string): Promise<WatchState> {
  const stored = await useStorage("state").getItem<{
    watching?: unknown[];
    seen?: Record<string, string>;
    lastSeenAt?: string;
  }>(watchKey(login));
  const watching = normalizeIssueRefs(stored?.watching);
  if (stored?.seen) {
    const seen: Record<IssueRef, string> = {};
    for (const [key, at] of Object.entries(stored.seen)) {
      const ref = parseIssueRef(key);
      if (ref) seen[ref] = at;
    }
    return { watching, seen };
  }

  // Older records carried a single timestamp for everything; fold it into the
  // per-issue map so nothing is suddenly marked unread.
  const fallback = stored?.lastSeenAt ?? new Date().toISOString();
  return { watching, seen: Object.fromEntries(watching.map((r) => [r, fallback])) };
}

export async function writeWatch(login: string, state: WatchState): Promise<void> {
  await useStorage("state").setItem(watchKey(login), state);
}

// Read-modify-write per login. Two requests from the same person (a double
// click, or a toggle racing "mark as seen") would otherwise each read the old
// state and the later write would drop the other's change.
const locks = new Map<string, Promise<unknown>>();
export function withWatchLock<T>(login: string, task: () => Promise<T>): Promise<T> {
  const key = login.toLowerCase();
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  // Keep the chain alive but never let a rejection poison the next caller, and
  // drop the entry once this user is idle again.
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, settled);
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
}
