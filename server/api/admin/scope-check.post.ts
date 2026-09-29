import { scopeSummary } from "#shared/utils/scope";
import { budgetAllows, budgetNotice } from "../../utils/github-budget";

// Runs the saved scope against a window and lists what it finds. Every call hits
// GitHub live, so the window is capped: a week covers any event with room to
// spare, and anything longer only burns the search budget.
const MAX_SPAN_MS = 7 * 24 * 60 * 60 * 1000;

export default defineEventHandler(async (event) => {
  const token = useRuntimeConfig().githubToken;
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
  }

  const body = await readBody<{ from?: string; to?: string }>(event);
  const from = Date.parse(String(body?.from ?? ""));
  const to = Date.parse(String(body?.to ?? ""));
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw createError({ statusCode: 422, statusMessage: "Pick a start and an end date" });
  }
  if (to <= from) {
    throw createError({ statusCode: 422, statusMessage: "The end must be after the start" });
  }
  if (to - from > MAX_SPAN_MS) {
    throw createError({ statusCode: 422, statusMessage: "At most 7 days per check" });
  }

  // A check is optional; it must not eat the budget the board lives on.
  if (!budgetAllows("extras")) {
    throw createError({ statusCode: 429, statusMessage: `${budgetNotice()}, try again later` });
  }
  const config = await resolveEventConfig();
  const started = Date.now();
  const result = await scopeCheck(
    token,
    config,
    new Date(from).toISOString(),
    new Date(to).toISOString(),
  );
  return {
    scope: config.scope,
    summary: scopeSummary(config.scope),
    ms: Date.now() - started,
    ...result,
  };
});
