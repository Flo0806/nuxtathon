// Static, committed event configuration (source: config/event.json).
export interface EventConfig {
  title: string;
  // Short kicker above the title, e.g. "#1 · Community Hackathon".
  eyebrow: string;
  // Markdown. Rendered on the public site.
  description: string;
  // Short qualification rules shown under the intro (Markdown, inline). Empty
  // hides the block, so this doubles as the on/off flag.
  rules: string[];
  // Absolute UTC instants. Timezone is a display concern only (see displayTimeZone).
  startsAt: string;
  endsAt: string;
  // Rule cutoff: an issue only qualifies if it was created before this instant.
  qualifyingBefore: string;
  // GitHub logins excluded from the prize ranking (organizers / core team).
  // Their contributions are still tallied and shown separately.
  coreTeam: string[];
  // Comment marker that lets an organizer credit a PR-less close, e.g. a comment
  // "nuxtathon closed @user". Keyword is matched case-insensitively; empty
  // disables the feature. Only comments by markerAuthors are honored.
  closeMarker: string;
  // Logins allowed to post the marker. Keep this tight (organizers only) so
  // credits cannot be farmed by self-mentioning under any closed issue.
  markerAuthors: string[];
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

// Window-wide activity counters shown alongside the ranking.
export interface EventStats {
  submitted: number;
  merged: number;
  issuesClosed: number;
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
  // Optional nuxt/nuxt issue this credit stands for. Validated on save; when set,
  // it folds into the public "Issues closed" count (deduped against PR-closed).
  issueNumber?: number;
}

// A frozen event result. Written on "fire" and kept so the ranking stops moving
// as PRs keep merging after the event.
export interface FinalResult {
  finalizedAt: string;
  title: string;
  startsAt: string;
  endsAt: string;
  stats: EventStats;
  standings: LeaderboardEntry[];
  coreTeam: LeaderboardEntry[];
}

// Mutable, admin-writable state. Snapshots live under a separate storage key
// (written by the leaderboard handler) so they never clobber these fields.
export interface RuntimeState {
  prizesReleased: boolean;
  credits: ManualCredit[];
  // Set once the event is fired; the public view then serves this, not GitHub.
  final: FinalResult | null;
  // Past finalized events, retained across resets.
  archive: FinalResult[];
}
