import type { IssueFacts, IssueFactsMap, ScoringRules } from "../types/scoring";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Points one closed issue is worth: base plus every bonus that applies. Purely
// additive, so a number in the admin form is the number of points it grants.
export function issueScore(
  facts: IssueFacts | undefined,
  rules: ScoringRules,
  now: number = Date.now(),
): number {
  let points = rules.issuePoints.enabled ? rules.issuePoints.points : 1;

  if (rules.ageBonus.enabled && facts) {
    const age = now - Date.parse(facts.createdAt);
    if (Number.isFinite(age) && age >= rules.ageBonus.afterMonths * MONTH_MS) {
      points += rules.ageBonus.points;
    }
  }

  if (rules.labelBonus.enabled && facts?.labels.length) {
    const lower = new Map(
      Object.entries(rules.labelBonus.points).map(([k, v]) => [k.toLowerCase(), v]),
    );
    for (const label of facts.labels) points += lower.get(label.toLowerCase()) ?? 0;
  }

  if (rules.upvoteBonus.enabled && facts && rules.upvoteBonus.per > 0) {
    points += Math.floor(facts.upvotes / rules.upvoteBonus.per) * rules.upvoteBonus.points;
  }

  return points;
}

// Total for one contributor. `manualCredits` are discretionary points and are
// never weighted: the organizer already decided what they are worth.
export function scoreFor(
  issues: number[],
  mergedPrs: number,
  manualCredits: number,
  rules: ScoringRules,
  facts: IssueFactsMap,
  now: number = Date.now(),
): number {
  let total = issues.reduce((sum, n) => sum + issueScore(facts[n], rules, now), 0);
  if (rules.prPoints.enabled) total += mergedPrs * rules.prPoints.points;
  total += manualCredits;
  // Two decimals keep fractional bonuses usable without float noise.
  return Math.round(total * 100) / 100;
}

// True when nothing is switched on, i.e. the score is just "issues + credits".
export const isDefaultScoring = (rules: ScoringRules): boolean =>
  !rules.issuePoints.enabled &&
  !rules.prPoints.enabled &&
  !rules.ageBonus.enabled &&
  !rules.labelBonus.enabled &&
  !rules.upvoteBonus.enabled;

// One line per active rule, for the admin hint and the public rules block.
export function scoringSummary(rules: ScoringRules): string[] {
  if (isDefaultScoring(rules)) return ["Every closed issue counts 1 point."];
  const out: string[] = [];
  const pts = (n: number) => `${n} ${Math.abs(n) === 1 ? "point" : "points"}`;
  out.push(
    `Every closed issue counts ${pts(rules.issuePoints.enabled ? rules.issuePoints.points : 1)}.`,
  );
  if (rules.ageBonus.enabled) {
    out.push(
      `Issues older than ${rules.ageBonus.afterMonths} months add ${pts(rules.ageBonus.points)}.`,
    );
  }
  if (rules.labelBonus.enabled) {
    const parts = Object.entries(rules.labelBonus.points).map(
      ([l, p]) => `${l} ${p < 0 ? p : `+${p}`}`,
    );
    if (parts.length) out.push(`Labels add on top: ${parts.join(", ")}.`);
  }
  if (rules.upvoteBonus.enabled) {
    out.push(
      `Every ${rules.upvoteBonus.per} thumbs-up on an issue adds ${pts(rules.upvoteBonus.points)}.`,
    );
  }
  if (rules.prPoints.enabled) out.push(`Every merged PR adds ${pts(rules.prPoints.points)}.`);
  return out;
}
