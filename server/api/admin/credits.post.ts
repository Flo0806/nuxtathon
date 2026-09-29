import type { ManualCredit } from "#shared/types/event";
import { issueRefLabel, normalizeCreditIssue } from "#shared/utils/issue-ref";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ credits?: (ManualCredit & { issueNumber?: unknown })[] }>(event);
  const raw = (body?.credits ?? []).filter((c) => c && typeof c.login === "string" && c.login.trim());

  // The issue field accepts "123", "#123", "owner/repo#123" or a GitHub URL. Text
  // that is none of those is rejected here rather than silently dropped, which
  // would save a credit that no longer points where the admin meant.
  const unreadable = raw
    .filter((c) => String(c.issue ?? c.issueNumber ?? "").trim() && !normalizeCreditIssue(c))
    .map((c) => String(c.issue ?? c.issueNumber));
  if (unreadable.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Not an issue: ${unreadable.join(", ")}`,
      data: { invalid: unreadable },
    });
  }

  const credits: ManualCredit[] = raw.map((c) => {
    const issue = normalizeCreditIssue(c);
    return {
      login: c.login.trim(),
      amount: Math.trunc(Number(c.amount)) || 0,
      note: String(c.note ?? ""),
      ...(issue ? { issue } : {}),
    };
  });

  // Validate every referenced issue before writing anything: all-or-nothing, so a
  // single wrong number blocks the save and names the offender for the admin.
  const refs = credits.flatMap((c) => (c.issue ? [c.issue] : []));
  if (refs.length > 0) {
    const token = useRuntimeConfig().githubToken;
    if (!token) {
      throw createError({ statusCode: 400, statusMessage: "NUXT_GITHUB_TOKEN is not set" });
    }
    const { invalid } = await validateIssues(token, refs);
    if (invalid.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: `Unknown issue(s): ${invalid.map((r) => issueRefLabel(r)).join(", ")}`,
        data: { invalid },
      });
    }
  }

  const state = await readRuntimeState();
  await writeRuntimeState({ ...state, credits });
  await invalidateLeaderboardCache();
  return { credits };
});
