import type { ContributionIds } from "../types/event";
import type { IssueRef } from "../types/issue-ref";

// The repo a bare number belongs to. Everything stored before refs existed
// comes from nuxt/nuxt, and so does a "#123" typed into the admin.
export const HOME_REPO = "nuxt/nuxt";

const REPO = /^([a-z0-9-]+)\/([a-z0-9._-]+)$/i;

// GitHub treats owner and repo case-insensitively, so refs are lowercased to
// make "Nuxt/Nuxt#1" and "nuxt/nuxt#1" the same key. Links still resolve.
export function issueRef(repo: string, number: number): IssueRef | null {
  const name = repo.trim().toLowerCase();
  if (!REPO.test(name) || !Number.isInteger(number) || number <= 0) return null;
  return `${name}#${number}` as IssueRef;
}

// Accepts every form a ref shows up in: a stored bare number, "123", "#123",
// "owner/repo#123", and issue or PR URLs (trailing path, query or hash ignored).
export function parseIssueRef(input: unknown, homeRepo = HOME_REPO): IssueRef | null {
  if (typeof input === "number") return issueRef(homeRepo, input);
  if (typeof input !== "string") return null;
  const text = input.trim();

  const bare = /^#?(\d+)$/.exec(text);
  if (bare) return issueRef(homeRepo, Number(bare[1]));

  const short = /^([^/\s#]+\/[^/\s#]+)#(\d+)$/.exec(text);
  if (short) return issueRef(short[1]!, Number(short[2]));

  const url =
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/(?:issues|pull)\/(\d+)(?:[/?#].*)?$/i.exec(
      text,
    );
  if (url) return issueRef(url[1]!, Number(url[2]));

  return null;
}

export function splitIssueRef(ref: IssueRef): { repo: string; number: number } {
  const at = ref.lastIndexOf("#");
  return { repo: ref.slice(0, at), number: Number(ref.slice(at + 1)) };
}

// github.com/.../issues/N redirects to /pull/N for PRs, so one form serves both.
export function issueRefUrl(ref: IssueRef): string {
  const { repo, number } = splitIssueRef(ref);
  return `https://github.com/${repo}/issues/${number}`;
}

// "#123" inside the home repo keeps #1-style screens unchanged; anything else
// needs the repo to be unambiguous.
export function issueRefLabel(ref: IssueRef, homeRepo = HOME_REPO): string {
  const { repo, number } = splitIssueRef(ref);
  return repo === homeRepo.toLowerCase() ? `#${number}` : `${repo}#${number}`;
}

// Stored data is read through these, never rewritten on disk: #1 results hold
// bare numbers and must render unchanged, and a second pass over already
// normalized data is a no-op. Invalid entries are dropped, duplicates collapse
// keeping first-seen order (the order credits were earned in).
export function normalizeIssueRefs(list: unknown, homeRepo = HOME_REPO): IssueRef[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<IssueRef>();
  for (const item of list) {
    const ref = parseIssueRef(item, homeRepo);
    if (ref) out.add(ref);
  }
  return [...out];
}

export function normalizeContributions(input: unknown, homeRepo = HOME_REPO): ContributionIds {
  if (!input || typeof input !== "object") return {};
  const out: ContributionIds = {};
  for (const [login, value] of Object.entries(input as Record<string, unknown>)) {
    const v = (value ?? {}) as { issues?: unknown; prs?: unknown };
    out[login] = {
      issues: normalizeIssueRefs(v.issues, homeRepo),
      prs: normalizeIssueRefs(v.prs, homeRepo),
    };
  }
  return out;
}

// A credit from #1 carries `issueNumber`; from now on it carries `issue`.
export function normalizeCreditIssue(
  credit: { issue?: unknown; issueNumber?: unknown },
  homeRepo = HOME_REPO,
): IssueRef | undefined {
  return (
    parseIssueRef(credit.issue, homeRepo) ??
    parseIssueRef(credit.issueNumber, homeRepo) ??
    undefined
  );
}
