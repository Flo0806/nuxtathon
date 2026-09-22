import type { Award, EventPhase, EventStats } from "./event";
import type { ScoringRules } from "./scoring";

// Public API v1. Additive only: fields may be added, never removed or retyped.

export interface ApiMeta {
  // When this payload was built. Excluded from the ETag, so an unchanged
  // ranking keeps answering 304.
  generatedAt: string;
  // Earliest point a new fetch can yield different data.
  nextUpdateAt: string;
  phase: EventPhase;
}

export interface ApiAvatar {
  small: string;
  large: string;
}

export interface ApiContributor {
  rank: number;
  login: string;
  name: string | null;
  avatar: ApiAvatar;
  // Ranking metric. Equals `closedIssues` unless point rules are configured.
  score: number;
  closedIssues: number;
  mergedPRs: number;
  // Only with ?include=contributions.
  issues?: number[];
  prs?: number[];
}

export interface ApiEventBrief {
  title: string;
  eyebrow: string;
  url: string;
  image: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
}

export interface ApiStats extends EventStats {
  contributors: number;
}

export interface ApiWinner extends ApiContributor {
  awards: Award[];
}

export interface ApiSummary {
  meta: ApiMeta;
  event: ApiEventBrief;
  stats: ApiStats;
  top: ApiContributor[];
  // Set once the prizes are released.
  winner: ApiWinner | null;
}

export interface ApiEvent {
  meta: ApiMeta;
  event: ApiEventBrief & {
    // Markdown as the organizer wrote it, plus a plain-text version.
    description: string;
    descriptionText: string;
    // Rendered rule lines, hand-written ones first, point rules appended.
    rules: string[];
    qualifyingBefore: string;
    coreTeam: string[];
    scoring: ScoringRules;
  };
  stats: ApiStats;
}

export interface ApiLeaderboard {
  meta: ApiMeta;
  stats: ApiStats;
  contributors: ApiContributor[];
  // Acknowledged, but out of the prize ranking.
  coreTeam: ApiContributor[];
}

export interface ApiArchiveEntry {
  slug: string;
  title: string;
  eyebrow: string;
  startsAt: string;
  endsAt: string;
  finalizedAt: string;
  url: string;
  stats: ApiStats;
  winner: { login: string; name: string | null; avatar: ApiAvatar } | null;
  awardCount: number;
}

export interface ApiArchive {
  meta: ApiMeta;
  events: ApiArchiveEntry[];
}

export interface ApiAward extends Award {
  // Ready-made PDF link, no auth needed.
  certificateUrl: string;
}

export interface ApiArchivedEvent {
  meta: ApiMeta;
  event: ApiArchiveEntry & {
    description: string;
    descriptionText: string;
    rules: string[];
    qualifyingBefore: string;
    scoring: ScoringRules;
  };
  awards: ApiAward[];
  contributors: (ApiContributor & { certificateUrl: string })[];
  coreTeam: ApiContributor[];
}

// One contributor across every finished event.
export interface ApiUser {
  login: string;
  name: string | null;
  avatar: ApiAvatar;
  totals: {
    score: number;
    closedIssues: number;
    mergedPRs: number;
    events: number;
    awards: number;
  };
  events: {
    slug: string;
    title: string;
    eyebrow: string;
    startsAt: string;
    url: string;
    rank: number;
    score: number;
    closedIssues: number;
    mergedPRs: number;
    issues: number[];
    prs: number[];
    awards: ApiAward[];
    certificateUrl: string;
  }[];
}

export interface ApiUsers {
  meta: ApiMeta;
  users: ApiUser[];
}
