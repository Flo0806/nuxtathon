import { issueSearchUrl, untouchedSearchQuery, issueSearchQuery } from "#shared/utils/issue-search";

// Sends a contributor straight to an issue they could pick up. Default is the
// useful variant from issue #5: nothing linked, nobody assigned. `?scope=all`
// drops that filter. Falls back to the search page rather than erroring, so the
// button never dead-ends.
export default defineEventHandler(async (event) => {
  const config = await resolveEventConfig();
  const all = getQuery(event).scope === "all";
  const query = all ? issueSearchQuery(config) : untouchedSearchQuery(config);
  const fallback = issueSearchUrl(config);

  const token = useRuntimeConfig().githubToken;
  if (!token) return sendRedirect(event, fallback, 302);

  // A failure here must not break the button, but it should be visible: GitHub's
  // search API has a secondary rate limit that a burst can trip.
  const pool = await issuePool(token, query).catch((e) => {
    console.error("[pick-issue] search failed, falling back to the search page:", e);
    return [] as { html_url: string }[];
  });
  const hit = pool[Math.floor(Math.random() * pool.length)];
  // Never cached: the whole point is a different issue on every click.
  setResponseHeader(event, "cache-control", "no-store");
  return sendRedirect(event, hit?.html_url ?? fallback, 302);
});
