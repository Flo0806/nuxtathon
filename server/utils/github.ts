import type {
  ContributionIds,
  EventConfig,
  EventStats,
  LeaderboardEntry,
} from "#shared/types/event";
import type { IssueRef } from "#shared/types/issue-ref";
import type { EventScope } from "#shared/types/scope";
import type { ReviewItem } from "#shared/types/review";
import { V5_LABEL } from "#shared/types/review";
import type { IssueFacts, IssueFactsMap, ScoringRules } from "#shared/types/scoring";
import { HOME_REPO, issueRef, splitIssueRef } from "#shared/utils/issue-ref";
import { scopeTargets } from "#shared/utils/scope";
import { recordBudget } from "./github-budget";
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
  title?: string;
  files?: { totalCount: number; nodes: { path: string }[] };
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

// Everything scoring needs from one PR.
//
// Sized for GitHub's point cost, which counts every connection that *could* be
// fetched, whatever comes back: per PR roughly one per commit (its authors),
// one per closing issue (labels, reactions) and a few more. With 50 commits and
// 20 closing issues a page of 100 cost ~93 points, and one registry run of 54
// searches used the whole hourly budget of 5000 (2026-09-29). 20 commits and 10
// closing issues keep co-authors of all but unusually long PRs and every
// realistic "fixes #a #b" list, for an estimated half of the cost; the budget
// counter in the admin shows the measured cost of every call.
const PR_FIELDS = `
        ... on PullRequest {
          number
          title
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
          closingIssuesReferences(first: 10) {
            nodes {
              number
              repository {
                nameWithOwner
              }
              createdAt
              labels(first: 10) {
                nodes {
                  name
                }
              }
              reactions(content: THUMBS_UP) {
                totalCount
              }
            }
          }
          commits(first: 20) {
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

interface PagedQuery {
  text: string;
  pageSize: number;
}

const searchQuery = (pageSize: number, extra = ""): PagedQuery => ({
  pageSize,
  text: `
  query ($search: String!, $after: String) {
    search(query: $search, type: ISSUE, first: ${pageSize}, after: $after) {
      issueCount
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        ${PR_FIELDS}
        ${extra}
      }
    }
  }
`,
});

// GitHub's search never returns more than 1000 hits, whatever the page size.
const MAX_RESULTS = 1000;

// The page size is charged in full even when fewer PRs come back, so it follows
// the expected volume: the board's org searches return dozens, a registry pack
// of seven repos usually none to three. More pages are fetched when needed.
const SEARCH_QUERY = searchQuery(50);
const SEARCH_QUERY_SMALL = searchQuery(10);

// Monorepo modules also need the changed paths, to keep only PRs that touch the
// module's folder.
const SEARCH_QUERY_WITH_FILES = searchQuery(
  10,
  `... on PullRequest { files(first: 100) { totalCount nodes { path } } }`,
);

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
//
// Every response passes its rate-limit headers to the budget counter.
async function post<T>(token: string, query: string, variables: object): Promise<T> {
  // The whole query, not a prefix: some embed their search string further in,
  // and the budget counter needs it to name the call.
  const label = String((variables as { search?: string }).search ?? query);
  const started = Date.now();
  try {
    const res = await $fetch.raw<T>(GITHUB_GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "user-agent": "nuxtathon-leaderboard" },
      body: { query, variables },
    });
    const errors = (res._data as { errors?: { type?: string }[] } | undefined)?.errors;
    recordBudget(res.headers, label, {
      limited: Boolean(errors?.some((e) => e.type === "RATE_LIMITED")),
      ms: Date.now() - started,
    });
    return res._data as T;
  } catch (e) {
    const err = e as { statusCode?: number; response?: { headers?: Headers } };
    recordBudget(err.response?.headers, label, {
      limited: err.statusCode === 403 || err.statusCode === 429,
      status: err.statusCode,
      ms: Date.now() - started,
    });
    throw createError({
      statusCode: 502,
      statusMessage: `GitHub responded ${err.statusCode ?? "error"}`,
    });
  }
}

// Asks GitHub for nothing but the budget, so the counter has numbers even when
// no real query ran since the server started. Costs at most one point.
export async function probeBudget(token: string): Promise<void> {
  await post(token, "query { rateLimit { remaining } }", {});
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

// Merged PRs across every org and repo of a scope. One search per entry rather
// than one OR-ed query: GitHub caps a query at 256 characters and five
// operators, which a longer repo list would hit. They run one after another, not
// as aliases in one request: a page of PRs with commits, co-authors and closing
// issues takes GitHub several seconds, and two of them together came close to
// its ~10 s timeout (measured 8.4 s, and one 502).
export function scopeSearches(scope: EventScope, qualifiers: string): string[] {
  return scopeTargets(scope).map((target) => `${target} ${qualifiers}`);
}

// `pauseMs` spaces the requests out. Next to the hourly points GitHub also
// limits load per minute; a long run such as the registry search (~55 searches)
// passes a pause so it never bunches up, the board's two or three do not need
// one. (What emptied the budget on 2026-09-29 was the hourly points, see
// PR_FIELDS; the pause guards the other limit.)
async function searchPrsAcross(
  token: string,
  searches: string[],
  query: PagedQuery = SEARCH_QUERY,
  pauseMs = 0,
): Promise<{ prs: PrNode[]; counts: { search: string; count: number }[] }> {
  const byRef = new Map<IssueRef, PrNode>();
  const counts: { search: string; count: number }[] = [];
  let first = true;
  const pause = async () => {
    if (!first && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    first = false;
  };
  for (const search of searches) {
    let count = 0;
    let after: string | null = null;
    for (let page = 0; page < MAX_RESULTS / query.pageSize; page++) {
      await pause();
      const { search: result } = (await graphql(token, query.text, { search, after })) as {
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

// Who would get the points if an organizer confirms: the non-core contributors,
// or, when the maintainers opened it alone, the maintainers themselves (that is
// exactly the case the organizer is asked about).
function toReviewItem(
  pr: PrNode,
  ref: IssueRef,
  verdict: ClassifiedPr,
  rules: ScoringRules,
  coreTeam: Set<string>,
): ReviewItem {
  const community = verdict.contributors.filter((l) => !coreTeam.has(l.toLowerCase()));
  const labels = (pr.labels?.nodes ?? []).map((l) => l.name);
  const base = rules.prPoints.enabled ? rules.prPoints.points : 1;
  const v5 = labels.some((l) => l.toLowerCase() === V5_LABEL);
  return {
    ref,
    title: pr.title ?? "",
    author: pr.author?.login ?? "ghost",
    people: community.length ? community : verdict.maintainers,
    reason: verdict.reason,
    maintainers: verdict.maintainers,
    labels,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    suggested: v5 ? base * 2 : base,
  };
}

// Registry modules outside the scope's orgs and repos. They are too many to
// search per recompute, so they are searched in packs: several `repo:`
// qualifiers in one query act as OR (measured: the combined count equals the
// per-repo sum), and GitHub caps a query at 256 characters, which fits ~7 repos.
// 270 foreign repos take ~40 searches. Every hit goes to review, even one that
// closes a qualifying issue: these repos are nobody's here and only searched
// hourly, so nothing from them scores without an organizer.
const MAX_QUERY_LENGTH = 256;
// ~55 searches then take about two minutes instead of thirty seconds. It runs in
// the background, so nobody waits for it.
const REGISTRY_PAUSE_MS = 2000;

export function packRepoSearches(repos: string[], qualifiers: string): string[] {
  const out: string[] = [];
  let pack: string[] = [];
  const query = (list: string[]) => `${list.map((r) => `repo:${r}`).join(" ")} ${qualifiers}`;
  for (const repo of repos) {
    if (pack.length && query([...pack, repo]).length > MAX_QUERY_LENGTH) {
      out.push(query(pack));
      pack = [];
    }
    pack.push(repo);
  }
  if (pack.length) out.push(query(pack));
  return out;
}

// A monorepo PR counts as module work only when it changes the module's folder.
// A PR with more files than GitHub listed and no match among them is kept: the
// organizer can still reject it, while dropping it would hide real work.
function touchesModule(pr: PrNode, paths: Map<string, string>): boolean {
  const ref = refOf(pr);
  const folder = ref ? paths.get(ref.slice(0, ref.lastIndexOf("#"))) : undefined;
  if (!folder || !pr.files) return true;
  const prefix = `${folder}/`;
  if (pr.files.nodes.some((f) => f.path.startsWith(prefix))) return true;
  return pr.files.totalCount > pr.files.nodes.length;
}

export async function fetchRegistryReview(
  token: string,
  config: Pick<EventConfig, "scope" | "qualifyingBefore" | "coreTeam" | "scoring">,
  from: string,
  to: string,
): Promise<{ items: ReviewItem[]; repos: number; searches: number }> {
  const registry = await registryMaintainers();
  if (!registry.ok) {
    throw createError({ statusCode: 502, statusMessage: "The module registry did not answer" });
  }
  const orgs = new Set(config.scope.orgs);
  const listed = new Set(config.scope.repos);
  const repos = [...registry.byRepo.keys()].filter(
    (r) => !orgs.has(r.slice(0, r.indexOf("/"))) && !listed.has(r),
  );
  const qualifiers = `is:pr is:merged created:${toGithubStamp(from)}..${toGithubStamp(to)}`;
  // Monorepos (the registry names a folder) are searched with file lists;
  // everything else is the module, so the lighter query does.
  const mono = repos.filter((r) => registry.paths.has(r));
  const whole = repos.filter((r) => !registry.paths.has(r));
  const monoSearches = packRepoSearches(mono, qualifiers);
  const wholeSearches = packRepoSearches(whole, qualifiers);
  const [{ prs: wholePrs }, { prs: monoPrs }] = [
    await searchPrsAcross(token, wholeSearches, SEARCH_QUERY_SMALL, REGISTRY_PAUSE_MS),
    await searchPrsAcross(token, monoSearches, SEARCH_QUERY_WITH_FILES, REGISTRY_PAUSE_MS),
  ];
  const prs = [...wholePrs, ...monoPrs.filter((pr) => touchesModule(pr, registry.paths))];
  const searches = [...wholeSearches, ...monoSearches];

  const cutoff = Date.parse(config.qualifyingBefore);
  const core = new Set(config.coreTeam.map((l) => l.toLowerCase()));
  const issuePoints = config.scoring.issuePoints.enabled ? config.scoring.issuePoints.points : 1;
  const items: ReviewItem[] = [];
  for (const pr of prs) {
    const ref = refOf(pr);
    if (!ref) continue;
    const verdict = classifyPr(pr, cutoff, core, registry.byRepo);
    if (verdict.path === "ignored") continue;
    // Core team with a qualifying issue would score automatically in scope;
    // here there is no automatic path, and core team is never reviewed.
    if (verdict.path === "auto" && verdict.contributors.every((l) => core.has(l.toLowerCase()))) {
      continue;
    }
    const item = toReviewItem(pr, ref, verdict, config.scoring, core);
    items.push({
      ...item,
      reason: `registry module, ${verdict.reason}`,
      suggested: item.suggested + verdict.qualifying.length * issuePoints,
    });
  }
  return {
    items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    repos: repos.length,
    searches: searches.length,
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
export async function fetchMarkerCredits(
  token: string,
  scope: EventScope,
  from: string,
  to: string,
  keyword: string,
  authors: Set<string>,
): Promise<{ issue: IssueRef; logins: string[]; facts: IssueFacts }[]> {
  // Only issues whose comments contain the marker phrase: the check below still
  // decides (author, time, handles), this just spares fetching every other
  // closed issue with its comments. Quotes in the keyword would end the phrase.
  const phrase = keyword.replace(/"/g, " ").trim();
  // Every org and repo of the scope, one search each like the PR searches.
  const searches = scopeSearches(
    scope,
    `is:issue is:closed closed:${toGithubStamp(from)}..${toGithubStamp(to)} "${phrase}" in:comments`,
  );
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const out: { issue: IssueRef; logins: string[]; facts: IssueFacts }[] = [];
  for (const search of searches) {
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
  // In-scope PRs that need an organizer's decision.
  review: ReviewItem[];
}> {
  const from = window?.from ?? config.startsAt;
  const to = window?.to ?? config.endsAt;
  const cutoff = Date.parse(config.qualifyingBefore);
  const coreSet = new Set((config.coreTeam ?? []).map((l) => l.toLowerCase()));

  // Opened in the window and merged whenever, as in #1, across the whole scope.
  const searches = scopeSearches(
    config.scope,
    `is:pr is:merged created:${toGithubStamp(from)}..${toGithubStamp(to)}`,
  );
  // The PR searches, the marker search and the PR count do not depend on each
  // other, so they run side by side; one after another they took ~23 s for the
  // #1 weekend (measured 2026-09-30), and the first visitor after the cache
  // expires waits for all of it. Pages within one search still follow cursors.
  const markerAuthors = new Set((config.markerAuthors ?? []).map((l) => l.toLowerCase()));
  const markerTo = window?.to ?? new Date().toISOString();
  const markersPending =
    config.closeMarker && markerAuthors.size > 0
      ? fetchMarkerCredits(token, config.scope, from, markerTo, config.closeMarker, markerAuthors)
      : Promise.resolve([]);
  const submittedPending = Promise.all(
    scopeSearches(config.scope, `is:pr created:${toGithubStamp(from)}..${toGithubStamp(to)}`).map(
      (search) => countHumanPrs(token, search),
    ),
  ).then((counts) => counts.reduce((a, b) => a + b, 0));
  // Settle the side runs before anything can throw, so none of them is left
  // as an unhandled rejection when an earlier await fails.
  markersPending.catch(() => undefined);
  submittedPending.catch(() => undefined);

  const [found, registry] = await Promise.all([
    Promise.all(searches.map((search) => searchPrsAcross(token, [search]))),
    registryMaintainers(),
  ]);
  // A PR can only turn up once per search, and searches do not overlap, but a
  // map keeps that an invariant rather than an assumption.
  const prs = [...new Map(found.flatMap((f) => f.prs).map((pr) => [refOf(pr), pr])).values()];

  const byLogin = new Map<string, Tally>();
  const coreByLogin = new Map<string, Tally>();
  // Public headline count: every issue an event PR closed, whenever the issue was
  // created. Scoring below still credits only pre-announcement issues, but the
  // visible counter should tick for anything resolved during the event, including
  // issues opened mid-event (Daniel files a fresh bug, someone fixes it same day).
  const closedInWindow = new Set<IssueRef>();
  const review: ReviewItem[] = [];

  const issueFacts: IssueFactsMap = {};

  for (const pr of prs) {
    const prRef = refOf(pr);
    if (!prRef) continue;
    for (const node of pr.closingIssuesReferences.nodes) {
      const ref = refOf(node);
      if (!ref) continue;
      closedInWindow.add(ref);
      issueFacts[ref] = toIssueFacts(node);
    }
    // Same verdict the admin scope check shows. Only the automatic path scores
    // here; review-path PRs count once an organizer confirms them.
    const verdict = classifyPr(pr, cutoff, coreSet, registry.byRepo);
    if (verdict.path === "review") {
      review.push(toReviewItem(pr, prRef, verdict, config.scoring, coreSet));
      continue;
    }
    if (verdict.path !== "auto") continue;
    const qualifying = verdict.qualifying;
    const credited = new Set(verdict.contributors.map((l) => l.toLowerCase()));

    // Full credit for every credited contributor; issues are deduped per person
    // via the set, so the same issue counts once even across several of their PRs.
    for (const contributor of collectContributors(pr).values()) {
      if (!credited.has(contributor.login.toLowerCase())) continue;
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
  const markers = await markersPending;

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
  // Every PR opened in the window across the scope, merged or not. The searches
  // never overlap (scopeSearches drops repos inside listed orgs), so the counts
  // add up without double counting.
  const submitted = await submittedPending;

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
    review: review.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}
