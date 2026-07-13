import type { EventConfig, EventStats, LeaderboardEntry } from "#shared/types/event";

interface PrAuthor {
  __typename: string;
  login: string;
  avatarUrl: string;
  name?: string | null;
}

interface PrNode {
  number: number;
  mergedAt: string;
  author: PrAuthor | null;
  closingIssuesReferences: { nodes: { number: number; createdAt: string }[] };
}

interface SearchPage {
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  nodes: PrNode[];
}

interface AuthorPage {
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  nodes: { author: { __typename: string } | null }[];
}

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const MAX_PAGES = 10;
const REPO = "repo:nuxt/nuxt";

const SEARCH_QUERY = `
  query ($search: String!, $after: String) {
    search(query: $search, type: ISSUE, first: 100, after: $after) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        ... on PullRequest {
          number
          mergedAt
          author {
            __typename
            login
            avatarUrl
            ... on User {
              name
            }
          }
          closingIssuesReferences(first: 20) {
            nodes {
              number
              createdAt
            }
          }
        }
      }
    }
  }
`;

const AUTHOR_QUERY = `
  query ($search: String!, $after: String) {
    search(query: $search, type: ISSUE, first: 100, after: $after) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        ... on PullRequest {
          author {
            __typename
          }
        }
      }
    }
  }
`;

async function graphql(token: string, query: string, variables: object): Promise<unknown> {
  const res = await $fetch<{ data?: unknown; errors?: unknown }>(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "user-agent": "nuxtathon-leaderboard" },
    body: { query, variables },
  });
  if (res.errors || !res.data) {
    throw createError({ statusCode: 502, statusMessage: "GitHub GraphQL error", data: res.errors });
  }
  return res.data;
}

// Timestamped form GitHub search accepts in `merged:from..to`, pinning the window
// to the second instead of relying on day granularity.
function toGithubStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

const isHuman = (author: { __typename: string } | null): boolean => author?.__typename === "User";

async function fetchMergedPrs(token: string, from: string, to: string): Promise<PrNode[]> {
  const search = `${REPO} is:pr is:merged merged:${toGithubStamp(from)}..${toGithubStamp(to)}`;
  const prs: PrNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { search: result } = (await graphql(token, SEARCH_QUERY, { search, after })) as {
      search: SearchPage;
    };
    prs.push(...result.nodes);
    if (!result.pageInfo.hasNextPage) break;
    after = result.pageInfo.endCursor;
  }
  return prs;
}

// Human-authored PR count for a search, excluding bots (renovate, dependabot).
async function countHumanPrs(token: string, search: string): Promise<number> {
  let after: string | null = null;
  let count = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { search: result } = (await graphql(token, AUTHOR_QUERY, { search, after })) as {
      search: AuthorPage;
    };
    count += result.nodes.filter((node) => isHuman(node.author)).length;
    if (!result.pageInfo.hasNextPage) break;
    after = result.pageInfo.endCursor;
  }
  return count;
}

// Ranking plus window-wide activity counters. A PR contributes only issues
// created before the qualifying cutoff; bot and issue-less PRs score nothing,
// and the counters exclude bots to match.
export async function fetchLeaderboard(
  config: EventConfig,
  token: string,
  window?: { from?: string; to?: string },
): Promise<{ entries: LeaderboardEntry[]; stats: EventStats }> {
  const from = window?.from ?? config.startsAt;
  const to = window?.to ?? config.endsAt;
  const cutoff = Date.parse(config.qualifyingBefore);

  const prs = await fetchMergedPrs(token, from, to);

  const byLogin = new Map<string, LeaderboardEntry>();
  for (const pr of prs) {
    if (!isHuman(pr.author) || !pr.author) continue;

    const qualifying = pr.closingIssuesReferences.nodes.filter(
      (issue) => Date.parse(issue.createdAt) < cutoff,
    );
    if (qualifying.length === 0) continue;

    const entry = byLogin.get(pr.author.login) ?? {
      login: pr.author.login,
      name: pr.author.name ?? null,
      avatarUrl: pr.author.avatarUrl,
      closedIssues: 0,
      mergedPRs: 0,
      manualCredits: 0,
      score: 0,
      rank: 0,
    };
    entry.closedIssues += qualifying.length;
    entry.mergedPRs += 1;
    entry.score = entry.closedIssues + entry.manualCredits;
    byLogin.set(pr.author.login, entry);
  }

  const entries = [...byLogin.values()].sort(
    (a, b) => b.score - a.score || b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login),
  );
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const issuesClosed = entries.reduce((sum, entry) => sum + entry.closedIssues, 0);
  const merged = prs.filter((pr) => isHuman(pr.author)).length;
  const submitted = await countHumanPrs(
    token,
    `${REPO} is:pr created:${toGithubStamp(from)}..${toGithubStamp(to)}`,
  );

  return { entries, stats: { submitted, merged, issuesClosed } };
}
