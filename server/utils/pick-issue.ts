// GitHub's search API caps out at 1000 results, so a random offset can only
// reach that far. A page of 100 is plenty of variety for one button.
const PER_PAGE = 100;
const MAX_REACHABLE = 1000;

interface SearchHit {
  html_url: string;
}

// One page of candidates, cached so repeated clicks cost nothing: the pick
// itself stays random per request, only the pool is reused. The page offset is
// rolled per refresh, so the pool moves through the backlog over time.
export const issuePool = defineCachedFunction(
  async (token: string, query: string): Promise<SearchHit[]> => {
    // Page one carries the total as well, so a small backlog costs one request.
    const first = await searchIssues(token, query, PER_PAGE, 1);
    const pages = Math.ceil(Math.min(first.total_count, MAX_REACHABLE) / PER_PAGE);
    const page = pages > 1 ? 1 + Math.floor(Math.random() * pages) : 1;
    if (page === 1) return first.items;

    const { items } = await searchIssues(token, query, PER_PAGE, page);
    // The total is an estimate, so a page near the end can come back empty.
    return items.length > 0 ? items : first.items;
  },
  { maxAge: 300, name: "issue-pool", getKey: (_token, query) => query },
);

async function searchIssues(
  token: string,
  q: string,
  perPage: number,
  page: number,
): Promise<{ total_count: number; items: SearchHit[] }> {
  try {
    return await $fetch("https://api.github.com/search/issues", {
      query: { q, per_page: perPage, page, sort: "updated", order: "desc" },
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "nuxtathon-leaderboard",
      },
    });
  } catch (e) {
    // Same rule as the GraphQL helper: never pass GitHub's status through, or a
    // 401 from a bad token reads as our own auth failing.
    const status = (e as { statusCode?: number }).statusCode;
    throw createError({ statusCode: 502, statusMessage: `GitHub responded ${status ?? "error"}` });
  }
}
