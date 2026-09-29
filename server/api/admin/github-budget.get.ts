// GitHub budget for the admin. `?probe=1` asks GitHub once when nothing has
// been recorded yet (a fresh server has no numbers until its first query).
export default defineEventHandler(async (event) => {
  const token = useRuntimeConfig().githubToken;
  if (getQuery(event).probe && token) await probeBudget(token).catch(() => undefined);
  return budgetSnapshot();
});
