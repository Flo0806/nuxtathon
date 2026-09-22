import type { ContributionIds, LeaderboardEntry, ManualCredit } from "../types/event";
import type { IssueFactsMap, ScoringRules } from "../types/scoring";
import { scoreFor } from "./scoring";

// Weighted scoring needs to know which issues an entry closed, which lives in
// `contributions`, not on the entry itself. Left out -> one point per issue.
export interface ScoringContext {
  rules: ScoringRules;
  facts: IssueFactsMap;
  contributions: ContributionIds;
}

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
  scoring?: ScoringContext,
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
  for (const e of merged) {
    if (!scoring) {
      e.score = e.closedIssues + e.manualCredits;
      continue;
    }
    const issues = scoring.contributions[e.login]?.issues ?? [];
    e.score = scoreFor(issues, e.mergedPRs, e.manualCredits, scoring.rules, scoring.facts);
  }
  merged.sort(
    (a, b) => b.score - a.score || b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login),
  );
  merged.forEach((e, i) => {
    e.rank = i + 1;
  });
  return merged;
}
