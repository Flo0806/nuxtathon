import type {
  ContributionIds,
  EventConfig,
  EventStats,
  LeaderboardEntry,
} from "#shared/types/event";
import type { IssueRef } from "#shared/types/issue-ref";
import type { EventScope } from "#shared/types/scope";
import type { IssueFacts, IssueFactsMap } from "#shared/types/scoring";
import { HOME_REPO, issueRef, splitIssueRef } from "#shared/utils/issue-ref";
import { registryMaintainers } from "./registry";

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

interface IssueRefNode {
  number: number;
  repository?: { nameWithOwner: string };
  createdAt: string;
  labels?: { nodes: { name: string }[] };
  reactions?: { totalCount: number };
}

interface PrNode {
  number: number;
  repository?: { nameWithOwner: string };
  createdAt: string;
  mergedAt: string;
  labels?: { nodes: { name: string }[] };
  author: PrAuthor | null;
  closingIssuesReferences: { nodes: IssueRefNode[] };
  // Commit authors carry co-authors (from Co-authored-by trailers, resolved to
  // GitHub accounts). `user` is null when the email is not linked to an account.
  commits: { nodes: { commit: { authors: { nodes: { user: ContributorUser | null }[] } } }[] };
}

// A closing reference can point into another repo, so the ref comes from the
// node itself. Nodes without a repository (older cached shapes) are nuxt/nuxt.
const refOf = (node: { number: number; repository?: { nameWithOwner: string } }): IssueRef | null =>
  issueRef(node.repository?.nameWithOwner ?? HOME_REPO, node.number);

// Scoring inputs for one issue, from either query: both select the same fields.
function toIssueFacts(ref: Partial<IssueRefNode>): IssueFacts {
  return {
    createdAt: ref.createdAt ?? "",
    labels: (ref.labels?.nodes ?? []).map((l) => l.name),
    upvotes: ref.reactions?.totalCount ?? 0,
  };
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

// Everything scoring needs from one PR.
const PR_FIELDS = `
        ... on PullRequest {
          number
          repository {
            nameWithOwner
          }
          createdAt
          mergedAt
          labels(first: 20) {
            nodes {
              name
            }
          }
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
              repository {
                nameWithOwner
              }
              createdAt
              labels(first: 20) {
                nodes {
                  name
                }
              }
              reactions(content: THUMBS_UP) {
                totalCount
              }
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
`;

const SEARCH_QUERY = `
  query ($search: String!, $after: String) {
    search(query: $search, type: ISSUE, first: 100, after: $after) {
      issueCount
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        ${PR_FIELDS}
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

const USER_NAME_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      login
      name
      avatarUrl
    }
  }
`;

// Back-fill the display name + avatar from GitHub. Returns nulls on failure.
async function fetchUserName(token: string, login: string): Promise<ContributorUser | null> {
  try {
    const { user } = (await graphql(token, USER_NAME_QUERY, { login })) as {
      user: ContributorUser | null;
    };
    return user;
  } catch {
    return null;
  }
}

// Never pass GitHub's status through: a 401 here is a bad token, and the admin
// client would read it as an expired admin session.
async function post<T>(token: string, query: string, variables: object): Promise<T> {
  try {
    return await $fetch<T>(GITHUB_GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "user-agent": "nuxtathon-leaderboard" },
      body: { query, variables },
    });
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    throw createError({ statusCode: 502, statusMessage: `GitHub responded ${status ?? "error"}` });
  }
}

interface GraphqlError {
  type?: string;
  message?: string;
}

// A batched query for callers outside this module. A missing alias is expected
// (GitHub answers NOT_FOUND plus a null field) and stays non-fatal, but anything
// else, rate limits above all, is raised: swallowing it would turn an outage
// into a silently empty result.
export async function githubQuery<T>(token: string, query: string): Promise<T> {
  const res = await post<{ data?: T; errors?: GraphqlError[] }>(token, query, {});
  const fatal = (res?.errors ?? []).filter((e) => e?.type !== "NOT_FOUND");
  if (fatal.length > 0) {
    throw createError({
      statusCode: 502,
      statusMessage: `GitHub GraphQL error: ${fatal[0]?.type ?? fatal[0]?.message ?? "unknown"}`,
      data: fatal,
    });
  }
  if (!res?.data) {
    throw createError({ statusCode: 502, statusMessage: "GitHub returned no data" });
  }
  return res.data;
}

async function graphql(token: string, query: string, variables: object): Promise<unknown> {
  const res = await post<{ data?: unknown; errors?: unknown }>(token, query, variables);
  if (res.errors || !res.data) {
    throw createError({ statusCode: 502, statusMessage: "GitHub GraphQL error", data: res.errors });
  }
  return res.data;
}

// One query for issues spread over several repos: an alias per repository and,
// inside it, one per number. Owner and name come from validated refs, so they
// are safe to interpolate. GitHub answers a missing issue with a NOT_FOUND error
// *and* partial data (null for that field), which callers classify per alias.
export function batchedIssueQuery(refs: IssueRef[], selection: string) {
  const byRepo = new Map<string, number[]>();
  for (const ref of refs) {
    const { repo, number } = splitIssueRef(ref);
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), number]);
  }
  const paths: { ref: IssueRef; repo: string; issue: string }[] = [];
  const parts = [...byRepo].map(([repo, numbers], r) => {
    const [owner, name] = repo.split("/");
    const inner = numbers.map((n) => {
      paths.push({ ref: `${repo}#${n}` as IssueRef, repo: `r${r}`, issue: `i${n}` });
      return `i${n}: issue(number: ${n}) { ${selection} }`;
    });
    return `r${r}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${inner.join("\n")} }`;
  });
  return { query: `query { ${parts.join("\n")} }`, paths };
}

export type RepoAliases<T> = Record<string, Record<string, T | null> | null>;

// Confirm each ref is a real issue. Backs the manual-credit save: a credit may
// only point at an issue that exists, so a fat-fingered number can never slip
// into the closed-issue count. Bypasses the shared graphql() helper, which treats
// any errors array as fatal; field-level NOT_FOUND is the expected answer here.
export async function validateIssues(
  token: string,
  refs: IssueRef[],
): Promise<{ valid: IssueRef[]; invalid: IssueRef[] }> {
  const unique = [...new Set(refs)];
  if (unique.length === 0) return { valid: [], invalid: [] };

  const { query, paths } = batchedIssueQuery(unique, "number");
  const res = await post<{ data?: RepoAliases<{ number: number }> }>(token, query, {});
  const data = res?.data ?? {};

  const valid: IssueRef[] = [];
  const invalid: IssueRef[] = [];
  for (const p of paths) {
    const hit = data[p.repo]?.[p.issue]?.number === splitIssueRef(p.ref).number;
    (hit ? valid : invalid).push(p.ref);
  }
  return { valid, invalid };
}

// Thumbs-up across a set of closed issues. Those a query already covered are
// summed from their facts; only what a manual credit pulled in costs a request.
// A failure there degrades to the partial sum: this counter is decoration, and
// losing the whole board over it would be the wrong trade.
export async function totalUpvotes(
  token: string,
  closed: Iterable<IssueRef>,
  facts: IssueFactsMap,
): Promise<number> {
  let sum = 0;
  const missing: IssueRef[] = [];
  for (const ref of closed) {
    const f = facts[ref];
    if (f) sum += f.upvotes;
    else missing.push(ref);
  }
  if (missing.length === 0) return sum;
  try {
    return sum + (await fetchIssueUpvotes(token, missing));
  } catch (e) {
    console.error("[upvotes] batched lookup failed, reporting the partial sum:", e);
    return sum;
  }
}

// Bounded because the alias list goes into the query text.
async function fetchIssueUpvotes(token: string, refs: IssueRef[]): Promise<number> {
  const unique = [...new Set(refs)].slice(0, 100);
  if (unique.length === 0) return 0;

  const { query, paths } = batchedIssueQuery(
    unique,
    "reactions(content: THUMBS_UP) { totalCount }",
  );
  const res = await post<{ data?: RepoAliases<{ reactions?: { totalCount: number } }> }>(
    token,
    query,
    {},
  );
  const data = res?.data ?? {};

  let sum = 0;
  for (const p of paths) sum += data[p.repo]?.[p.issue]?.reactions?.totalCount ?? 0;
  return sum;
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

// Merged PRs across every org and repo of a scope. One search per entry rather
// than one OR-ed query: GitHub caps a query at 256 characters and five
// operators, which a longer repo list would hit. They run one after another, not
// as aliases in one request: a page of PRs with commits, co-authors and closing
// issues takes GitHub several seconds, and two of them together came close to
// its ~10 s timeout (measured 8.4 s, and one 502).
export function scopeSearches(scope: EventScope, qualifiers: string): string[] {
  const orgs = new Set(scope.orgs);
  // A repo inside a listed org is already covered by the org search.
  const repos = scope.repos.filter((r) => !orgs.has(r.slice(0, r.indexOf("/"))));
  return [...scope.orgs.map((o) => `org:${o}`), ...repos.map((r) => `repo:${r}`)].map(
    (target) => `${target} ${qualifiers}`,
  );
}

async function searchPrsAcross(
  token: string,
  searches: string[],
): Promise<{ prs: PrNode[]; counts: { search: string; count: number }[] }> {
  const byRef = new Map<IssueRef, PrNode>();
  const counts: { search: string; count: number }[] = [];
  for (const search of searches) {
    let count = 0;
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { search: result } = (await graphql(token, SEARCH_QUERY, { search, after })) as {
        search: SearchPage & { issueCount: number };
      };
      count = result.issueCount;
      for (const pr of result.nodes) {
        const ref = typeof pr.number === "number" ? refOf(pr) : null;
        if (ref) byRef.set(ref, pr);
      }
      if (!result.pageInfo.hasNextPage) break;
      after = result.pageInfo.endCursor;
    }
    counts.push({ search, count });
  }
  return { prs: [...byRef.values()], counts };
}

// Which way a PR counts. Shared by the admin check, the board and the review
// queue, so what the check shows is what the board will do.
//   auto:    closes at least one issue created before the cutoff; scored as in #1
//   review:  in scope but closes nothing that qualifies, or opened by the
//            maintainers of that very repo; an organizer decides
//   ignored: nobody left to credit once bots are dropped, or core team only
//            without a qualifying issue (core team is acknowledged on the board,
//            never reviewed for points)
export type PrPath = "auto" | "review" | "ignored";

export interface ClassifiedPr {
  path: PrPath;
  reason: string;
  qualifying: IssueRef[];
  closes: { ref: IssueRef; createdAt: string; qualifies: boolean }[];
  // Who gets credit on the auto path: humans, minus maintainers of this repo.
  contributors: string[];
  // Maintainers of this repo who worked on it and get no automatic credit.
  maintainers: string[];
}

export function classifyPr(
  pr: PrNode,
  cutoff: number,
  coreTeam: Set<string>,
  repoMaintainers: Map<string, Set<string>>,
): ClassifiedPr {
  const closes = pr.closingIssuesReferences.nodes.flatMap((n) => {
    const ref = refOf(n);
    return ref
      ? [{ ref, createdAt: n.createdAt, qualifies: Date.parse(n.createdAt) < cutoff }]
      : [];
  });
  const qualifying = closes.filter((c) => c.qualifies).map((c) => c.ref);
  const humans = [...collectContributors(pr).keys()];
  const n = qualifying.length;
  const closesText = `closes ${n} qualifying ${n === 1 ? "issue" : "issues"}`;

  if (humans.length === 0) {
    return {
      qualifying,
      closes,
      contributors: [],
      maintainers: [],
      path: "ignored",
      reason: "bot",
    };
  }

  // Core team first: Daniel maintains many modules himself, and his PRs must
  // neither land in his own review queue nor be reported as self-maintained.
  const isCore = (l: string) => coreTeam.has(l.toLowerCase());
  if (humans.every(isCore)) {
    const base = { qualifying, closes, contributors: humans, maintainers: [] };
    return n > 0
      ? { ...base, path: "auto", reason: closesText }
      : { ...base, path: "ignored", reason: "core team" };
  }

  // Self-maintained: the rules exclude work on your own repo. Only the
  // maintainers lose automatic credit; a community co-author keeps theirs.
  const prRef = refOf(pr);
  const own = prRef ? repoMaintainers.get(prRef.slice(0, prRef.lastIndexOf("#"))) : undefined;
  const maintainers = humans.filter((l) => !isCore(l) && own?.has(l.toLowerCase()));
  const contributors = humans.filter((l) => !maintainers.includes(l));
  const base = { qualifying, closes, contributors, maintainers };

  if (contributors.every(isCore)) {
    return { ...base, path: "review", reason: "maintainer of this repository" };
  }
  if (n > 0) return { ...base, path: "auto", reason: closesText };
  return {
    ...base,
    path: "review",
    reason: closes.length ? "closes only issues from after the cutoff" : "closes no issue",
  };
}

// Admin debug view: what the scope finds for a window and which way each PR
// would count, before any of it reaches the board.
export async function scopeCheck(
  token: string,
  config: Pick<EventConfig, "scope" | "qualifyingBefore" | "coreTeam">,
  from: string,
  to: string,
) {
  const searches = scopeSearches(
    config.scope,
    `is:pr is:merged created:${toGithubStamp(from)}..${toGithubStamp(to)}`,
  );
  const { prs, counts } = await searchPrsAcross(token, searches);
  const cutoff = Date.parse(config.qualifyingBefore);
  const core = new Set(config.coreTeam.map((l) => l.toLowerCase()));
  const registry = await registryMaintainers();
  return {
    searches: counts,
    cutoff: config.qualifyingBefore,
    // False when nuxt.com could not be reached: nobody is treated as a
    // maintainer then, and the page says so.
    registry: registry.ok,
    prs: prs
      .map((pr) => ({
        ref: refOf(pr)!,
        author: pr.author?.login ?? "ghost",
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        labels: (pr.labels?.nodes ?? []).map((l) => l.name),
        ...classifyPr(pr, cutoff, core, registry.byRepo),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pull "<keyword> @a @b" out of a comment body. The keyword is matched
// case-insensitively and whitespace-tolerant ("Nuxtathon  Closed" still hits);
// the @handles after it are returned verbatim, since a GitHub login must be kept
// as written. Returns [] when the marker is absent.
function parseCreditedLogins(body: string, keyword: string): string[] {
  const kw = keyword.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  const match = body.match(new RegExp(`${kw}\\s+((?:@[a-z0-9-]+[\\s,]*)+)`, "i"));
  const run = match?.[1];
  if (!run) return [];
  return [...run.matchAll(/@([a-z0-9-]+)/gi)].flatMap((m) => (m[1] ? [m[1]] : []));
}

const MARKER_QUERY = `
  query ($search: String!, $after: String) {
    search(query: $search, type: ISSUE, first: 50, after: $after) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        ... on Issue {
          number
          repository {
            nameWithOwner
          }
          createdAt
          labels(first: 20) {
            nodes {
              name
            }
          }
          reactions(content: THUMBS_UP) {
            totalCount
          }
          comments(last: 20) {
            nodes {
              body
              createdAt
              author {
                login
              }
            }
          }
        }
      }
    }
  }
`;

interface MarkerPage {
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  nodes: (Partial<IssueRefNode> & {
    comments?: {
      nodes: { body: string; createdAt: string; author: { login: string } | null }[];
    };
  })[];
}

// Issues closed in the window carrying a credit marker in a comment from an
// authorized organizer. The automated twin of a manual credit: only trusted
// authors are honored, so nobody farms points by self-mentioning under a random
// closed issue. Both the close and the marker comment must fall inside the
// window. Returns one entry per marked issue with its credited logins.
async function fetchMarkerCredits(
  token: string,
  from: string,
  to: string,
  keyword: string,
  authors: Set<string>,
): Promise<{ issue: IssueRef; logins: string[]; facts: IssueFacts }[]> {
  const search = `${REPO} is:issue is:closed closed:${toGithubStamp(from)}..${toGithubStamp(to)}`;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const out: { issue: IssueRef; logins: string[]; facts: IssueFacts }[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { search: result } = (await graphql(token, MARKER_QUERY, { search, after })) as {
      search: MarkerPage;
    };
    for (const issue of result.nodes) {
      const ref =
        typeof issue.number === "number" ? refOf({ ...issue, number: issue.number }) : null;
      if (!ref) continue;
      const logins = new Set<string>();
      for (const comment of issue.comments?.nodes ?? []) {
        if (!comment.author || !authors.has(comment.author.login.toLowerCase())) continue;
        // The marker has to be written during this event. Without this a comment
        // from an earlier Nuxtathon would count again whenever its issue is
        // reopened and closed a second time.
        const at = Date.parse(comment.createdAt);
        if (!Number.isFinite(at) || at < fromMs || at > toMs) continue;
        for (const login of parseCreditedLogins(comment.body, keyword)) logins.add(login);
      }
      if (logins.size > 0) {
        out.push({
          issue: ref,
          logins: [...logins],
          facts: toIssueFacts(issue),
        });
      }
    }
    if (!result.pageInfo.hasNextPage) break;
    after = result.pageInfo.endCursor;
  }
  return out;
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
  issues: Set<IssueRef>;
  prs: Set<IssueRef>;
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
    mergedPRs: tally.prs.size,
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
  // Issues closed by event PRs, exposed so the endpoint can dedup manual credits
  // against them before counting.
  closedIssues: IssueRef[];
  // Per-login credited issues and PRs (deep-linking + reuse).
  contributions: ContributionIds;
  // Age, labels and upvotes of every closed issue, for weighted scoring.
  issueFacts: IssueFactsMap;
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
  const closedInWindow = new Set<IssueRef>();

  const issueFacts: IssueFactsMap = {};

  for (const pr of prs) {
    const prRef = refOf(pr);
    if (!prRef) continue;
    const qualifying: IssueRef[] = [];
    for (const node of pr.closingIssuesReferences.nodes) {
      const ref = refOf(node);
      if (!ref) continue;
      closedInWindow.add(ref);
      issueFacts[ref] = toIssueFacts(node);
      if (Date.parse(node.createdAt) < cutoff) qualifying.push(ref);
    }
    if (qualifying.length === 0) continue;

    // Full credit for every contributor; issues are deduped per person via the
    // set, so the same issue counts once even across several of their PRs.
    for (const contributor of collectContributors(pr).values()) {
      // Key by lowercased login: GitHub logins are case-insensitive identities,
      // so "Norbiros" and "norbiros" must land on the same tally. The display
      // login keeps whatever case the first source (usually the PR) provided.
      const key = contributor.login.toLowerCase();
      const target = coreSet.has(key) ? coreByLogin : byLogin;
      const tally = target.get(key) ?? {
        login: contributor.login,
        name: contributor.name,
        avatarUrl: contributor.avatarUrl,
        issues: new Set<IssueRef>(),
        prs: new Set<IssueRef>(),
      };
      for (const ref of qualifying) tally.issues.add(ref);
      tally.prs.add(prRef);
      target.set(key, tally);
    }
  }

  // Organizer-marked closes: issues resolved without a PR that Daniel credits via
  // a comment ("nuxtathon closed @user"). Authorized authors only, and any issue a
  // PR already closed is skipped so neither the count nor the credit doubles up.
  //
  // The window runs to *now*, not to `endsAt`: marking happens by hand, and the
  // evaluating phase exists precisely to work through what is left. Firing ends
  // it without a stored cutoff, because a fired event is served from its frozen
  // result and never recomputed.
  const markerAuthors = new Set((config.markerAuthors ?? []).map((l) => l.toLowerCase()));
  const markerTo = window?.to ?? new Date().toISOString();
  const markers =
    config.closeMarker && markerAuthors.size > 0
      ? await fetchMarkerCredits(token, from, markerTo, config.closeMarker, markerAuthors)
      : [];

  // Marker-credited logins (which carry no name) awaiting a GitHub lookup.
  const missingNames = new Map<string, Tally>();

  for (const { issue, logins, facts } of markers) {
    if (closedInWindow.has(issue)) continue;
    closedInWindow.add(issue);
    issueFacts[issue] = facts;
    for (const login of logins) {
      if (isBotLogin(login)) continue;
      // Same case-insensitive keying: a marker "@norbiros" merges into the PR's
      // "Norbiros" tally instead of creating a second row.
      const key = login.toLowerCase();
      const target = coreSet.has(key) ? coreByLogin : byLogin;
      const isNew = !target.has(key);
      const tally = target.get(key) ?? {
        login,
        name: null,
        avatarUrl: `https://github.com/${login}.png?size=80`,
        issues: new Set<IssueRef>(),
        prs: new Set<IssueRef>(),
      };
      tally.issues.add(issue);
      target.set(key, tally);
      // Marker credits start with a name-less tally; back-fill the display name + avatar from GitHub.
      if (isNew) missingNames.set(key, tally);
    }
  }

  // Back-fill display names + avatars for marker-only contributors in one batch.
  if (missingNames.size > 0) {
    const resolved = await Promise.all(
      [...missingNames.keys()].map(async (key) => {
        const info = await fetchUserName(token, missingNames.get(key)!.login);
        return [key, info] as const;
      }),
    );
    for (const [key, info] of resolved) {
      if (!info) continue;
      const tally = missingNames.get(key)!;
      tally.name = info.name;
      tally.avatarUrl = info.avatarUrl;
    }
  }

  const entries = rank([...byLogin.values()].map(toEntry));
  const coreTeam = rank([...coreByLogin.values()].map(toEntry));

  const issuesClosed = closedInWindow.size;
  // Community demand behind the closed issues. Every issue here came from a
  // query that already selected its reactions, so this costs nothing extra.
  let upvotes = 0;
  for (const ref of closedInWindow) upvotes += issueFacts[ref]?.upvotes ?? 0;
  const merged = prs.filter((pr) => isHuman(pr.author)).length;
  const submitted = await countHumanPrs(
    token,
    `${REPO} is:pr created:${toGithubStamp(from)}..${toGithubStamp(to)}`,
  );

  const contributions: ContributionIds = {};
  for (const m of [byLogin, coreByLogin]) {
    for (const tally of m.values()) {
      contributions[tally.login] = {
        issues: [...tally.issues],
        prs: [...tally.prs],
      };
    }
  }

  return {
    entries,
    coreTeam,
    stats: { submitted, merged, issuesClosed, upvotes },
    closedIssues: [...closedInWindow],
    contributions,
    issueFacts,
  };
}
