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
  // Their contributions are still tallied and shown separately. ORGANIZER_LOGIN
  // is pinned in by resolveEventConfig regardless of settings.
  coreTeam: string[];
  // Comment marker that lets an organizer credit a PR-less close, e.g. a comment
  // "nuxtathon closed @user". Keyword is matched case-insensitively; empty
  // disables the feature. Only comments by markerAuthors are honored.
  closeMarker: string;
  // Logins allowed to post the marker. Keep this tight (organizers only) so
  // credits cannot be farmed by self-mentioning under any closed issue.
  // ORGANIZER_LOGIN is pinned in by resolveEventConfig regardless of settings.
  markerAuthors: string[];
  // IANA zone used purely for rendering dates and the countdown. Not editable
  // via settings yet: UTC is mandatory until the admin forms handle zones.
  displayTimeZone: string;
}

// Always part of coreTeam and markerAuthors, whatever the settings say.
export const ORGANIZER_LOGIN = "danielroe";

// Texts the admin may override at any time.
export const CONTENT_KEYS = ["title", "eyebrow", "description", "rules"] as const;
// Scoring-relevant keys. Editable only while the event is upcoming; once it
// has started (or is frozen) the server refuses changes so the ranking cannot
// be moved under the contributors' feet.
export const MECHANICS_KEYS = [
  "startsAt",
  "endsAt",
  "qualifyingBefore",
  "coreTeam",
  "closeMarker",
  "markerAuthors",
] as const;
export const SETTINGS_KEYS = [...CONTENT_KEYS, ...MECHANICS_KEYS] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];
export type MechanicsKey = (typeof MECHANICS_KEYS)[number];

// Sparse overrides stored under their own storage key. Missing = use the default
// from config/event.json, so a field is "reset" by deleting it, not by copying
// the default back.
export type EventSettings = Partial<Pick<EventConfig, SettingsKey>>;

// Coarse lifecycle that drives what the public site shows.
export type EventPhase = "upcoming" | "live" | "evaluating" | "results";

// Per-login GitHub issue/pr ids a user is credited with.
export interface ContributionIds {
  [login: string]: { issues: number[]; prs: number[] };
}

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
  // Full config the event ran with, so an archived result renders its own texts,
  // rules and core team no matter what is configured for later events. Optional
  // only because results fired before this field existed get it backfilled by
  // the startup migration (server/plugins/migrate.ts).
  config?: EventConfig;
  stats: EventStats;
  standings: LeaderboardEntry[];
  coreTeam: LeaderboardEntry[];
  contributions: ContributionIds;
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
