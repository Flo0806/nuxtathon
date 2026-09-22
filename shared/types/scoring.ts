// Per-event scoring configuration. Every rule is off by default, so an empty
// block scores exactly like the original event: one point per qualifying closed
// issue, plus manual credits. Locked once the event starts (see settingsLock).
//
// Everything adds up, nothing multiplies:
//   points per issue = base + age bonus + label bonuses + upvote bonus
export interface ScoringRules {
  // Overrides the implicit 1 point per qualifying closed issue.
  issuePoints: { enabled: boolean; points: number };
  // Points for a merged PR itself, on top of whatever issues it closed.
  prPoints: { enabled: boolean; points: number };
  // Backlog incentive: an issue older than `afterMonths` is worth extra points.
  ageBonus: { enabled: boolean; afterMonths: number; points: number };
  // Extra points per label. Several matching labels add up.
  labelBonus: { enabled: boolean; points: Record<string, number> };
  // Community demand: every `per` thumbs-up on the issue adds `points`.
  upvoteBonus: { enabled: boolean; per: number; points: number };
}

export const DEFAULT_SCORING: ScoringRules = {
  issuePoints: { enabled: false, points: 1 },
  prPoints: { enabled: false, points: 1 },
  ageBonus: { enabled: false, afterMonths: 12, points: 1 },
  labelBonus: { enabled: false, points: {} },
  upvoteBonus: { enabled: false, per: 25, points: 1 },
};

// What scoring needs to know about one closed issue. Collected while fetching.
export interface IssueFacts {
  createdAt: string;
  labels: string[];
  upvotes: number;
}
export type IssueFactsMap = Record<number, IssueFacts>;
