import type { ManualCredit } from "#shared/types/event";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ credits?: ManualCredit[] }>(event);
  const credits: ManualCredit[] = (body?.credits ?? [])
    .filter((c) => c && typeof c.login === "string" && c.login.trim())
    .map((c) => {
      const n = Math.trunc(Number(c.issueNumber));
      return {
        login: c.login.trim(),
        amount: Math.trunc(Number(c.amount)) || 0,
        note: String(c.note ?? ""),
        ...(Number.isInteger(n) && n > 0 ? { issueNumber: n } : {}),
      };
    });

  // Validate every referenced issue before writing anything: all-or-nothing, so a
  // single wrong number blocks the save and names the offender for the admin.
  const numbers = credits.map((c) => c.issueNumber).filter((n): n is number => Boolean(n));
  if (numbers.length > 0) {
    const token = useRuntimeConfig().githubToken;
    if (!token) {
      throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
    }
    const { invalid } = await validateIssues(token, numbers);
    if (invalid.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: `Unknown nuxt/nuxt issue(s): ${invalid.map((n) => `#${n}`).join(", ")}`,
        data: { invalid },
      });
    }
  }

  const state = await readRuntimeState();
  await writeRuntimeState({ ...state, credits });
  await invalidateLeaderboardCache();
  return { credits };
});
