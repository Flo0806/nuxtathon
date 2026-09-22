// `If-None-Match` is not a CORS-safelisted header, so a browser preflights any
// conditional request. Without this the ETag path would only work server side.
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "If-None-Match, Accept",
    "access-control-max-age": "86400",
  });
  setResponseStatus(event, 204);
  return null;
});
