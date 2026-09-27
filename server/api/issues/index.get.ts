import type { IssueBoard } from "#shared/types/issues";

// The board plus this user's watch state. Logged in only: the list is a working
// aid for contributors, and it keeps the GitHub budget for people who use it.
export default defineEventHandler(async (event): Promise<IssueBoard> => {
  const { user } = await requireUserSession(event);
  const token = useRuntimeConfig().githubToken;
  if (!token) throw createError({ statusCode: 503, statusMessage: "GitHub token is not set" });

  const config = await resolveEventConfig();
  const issues = await fetchIssueBoard(token, boardQuery(config));
  const { watching, seen } = await readWatch(user.login);

  // Anything on the watch list that the open search no longer returns was closed
  // or stopped qualifying. Fetched separately so the outcome stays visible in
  // the watch column instead of the row silently disappearing.
  const open = new Set(issues.map((i) => i.number));
  const gone = watching.filter((n) => !open.has(n));
  const closed = gone.length > 0 ? await fetchClosedWatched(token, gone).catch(() => []) : [];

  return { fetchedAt: new Date().toISOString(), issues: [...issues, ...closed], watching, seen };
});
