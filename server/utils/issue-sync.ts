import { createHash } from "node:crypto";
import type { EventConfig } from "#shared/types/event";
import type { BoardIssue } from "#shared/types/issues";
import {
  fetchRepoBacklog,
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

  // Delta first: it may decide that every store has to start over, and this
  // request should then already get the reloaded list, not the expired one.
  let since: string | null = null;
  try {
    since = await once(DELTA_KEY, () => syncDelta(token, cutoff));
  } catch (e) {
    console.error("[issues] delta sync failed, serving the stored list:", e);
    stale = true;
  }

  let store = await storage().getItem<RepoStore>(key);
  if (!store || Date.now() - Date.parse(store.fullAt) > FULL_EVERY_MS) {
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
// that have a store. Runs at most every DELTA_EVERY_MS; returns the time the
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

  const q = `org:${ISSUE_ORG} is:issue updated:>${stamp(Date.parse(state.since) - DELTA_OVERLAP_MS)}`;
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

  const byRepo = new Map<string, RestIssue[]>();
  for (const item of changed) {
    const ref = restRef(item);
    if (!ref) continue;
    const repo = ref.slice(0, ref.lastIndexOf("#"));
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), item]);
  }
  const before = Date.parse(`${cutoff}T00:00:00Z`);
  for (const [repo, items] of byRepo) {
    const key = storeKey(repo, cutoff);
    const store = await storage().getItem<RepoStore>(key);
    if (!store) continue;
    await storage().setItem(key, { ...store, issues: applyChanges(store.issues, items, before) });
  }

  await storage().setItem(DELTA_KEY, { since: stamp(now) });
  return stamp(now);
}

// An issue stays or enters when it is open and was created before the cutoff;
// anything else (closed, or never qualifying) leaves. `hasPr` is kept from the
// stored row: the issue search cannot tell, and the full load refreshes it.
function applyChanges(issues: BoardIssue[], items: RestIssue[], before: number): BoardIssue[] {
  const byRef = new Map(issues.map((i) => [i.ref, i]));
  for (const item of items) {
    const ref = restRef(item);
    if (!ref) continue;
    const qualifies =
      item.state === "open" && (!Number.isFinite(before) || Date.parse(item.created_at) < before);
    if (qualifies) byRef.set(ref, toBoardIssue(item, ref, byRef.get(ref)?.hasPr ?? false));
    else byRef.delete(ref);
  }
  return [...byRef.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function expireAllStores(): Promise<void> {
  for (const key of await storage().getKeys("repo")) {
    const store = await storage().getItem<RepoStore>(key);
    if (store) await storage().setItem(key, { ...store, fullAt: new Date(0).toISOString() });
  }
}
