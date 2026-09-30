import { createHash } from "node:crypto";
import type { EventConfig } from "#shared/types/event";
import type { IssueRef } from "#shared/types/issue-ref";
import type { BoardIssue } from "#shared/types/issues";
import { issueRef } from "#shared/utils/issue-ref";
import { githubQuery } from "./github";
import { budgetAllows, budgetNotice } from "./github-budget";
import {
  fetchIssuesByRef,
  fetchRepoBacklog,
  MAX_WATCHED,
  ISSUE_ORG,
  MAX_PAGES,
  PER_PAGE,
  type RestIssue,
  restRef,
  restSearchPage,
  toBoardIssue,
  boardQuery,
} from "./issue-board";

// Flo's list keeps each repo's qualifying backlog in storage and updates it from
// one org-wide "what changed" search, instead of re-reading every viewed repo
// every few minutes. The search budget is 30 requests a minute for the whole
// GitHub account; a full pass over nuxt/* costs ~80 of them, a delta one or two,
// however many repos and people are involved.
//
// Mount "issues" holds only rebuildable data and is deliberately not "cache":
// admin saves clear that mount, which would fire every full load at once.

// The daily full load is the safety net for what a delta cannot see: deleted or
// transferred issues, and links between issues and PRs.
const FULL_EVERY_MS = 24 * 60 * 60 * 1000;
const DELTA_EVERY_MS = 5 * 60 * 1000;
// The search index trails writes by up to a minute. Re-reading a little is
// harmless: applying an issue's current state twice changes nothing.
const DELTA_OVERLAP_MS = 2 * 60 * 1000;

interface RepoStore {
  repo: string;
  cutoff: string;
  // When the full load started, so anything changed during it is still newer.
  fullAt: string;
  issues: BoardIssue[];
  // Qualifying issues the delta saw being closed, newest first. Kept so a watch
  // list can show the outcome without asking GitHub per user.
  closed?: BoardIssue[];
}

interface DeltaState {
  // Start of the last delta that went through.
  since: string;
}

const storage = () => useStorage("issues");

// A new cutoff is a different backlog, so it gets its own entry instead of an
// invalidation step someone could forget.
const storeKey = (repo: string, cutoff: string) =>
  `repo:${createHash("sha1").update(`${repo} ${cutoff}`).digest("hex").slice(0, 16)}`;
const DELTA_KEY = `delta:${ISSUE_ORG}`;

// GitHub's `created:<day` is exclusive and day-based; the delta applies the same
// rule itself, so both paths agree on which issues qualify.
function cutoffDay(config: Pick<EventConfig, "qualifyingBefore">): string {
  const cutoff = new Date(config.qualifyingBefore);
  return Number.isFinite(cutoff.getTime()) ? cutoff.toISOString().slice(0, 10) : "";
}

const repoOf = (ref: IssueRef) => ref.slice(0, ref.lastIndexOf("#"));

const stamp = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// One request per key at a time. Two visitors opening a cold repo must not both
// pay for its full load.
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, task: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const started = task().finally(() => inflight.delete(key));
  inflight.set(key, started);
  return started;
}

export interface SyncedBoard {
  issues: BoardIssue[];
  // How current the list is: the newer of its full load and the last delta.
  syncedAt: string;
  // GitHub failed and this is the last list that loaded.
  stale: boolean;
}

export async function readIssueBoard(
  token: string,
  config: Pick<EventConfig, "qualifyingBefore">,
  repo: string,
): Promise<SyncedBoard> {
  const cutoff = cutoffDay(config);
  const key = storeKey(repo, cutoff);
  let stale = false;
  // With the budget low the list lives on what it stored; the board comes first.
  const mayAsk = budgetAllows("flos-list");

  // Delta first: it may decide that every store has to start over, and this
  // request should then already get the reloaded list, not the expired one.
  let since: string | null = null;
  if (mayAsk) {
    try {
      since = await once(DELTA_KEY, () => syncDelta(token, cutoff));
    } catch (e) {
      console.error("[issues] delta sync failed, serving the stored list:", e);
      stale = true;
    }
  } else {
    stale = true;
  }

  let store = await storage().getItem<RepoStore>(key);
  if (mayAsk && (!store || Date.now() - Date.parse(store.fullAt) > FULL_EVERY_MS)) {
    try {
      store = await once(key, () => fullLoad(token, config, repo, cutoff, key));
    } catch (e) {
      // Nothing stored means nothing to show; otherwise yesterday's list beats
      // an error page.
      if (!store) throw e;
      console.error(`[issues] full load of ${repo} failed, serving the stored list:`, e);
      stale = true;
    }
  }

  // Only reachable without a list when the budget kept us from loading one.
  if (!store) {
    throw createError({ statusCode: 429, statusMessage: `${budgetNotice()}, try again later` });
  }
  const syncedAt = since && Date.parse(since) > Date.parse(store.fullAt) ? since : store.fullAt;
  return { issues: store.issues, syncedAt, stale };
}

async function fullLoad(
  token: string,
  config: Pick<EventConfig, "qualifyingBefore">,
  repo: string,
  cutoff: string,
  key: string,
): Promise<RepoStore> {
  const fullAt = new Date().toISOString();
  const issues = await fetchRepoBacklog(token, boardQuery(config, repo));
  const store: RepoStore = { repo, cutoff, fullAt, issues };
  await storage().setItem(key, store);
  return store;
}

// Applies everything in the org that changed since the last run to the repos
// that have a store: issue changes from the REST search, new PR links from
// GraphQL. Both must go through before `since` moves, so a failure is retried. Runs at most every DELTA_EVERY_MS; returns the time the
// stores are current as of.
async function syncDelta(token: string, cutoff: string): Promise<string> {
  const now = Date.now();
  const state = await storage().getItem<DeltaState>(DELTA_KEY);
  if (!state) {
    // First run: every store was just full-loaded, so they are current now.
    await storage().setItem(DELTA_KEY, { since: stamp(now) });
    return stamp(now);
  }
  if (now - Date.parse(state.since) < DELTA_EVERY_MS) return state.since;

  // After a long pause the delta would be as expensive as the full loads it is
  // meant to replace, and could exceed what one search returns. Starting over
  // is cheaper and cannot miss anything.
  if (now - Date.parse(state.since) > FULL_EVERY_MS) {
    await expireAllStores();
    await storage().setItem(DELTA_KEY, { since: stamp(now) });
    return stamp(now);
  }

  const from = stamp(Date.parse(state.since) - DELTA_OVERLAP_MS);
  const q = `org:${ISSUE_ORG} is:issue updated:>${from}`;
  const changed: RestIssue[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { total_count, items } = await restSearchPage(token, q, page);
    if (total_count > MAX_PAGES * PER_PAGE) {
      await expireAllStores();
      await storage().setItem(DELTA_KEY, { since: stamp(now) });
      return stamp(now);
    }
    changed.push(...items);
    if (items.length < PER_PAGE) break;
  }

  const linked = await fetchNewlyLinked(token, from);

  const byRepo = new Map<string, RestIssue[]>();
  for (const item of changed) {
    const ref = restRef(item);
    if (!ref) continue;
    byRepo.set(repoOf(ref), [...(byRepo.get(repoOf(ref)) ?? []), item]);
  }
  const touched = new Set([...byRepo.keys(), ...[...linked].map(repoOf)]);
  const before = Date.parse(`${cutoff}T00:00:00Z`);
  for (const repo of touched) {
    const key = storeKey(repo, cutoff);
    const store = await storage().getItem<RepoStore>(key);
    if (!store) continue;
    const { issues, closed } = applyChanges(store, byRepo.get(repo) ?? [], before);
    await storage().setItem(key, {
      ...store,
      issues: issues.map((i) => (!i.hasPr && linked.has(i.ref) ? { ...i, hasPr: true } : i)),
      closed,
    });
  }

  await storage().setItem(DELTA_KEY, { since: stamp(now) });
  return stamp(now);
}

// Linking a PR to an issue does not touch the issue's `updated_at` (checked
// against the timeline), so the issue delta never sees it. The PR side does
// change, so this asks which issues the recently updated PRs close. GraphQL
// because the REST search cannot return closing references; one point a page.
async function fetchNewlyLinked(token: string, from: string): Promise<Set<IssueRef>> {
  interface Page {
    search: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        closingIssuesReferences?: {
          nodes: { number: number; repository: { nameWithOwner: string } }[];
        };
      }[];
    };
  }
  const q = `org:${ISSUE_ORG} is:pr updated:>${from}`;
  const linked = new Set<IssueRef>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: Page = await githubQuery<Page>(
      token,
      `query {
        search(type: ISSUE, first: 100, after: ${JSON.stringify(after)}, query: ${JSON.stringify(q)}) {
          pageInfo { hasNextPage endCursor }
          nodes { ... on PullRequest {
            closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } }
          } }
        }
      }`,
    );
    for (const pr of res.search.nodes) {
      for (const n of pr.closingIssuesReferences?.nodes ?? []) {
        const ref = issueRef(n.repository.nameWithOwner, n.number);
        if (ref) linked.add(ref);
      }
    }
    if (!res.search.pageInfo.hasNextPage) break;
    after = res.search.pageInfo.endCursor;
  }
  return linked;
}

// An issue stays or enters when it is open and was created before the cutoff;
// anything else (closed, or never qualifying) leaves. `hasPr` is kept from the
// stored row: the issue search cannot tell, and the full load refreshes it. A
// qualifying issue that closed moves to `closed`, a reopened one moves back.
const MAX_CLOSED = 500;
function applyChanges(
  store: RepoStore,
  items: RestIssue[],
  before: number,
): { issues: BoardIssue[]; closed: BoardIssue[] } {
  const open = new Map(store.issues.map((i) => [i.ref, i]));
  const closed = new Map((store.closed ?? []).map((i) => [i.ref, i]));
  for (const item of items) {
    const ref = restRef(item);
    if (!ref) continue;
    const early = !Number.isFinite(before) || Date.parse(item.created_at) < before;
    const hasPr = open.get(ref)?.hasPr ?? closed.get(ref)?.hasPr ?? false;
    open.delete(ref);
    closed.delete(ref);
    if (!early) continue;
    if (item.state === "open") open.set(ref, toBoardIssue(item, ref, hasPr));
    else closed.set(ref, { ...toBoardIssue(item, ref, hasPr), closed: true });
  }
  return {
    issues: [...open.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    closed: [...closed.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_CLOSED),
  };
}

// Watched issues the selected repo's list does not contain: open ones in other
// repos, and closed ones. Answered from the stored backlogs where possible; the
// rest (repos nobody opened yet, issues closed before a store existed, issues
// outside the cutoff) is looked up on GitHub and cached per issue for everyone,
// so the cost follows the distinct issues, not the number of people watching.
const WATCHED_OPEN_TTL_MS = 5 * 60 * 1000;
const WATCHED_CLOSED_TTL_MS = 60 * 60 * 1000;
const watchedKey = (ref: IssueRef) =>
  `watched:${createHash("sha1").update(ref).digest("hex").slice(0, 16)}`;

export async function resolveWatched(
  token: string,
  config: Pick<EventConfig, "qualifyingBefore">,
  refs: IssueRef[],
): Promise<BoardIssue[]> {
  const cutoff = cutoffDay(config);
  const found = new Map<IssueRef, BoardIssue>();
  const wanted = new Set(refs);

  for (const repo of new Set(refs.map(repoOf))) {
    const store = await storage().getItem<RepoStore>(storeKey(repo, cutoff));
    // An expired store has missed changes; better to ask GitHub than to show
    // an outcome that may be wrong.
    if (!store || Date.now() - Date.parse(store.fullAt) > FULL_EVERY_MS) continue;
    for (const i of [...store.issues, ...(store.closed ?? [])]) {
      if (wanted.has(i.ref)) found.set(i.ref, i);
    }
  }

  const missing: IssueRef[] = [];
  for (const ref of refs) {
    if (found.has(ref)) continue;
    const hit = await storage().getItem<{ at: number; issue: BoardIssue | null }>(watchedKey(ref));
    const ttl = hit?.issue?.closed ? WATCHED_CLOSED_TTL_MS : WATCHED_OPEN_TTL_MS;
    if (hit && Date.now() - hit.at < ttl) {
      if (hit.issue) found.set(ref, hit.issue);
    } else {
      missing.push(ref);
    }
  }

  // Unknown issues cost a lookup each; with the budget low they wait.
  if (!budgetAllows("flos-list")) missing.length = 0;
  for (let i = 0; i < missing.length; i += MAX_WATCHED) {
    const chunk = missing.slice(i, i + MAX_WATCHED);
    const fetched = new Map((await fetchIssuesByRef(token, chunk)).map((b) => [b.ref, b]));
    const at = Date.now();
    for (const ref of chunk) {
      // A miss (deleted, transferred, typo) is cached too, or it would be asked
      // for on every poll.
      const issue = fetched.get(ref) ?? null;
      await storage().setItem(watchedKey(ref), { at, issue });
      if (issue) found.set(ref, issue);
    }
  }

  return refs.flatMap((r) => {
    const issue = found.get(r);
    return issue ? [issue] : [];
  });
}

async function expireAllStores(): Promise<void> {
  for (const key of await storage().getKeys("repo")) {
    const store = await storage().getItem<RepoStore>(key);
    if (store) await storage().setItem(key, { ...store, fullAt: new Date(0).toISOString() });
  }
}
