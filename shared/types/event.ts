import type { ScoringRules } from "./scoring";

// Static, committed event configuration (source: config/event.json).
export interface EventConfig {
  title: string;
  // Short kicker above the title, e.g. "#1 · Community Hackathon".
  eyebrow: string;
  // Markdown. Rendered on the public site.
  description: string;
  // Short qualification rules shown under the intro (Markdown, inline). The
  // active point rules are appended to these on the site.
  rules: string[];
  // Hides the hand-written `rules` above. Needed because an empty list falls
  // back to the committed default, so there is no other way to drop them. The
  // generated point rules are never affected.
  showCustomRules: boolean;
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
  // Point rules. Every rule off means one point per qualifying closed issue,
  // which is how the first event was scored.
  scoring: ScoringRules;
  // IANA zone used purely for rendering dates and the countdown. Not editable
  // via settings yet: UTC is mandatory until the admin forms handle zones.
  displayTimeZone: string;
  // Discord webhook for announcements (top-3 changes, fire). Admin-set, never
  // locked by phase, stripped from the archived config.
  discordWebhookUrl: string;
  discordAnnounce: boolean;
}

// Always part of coreTeam and markerAuthors, whatever the settings say.
export const ORGANIZER_LOGIN = "danielroe";

// Texts the admin may override at any time.
export const CONTENT_KEYS = [
  "title",
  "eyebrow",
  "description",
  "rules",
  "showCustomRules",
] as const;
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
  "scoring",
] as const;
// Editable in every phase, and left out of FinalResult.config (a webhook url is
// a credential, not part of an event's record).
export const INTEGRATION_KEYS = ["discordWebhookUrl", "discordAnnounce"] as const;
export const SETTINGS_KEYS = [...CONTENT_KEYS, ...MECHANICS_KEYS, ...INTEGRATION_KEYS] as const;
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

// Curated Phosphor icons an award may carry. Rendered on the site via UnoCSS
// (`i-ph-<name>-fill`) and in the certificate PDF from the iconify data.
export const AWARD_ICONS = [
  "trophy",
  "medal",
  "crown",
  "star",
  "sparkle",
  "heart",
  "handshake",
  "lightning",
  "fire",
  "rocket-launch",
  "bug",
  "wrench",
  "magnifying-glass",
  "shield-check",
  "users-three",
  "confetti",
] as const;
export type AwardIcon = (typeof AWARD_ICONS)[number];

// A prize the organizer hands out after the event. Free-form on purpose: the
// prize categories change per event and are not derived from the ranking.
export interface Award {
  id: string;
  login: string;
  // "Most issues closed", "Most helpful community member", ...
  title: string;
  // One line, e.g. "for closing 21 issues in 48 hours".
  text: string;
  icon: AwardIcon;
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
  // Prizes, edited on the archive entry after fire. Optional: older results
  // simply have none.
  awards?: Award[];
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

// Public list entry for /api/archive.
export interface ArchiveSummary {
  // Start date, "-2" etc. appended when two events share a day.
  slug: string;
  title: string;
  eyebrow: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string;
  winner: { login: string; name: string | null; avatarUrl: string } | null;
  stats: EventStats;
  contributors: number;
  awardCount: number;
}
