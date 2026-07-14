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

// PRs submitted (created) inside the window that have since been merged, whenever
// the merge happened. The rule scores by submission date, not merge date.
async function fetchEventPrs(token: string, from: string, to: string): Promise<PrNode[]> {
  const search = `${REPO} is:pr is:merged created:${toGithubStamp(from)}..${toGithubStamp(to)}`;
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

// Bot accounts that can appear as regular users, on top of the __typename check.
const BOT_LOGINS = new Set(
  ["renovate", "dependabot", "dependabot-preview", "autofix-ci", "github-actions", "codecov"].map(
    (l) => l.toLowerCase(),
  ),
);

function makeEntry(author: PrAuthor): LeaderboardEntry {
  return {
    login: author.login,
    name: author.name ?? null,
    avatarUrl: author.avatarUrl,
    closedIssues: 0,
    mergedPRs: 0,
    manualCredits: 0,
    score: 0,
    rank: 0,
  };
}

function rank(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  entries.sort(
    (a, b) => b.score - a.score || b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login),
  );
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return entries;
}

// Ranking plus window-wide activity counters. Core team members are collected
// separately (acknowledged, not competing for prizes); bots and issue-less PRs
// score nothing.
export async function fetchLeaderboard(
  config: EventConfig,
  token: string,
  window?: { from?: string; to?: string },
): Promise<{ entries: LeaderboardEntry[]; coreTeam: LeaderboardEntry[]; stats: EventStats }> {
  const from = window?.from ?? config.startsAt;
  const to = window?.to ?? config.endsAt;
  const cutoff = Date.parse(config.qualifyingBefore);
  const coreSet = new Set((config.coreTeam ?? []).map((l) => l.toLowerCase()));

  const prs = await fetchEventPrs(token, from, to);

  const byLogin = new Map<string, LeaderboardEntry>();
  const coreByLogin = new Map<string, LeaderboardEntry>();
  for (const pr of prs) {
    const author = pr.author;
    if (!author || author.__typename !== "User" || BOT_LOGINS.has(author.login.toLowerCase())) {
      continue;
    }

    const qualifying = pr.closingIssuesReferences.nodes.filter(
      (issue) => Date.parse(issue.createdAt) < cutoff,
    );
    if (qualifying.length === 0) continue;

    const target = coreSet.has(author.login.toLowerCase()) ? coreByLogin : byLogin;
    const entry = target.get(author.login) ?? makeEntry(author);
    entry.closedIssues += qualifying.length;
    entry.mergedPRs += 1;
    entry.score = entry.closedIssues + entry.manualCredits;
    target.set(author.login, entry);
  }

  const entries = rank([...byLogin.values()]);
  const coreTeam = rank([...coreByLogin.values()]);

  const issuesClosed = [...entries, ...coreTeam].reduce((sum, e) => sum + e.closedIssues, 0);
  const merged = prs.filter((pr) => isHuman(pr.author)).length;
  const submitted = await countHumanPrs(
    token,
    `${REPO} is:pr created:${toGithubStamp(from)}..${toGithubStamp(to)}`,
  );

  return { entries, coreTeam, stats: { submitted, merged, issuesClosed } };
}
