import { budgetAllows, budgetNotice } from "../../utils/github-budget";
import { scanRegistry } from "../../utils/review";

// "Search now" for registry modules. Starts the search and returns at once: with
// the pauses between searches it takes about two minutes, longer than a reverse
// proxy waits for a response. The review page polls until it is done. A click
// within the cooldown (see scanRegistry) changes nothing.
export default defineEventHandler(async () => {
  const token = useRuntimeConfig().githubToken;
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
  }
  const config = await resolveEventConfig();
  if (!config.scope.registry) {
    throw createError({ statusCode: 409, statusMessage: "Registry modules are not in scope" });
  }
  if (Date.now() < Date.parse(config.startsAt)) {
    throw createError({ statusCode: 409, statusMessage: "The event has not started yet" });
  }
  if (!budgetAllows("extras")) {
    throw createError({ statusCode: 429, statusMessage: `${budgetNotice()}, the search waits` });
  }
  const { started, done } = await scanRegistry(token, config, true);
  done.catch((e) => console.error("[review] manual registry scan failed:", e));
  return { running: started };
});
