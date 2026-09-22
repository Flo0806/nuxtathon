// Self-documenting index, so a consumer can discover the surface without docs.
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=3600",
  });
  const base = `${apiSiteUrl()}/api/v1`;
  return {
    version: 1,
    docs: "https://github.com/Flo0806/nuxtathon#public-api",
    endpoints: {
      summary: `${base}/summary`,
      event: `${base}/event`,
      leaderboard: `${base}/leaderboard?limit=50&include=contributions`,
      archive: `${base}/archive`,
      archivedEvent: `${base}/archive/{slug}`,
      user: `${base}/users/{login}`,
    },
  };
});
