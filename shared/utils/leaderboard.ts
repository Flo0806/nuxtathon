import type { LeaderboardEntry, ManualCredit } from "../types/event";

// Merge admin credits into the GitHub-derived ranking, then re-sort and re-rank.
// A credit for a login not in the list (issue closed without a PR) becomes a new
// entry; its avatar comes from the github.com/<login>.png redirect.
//
// `alreadyClosed` holds issue numbers already credited by a PR or an organizer
// marker. A manual credit pointing at one of those is dropped, so the same issue
// cannot be scored twice via two mechanisms. Credits without an issueNumber (pure
// discretionary points) always apply.
export function applyCredits(
  entries: LeaderboardEntry[],
  credits: ManualCredit[],
  alreadyClosed: Set<number> = new Set(),
): LeaderboardEntry[] {
  // Keyed by lowercased login so a manual credit for "norbiros" merges into an
  // existing "Norbiros" entry instead of splitting the person in two.
  const byLogin = new Map(entries.map((e) => [e.login.toLowerCase(), { ...e }]));

  for (const credit of credits) {
    if (credit.issueNumber && alreadyClosed.has(credit.issueNumber)) continue;
    const key = credit.login.toLowerCase();
    const existing = byLogin.get(key);
    if (existing) {
      existing.manualCredits += credit.amount;
    } else {
      byLogin.set(key, {
        login: credit.login,
        name: null,
        avatarUrl: `https://github.com/${credit.login}.png?size=80`,
        closedIssues: 0,
        mergedPRs: 0,
        manualCredits: credit.amount,
        score: 0,
        rank: 0,
      });
    }
  }

  const merged = [...byLogin.values()];
  for (const e of merged) e.score = e.closedIssues + e.manualCredits;
  merged.sort(
    (a, b) => b.score - a.score || b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login),
  );
  merged.forEach((e, i) => {
    e.rank = i + 1;
  });
  return merged;
}
