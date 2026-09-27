import type { BoardIssue } from "#shared/types/issues";
import { issueSearchQuery } from "#shared/utils/issue-search";

const PER_PAGE = 100;
// 500 issues of headroom over the ~280 that qualify today; GitHub's search stops
// at 1000 regardless.
const MAX_PAGES = 5;
// A watch list is a working aid, not an archive. The cap also keeps the batched
// alias query for closed entries to a sane size.
export const MAX_WATCHED = 100;

interface RestIssue {
  number: number;
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

async function search(token: string, q: string, page: number) {
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

async function searchAll(token: string, q: string): Promise<RestIssue[]> {
  const out: RestIssue[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items } = await search(token, q, page);
    out.push(...items);
    if (items.length < PER_PAGE) break;
  }
  return out;
}

// The whole eligible backlog, oldest first. A second search marks the ones a PR
// already references; that set is small, so it is cheaper than asking per issue.
export const fetchIssueBoard = defineCachedFunction(
  async (token: string, query: string): Promise<BoardIssue[]> => {
    const [all, linked] = await Promise.all([
      searchAll(token, query),
      searchAll(token, `${query} linked:pr`),
    ]);
    const withPr = new Set(linked.map((i) => i.number));

    return all.map((i) => ({
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
      hasPr: withPr.has(i.number),
    }));
  },
  { maxAge: 300, name: "issue-board", getKey: (_token, query) => query },
);

// Watched issues that left the open list: closed, or no longer qualifying. One
// batched query with an alias per number, so a handful costs a single request.
// Without this a watched issue would simply vanish the moment someone solved it,
// which is the one outcome the watcher actually waits for.
// Cached like the board: this is the only lookup whose cost follows the users
// rather than the repo, so repeated polls must not each pay for it.
export const fetchClosedWatched = defineCachedFunction(
  (token: string, numbers: number[]) => closedWatched(token, numbers),
  {
    maxAge: 300,
    name: "closed-watched",
    getKey: (_token: string, numbers: number[]) => [...numbers].sort((a, b) => a - b).join(","),
  },
);

async function closedWatched(token: string, numbers: number[]): Promise<BoardIssue[]> {
  const unique = [...new Set(numbers.filter((n) => Number.isInteger(n) && n > 0))].slice(
    0,
    MAX_WATCHED,
  );
  if (unique.length === 0) return [];

  const fields = unique
    .map(
      (n) => `i${n}: issue(number: ${n}) {
        number title url createdAt updatedAt state
        author { login }
        comments { totalCount }
        reactions(content: THUMBS_UP) { totalCount }
        labels(first: 20) { nodes { name } }
        assignees(first: 1) { nodes { login } }
      }`,
    )
    .join("\n");

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

  const res = await githubQuery<{ repository?: Record<string, Node | null> | null }>(
    token,
    `query { repository(owner: "nuxt", name: "nuxt") { ${fields} } }`,
  );

  const out: BoardIssue[] = [];
  for (const n of unique) {
    const node = res?.repository?.[`i${n}`];
    if (!node) continue;
    out.push({
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

export const boardQuery = (config: Parameters<typeof issueSearchQuery>[0]) =>
  issueSearchQuery(config);

// Per-user watch list. Its own key per login, so two people never race.
//
// The acknowledged time is stored per issue, not once per user: an issue you
// started watching today must not light up because of a comment from last year,
// and adding one after a "mark as seen" has to behave the same way.
interface WatchState {
  // Issue numbers in display order, newest first.
  watching: number[];
  // Issue number -> when this user last acknowledged it.
  seen: Record<string, string>;
}
const watchKey = (login: string) => `watch:${login.toLowerCase()}`;

export async function readWatch(login: string): Promise<WatchState> {
  const stored = await useStorage("state").getItem<Partial<WatchState> & { lastSeenAt?: string }>(
    watchKey(login),
  );
  const watching = stored?.watching ?? [];
  if (stored?.seen) return { watching, seen: stored.seen };

  // Older records carried a single timestamp for everything; fold it into the
  // per-issue map so nothing is suddenly marked unread.
  const fallback = stored?.lastSeenAt ?? new Date().toISOString();
  return { watching, seen: Object.fromEntries(watching.map((n) => [String(n), fallback])) };
}

export async function writeWatch(login: string, state: WatchState): Promise<void> {
  await useStorage("state").setItem(watchKey(login), state);
}
