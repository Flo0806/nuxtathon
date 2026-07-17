import type { EventConfig, EventStats, LeaderboardEntry } from "#shared/types/event";

interface PrAuthor {
  __typename: string;
  login: string;
  avatarUrl: string;
  name?: string | null;
}

interface ContributorUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

interface PrNode {
  number: number;
  mergedAt: string;
  author: PrAuthor | null;
  closingIssuesReferences: { nodes: { number: number; createdAt: string }[] };
  // Commit authors carry co-authors (from Co-authored-by trailers, resolved to
  // GitHub accounts). `user` is null when the email is not linked to an account.
  commits: { nodes: { commit: { authors: { nodes: { user: ContributorUser | null }[] } } }[] };
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
          commits(first: 50) {
            nodes {
              commit {
                authors(first: 10) {
                  nodes {
                    user {
                      login
                      name
                      avatarUrl
                    }
                  }
                }
              }
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

// Confirm each number is a real issue in the core repo. Backs the manual-credit
// save: a credit may only point at an issue that exists, so a fat-fingered number
// can never slip into the closed-issue count. One batched query, alias per number.
// GitHub answers a missing issue with a NOT_FOUND error *and* partial data (null
// for that field), so we bypass the shared graphql() helper (which treats any
// errors array as fatal) and classify per alias: resolved number -> valid, else
// invalid. Field-level errors are expected here, not a hard failure.
export async function validateIssues(
  token: string,
  numbers: number[],
): Promise<{ valid: number[]; invalid: number[] }> {
  const unique = [...new Set(numbers.filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) return { valid: [], invalid: [] };

  const fields = unique.map((n) => `i${n}: issue(number: ${n}) { number }`).join("\n");
  const query = `query { repository(owner: "nuxt", name: "nuxt") { ${fields} } }`;
  const res = await $fetch<{
    data?: { repository?: Record<string, { number: number } | null> | null };
  }>(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "user-agent": "nuxtathon-leaderboard" },
    body: { query, variables: {} },
  });
  const repo = res?.data?.repository ?? null;

  const valid: number[] = [];
  const invalid: number[] = [];
  for (const n of unique) (repo?.[`i${n}`]?.number === n ? valid : invalid).push(n);
  return { valid, invalid };
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
// Bots + AI-agent co-author attributions (e.g. "claude" from a Co-authored-by
// trailer): credit belongs to the human, per the Nuxtathon rules.
const BOT_LOGINS = new Set(
  [
    "renovate",
    "dependabot",
    "dependabot-preview",
    "autofix-ci",
    "github-actions",
    "codecov",
    "claude",
    "devin-ai-integration",
    "cursoragent",
    "copilot",
  ].map((l) => l.toLowerCase()),
);

// Commit co-authors carry the "[bot]" suffix (e.g. "autofix-ci[bot]"), which the
// bare denylist misses; the suffix is GitHub's own marker for bot accounts.
const isBotLogin = (login: string): boolean =>
  login.endsWith("[bot]") || BOT_LOGINS.has(login.toLowerCase());

interface Tally {
  login: string;
  name: string | null;
  avatarUrl: string;
  issues: Set<number>;
  prs: number;
}

// Everyone who worked on a PR: its linked commit authors (which include
// Co-authored-by trailers), falling back to the PR opener when no commit author
// resolves to an account. Bots are dropped.
function collectContributors(pr: PrNode): Map<string, ContributorUser> {
  const contributors = new Map<string, ContributorUser>();
  for (const node of pr.commits.nodes) {
    for (const author of node.commit.authors.nodes) {
      const user = author.user;
      if (user && !isBotLogin(user.login)) contributors.set(user.login, user);
    }
  }
  if (contributors.size === 0 && pr.author?.__typename === "User" && !isBotLogin(pr.author.login)) {
    const a = pr.author;
    contributors.set(a.login, { login: a.login, name: a.name ?? null, avatarUrl: a.avatarUrl });
  }
  return contributors;
}

function toEntry(tally: Tally): LeaderboardEntry {
  return {
    login: tally.login,
    name: tally.name,
    avatarUrl: tally.avatarUrl,
    closedIssues: tally.issues.size,
    mergedPRs: tally.prs,
    manualCredits: 0,
    score: tally.issues.size,
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
): Promise<{
  entries: LeaderboardEntry[];
  coreTeam: LeaderboardEntry[];
  stats: EventStats;
  // Issue numbers closed by event PRs, exposed so the endpoint can dedup manual
  // credits against them before counting.
  closedIssues: number[];
}> {
  const from = window?.from ?? config.startsAt;
  const to = window?.to ?? config.endsAt;
  const cutoff = Date.parse(config.qualifyingBefore);
  const coreSet = new Set((config.coreTeam ?? []).map((l) => l.toLowerCase()));

  const prs = await fetchEventPrs(token, from, to);

  const byLogin = new Map<string, Tally>();
  const coreByLogin = new Map<string, Tally>();
  // Public headline count: every issue an event PR closed, whenever the issue was
  // created. Scoring below still credits only pre-announcement issues, but the
  // visible counter should tick for anything resolved during the event, including
  // issues opened mid-event (Daniel files a fresh bug, someone fixes it same day).
  const closedInWindow = new Set<number>();

  for (const pr of prs) {
    for (const ref of pr.closingIssuesReferences.nodes) closedInWindow.add(ref.number);
    const qualifying = pr.closingIssuesReferences.nodes.filter(
      (issue) => Date.parse(issue.createdAt) < cutoff,
    );
    if (qualifying.length === 0) continue;
    const issueNumbers = qualifying.map((issue) => issue.number);

    // Full credit for every contributor; issues are deduped per person via the
    // set, so the same issue counts once even across several of their PRs.
    for (const contributor of collectContributors(pr).values()) {
      const target = coreSet.has(contributor.login.toLowerCase()) ? coreByLogin : byLogin;
      const tally = target.get(contributor.login) ?? {
        login: contributor.login,
        name: contributor.name,
        avatarUrl: contributor.avatarUrl,
        issues: new Set<number>(),
        prs: 0,
      };
      for (const n of issueNumbers) tally.issues.add(n);
      tally.prs += 1;
      target.set(contributor.login, tally);
    }
  }

  const entries = rank([...byLogin.values()].map(toEntry));
  const coreTeam = rank([...coreByLogin.values()].map(toEntry));

  const issuesClosed = closedInWindow.size;
  const merged = prs.filter((pr) => isHuman(pr.author)).length;
  const submitted = await countHumanPrs(
    token,
    `${REPO} is:pr created:${toGithubStamp(from)}..${toGithubStamp(to)}`,
  );

  return {
    entries,
    coreTeam,
    stats: { submitted, merged, issuesClosed },
    closedIssues: [...closedInWindow],
  };
}
