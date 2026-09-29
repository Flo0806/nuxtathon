import type { IssueBoard } from "#shared/types/issues";
import { HOME_REPO } from "#shared/utils/issue-ref";

// The board plus this user's watch state. Logged in only: the list is a working
// aid for contributors, and it keeps the GitHub budget for people who use it.
export default defineEventHandler(async (event): Promise<IssueBoard> => {
  const { user } = await requireUserSession(event);
  const token = useRuntimeConfig().githubToken;
  if (!token) throw createError({ statusCode: 503, statusMessage: "GitHub token is not set" });

  const config = await resolveEventConfig();
  // Only repos from the list may be searched: the parameter ends up in a GitHub
  // query, and the list is what the dropdown offers anyway. If the list cannot be
  // loaded the core repo still works.
  const repos = await fetchIssueRepos(token).catch(() => [HOME_REPO]);
  const repo = String(getQuery(event).repo ?? HOME_REPO).toLowerCase();
  if (!repos.includes(repo)) {
    throw createError({ statusCode: 422, statusMessage: `Not a repo on this list: ${repo}` });
  }
  const issues = await fetchIssueBoard(token, boardQuery(config, repo));
  const { watching, seen } = await readWatch(user.login);

  // Anything on the watch list that this search does not return lives in another
  // repo, was closed, or stopped qualifying. Fetched separately so the watch
  // column shows every watched issue whichever repo is selected, and a closed one
  // stays visible instead of silently disappearing.
  const open = new Set(issues.map((i) => i.ref));
  const gone = watching.filter((r) => !open.has(r));
  const watchedExtra = gone.length > 0 ? await fetchClosedWatched(token, gone).catch(() => []) : [];

  const cutoff = new Date(config.qualifyingBefore);
  return {
    fetchedAt: new Date().toISOString(),
    repo,
    repos,
    createdBefore: Number.isFinite(cutoff.getTime()) ? cutoff.toISOString().slice(0, 10) : "",
    issues,
    watchedExtra,
    watching,
    seen,
  };
});
