import type { EventConfig, LeaderboardEntry } from "#shared/types/event";

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
  issueCount: number;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  nodes: PrNode[];
}

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
// Safety cap on pagination. A two-day window is far below 100 merged PRs/page,
// so 10 pages (1000 PRs) is a runaway backstop, not an expected limit.
const MAX_PAGES = 10;

const SEARCH_QUERY = `
  query ($search: String!, $after: String) {
    search(query: $search, type: ISSUE, first: 100, after: $after) {
      issueCount
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

// Render an ISO instant as the timestamped form GitHub search accepts in a
// `merged:from..to` range. Explicit timestamps pin the window to the second
// instead of relying on GitHub's coarser day granularity.
function toGithubStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

async function fetchAllMergedPrs(token: string, from: string, to: string): Promise<PrNode[]> {
  const search = `repo:nuxt/nuxt is:pr is:merged merged:${toGithubStamp(from)}..${toGithubStamp(to)}`;
  const all: PrNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res: { data?: { search: SearchPage }; errors?: unknown } = await $fetch(GITHUB_GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "user-agent": "nuxtathon-leaderboard" },
      body: { query: SEARCH_QUERY, variables: { search, after } },
    });
    if (res.errors || !res.data) {
      throw createError({
        statusCode: 502,
        statusMessage: "GitHub GraphQL error",
        data: res.errors,
      });
    }
    const { nodes, pageInfo } = res.data.search;
    all.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }
  return all;
}

// Aggregate merged PRs into a ranking. A PR contributes only the issues it closed
// that were created before the qualifying cutoff; PRs from bots (or ghosts) and
// PRs that closed no qualifying issue are dropped. Score is the count of
// qualifying closed issues, with merged-PR count as the tie-breaker and stat.
export async function fetchLeaderboard(
  config: EventConfig,
  token: string,
  window?: { from?: string; to?: string },
): Promise<LeaderboardEntry[]> {
  const from = window?.from ?? config.startsAt;
  const to = window?.to ?? config.endsAt;
  const cutoff = Date.parse(config.qualifyingBefore);

  const prs = await fetchAllMergedPrs(token, from, to);

  const byLogin = new Map<string, LeaderboardEntry>();
  for (const pr of prs) {
    const author = pr.author;
    // Only real users score. `__typename === "User"` excludes Bot and null.
    if (!author || author.__typename !== "User") continue;

    const qualifying = pr.closingIssuesReferences.nodes.filter(
      (issue) => Date.parse(issue.createdAt) < cutoff,
    );
    if (qualifying.length === 0) continue;

    const entry = byLogin.get(author.login) ?? {
      login: author.login,
      name: author.name ?? null,
      avatarUrl: author.avatarUrl,
      closedIssues: 0,
      mergedPRs: 0,
      manualCredits: 0,
      score: 0,
      rank: 0,
    };
    entry.closedIssues += qualifying.length;
    entry.mergedPRs += 1;
    entry.score = entry.closedIssues + entry.manualCredits;
    byLogin.set(author.login, entry);
  }

  const ranked = [...byLogin.values()].sort(
    (a, b) => b.score - a.score || b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login),
  );
  ranked.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return ranked;
}
