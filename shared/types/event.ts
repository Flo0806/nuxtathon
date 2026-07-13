// Static, committed event configuration (source: config/event.json).
export interface EventConfig {
  title: string;
  // Markdown. Rendered on the public site.
  description: string;
  // Absolute UTC instants. Timezone is a display concern only (see displayTimeZone).
  startsAt: string;
  endsAt: string;
  // Rule cutoff: an issue only qualifies if it was created before this instant.
  qualifyingBefore: string;
  // IANA zone used purely for rendering dates and the countdown, e.g. "UTC".
  displayTimeZone: string;
}

// Coarse lifecycle that drives what the public site shows.
export type EventPhase = "upcoming" | "live" | "evaluating" | "results";

export interface LeaderboardEntry {
  login: string;
  name: string | null;
  avatarUrl: string;
  // Qualifying issues closed by merged PRs. This is the ranking metric.
  closedIssues: number;
  // Secondary stat shown next to the rank.
  mergedPRs: number;
  // Credits added by the admin for issues closed without a PR.
  manualCredits: number;
  // closedIssues + manualCredits.
  score: number;
  rank: number;
}

// One frozen ranking order, retained so the client can replay recent reshuffles
// as the load-time animation.
export interface Snapshot {
  takenAt: string;
  // Logins in rank order, top first.
  order: string[];
}

export interface ManualCredit {
  login: string;
  amount: number;
  note: string;
}

// Mutable, admin-writable state. Lives in KV, never in the repo.
export interface RuntimeState {
  prizesReleased: boolean;
  credits: ManualCredit[];
  snapshots: Snapshot[];
}
