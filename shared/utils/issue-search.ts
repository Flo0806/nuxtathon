import type { EventConfig, EventLink } from "../types/event";
import { ISSUES_PLACEHOLDER, LINK_ICONS, RANDOM_PLACEHOLDER } from "../types/event";

export const NUXT_REPO = "nuxt/nuxt";

// The one definition of "an issue you could pick up": open, in the given repo
// (the core repo unless a caller asks for another), and created early enough to
// qualify. Everything that points people at issues derives from this, so the
// cutoff date is never written down twice.
export function issueSearchQuery(
  config: Pick<EventConfig, "qualifyingBefore">,
  repo: string = NUXT_REPO,
): string {
  const cutoff = new Date(config.qualifyingBefore);
  // GitHub search takes a date, and `created:<` is exclusive, so the instant
  // maps to its calendar day in UTC.
  const day = Number.isFinite(cutoff.getTime()) ? cutoff.toISOString().slice(0, 10) : "";
  const parts = [`repo:${repo}`, "is:issue", "state:open"];
  if (day) parts.push(`created:<${day}`);
  return parts.join(" ");
}

// Human-facing link to the same set, for a "browse open issues" button.
export const issueSearchUrl = (config: Pick<EventConfig, "qualifyingBefore">): string =>
  `https://github.com/search?type=issues&s=updated&o=desc&q=${encodeURIComponent(
    issueSearchQuery(config),
  )}`;

// Replaces the "{issues}" placeholder with the search that matches this event's
// cutoff. Done where a config is produced, so every consumer (site, API,
// archive) gets a link that works without knowing about the placeholder.
export function expandLinks(config: EventConfig): EventLink[] {
  return (config.links ?? []).map((link) => {
    if (link.url === ISSUES_PLACEHOLDER) return { ...link, url: issueSearchUrl(config) };
    // Relative on purpose: the site then works on any host, and the public API
    // makes it absolute where an external consumer needs that (see absoluteLinks).
    if (link.url === RANDOM_PLACEHOLDER) return { ...link, url: "/api/pick-issue" };
    return link;
  });
}

// Only our own paths get a base. "//host" is protocol-relative, not a path, so
// it is left alone rather than turned into a link to somewhere else.
export const absoluteLinks = (links: EventLink[], baseUrl: string): EventLink[] =>
  links.map((l) =>
    l.url.startsWith("/") && !l.url.startsWith("//") ? { ...l, url: `${baseUrl}${l.url}` } : l,
  );

// Narrows the search to issues nobody has started: no linked pull request and
// no assignee. GitHub evaluates both server side, so we never page through the
// whole backlog to find out.
export const untouchedSearchQuery = (config: Pick<EventConfig, "qualifyingBefore">): string =>
  `${issueSearchQuery(config)} -linked:pr no:assignee`;

// Keeps stored links on the known shape: a label and a url are required, the
// icon falls back to a neutral one, and anything that is not http(s) or the
// placeholder is dropped rather than rendered as a link.
// Rendered as a row of buttons, so the count is bounded: a slip in the admin
// form should not turn the intro into a wall of links.
const MAX_LINKS = 12;

export function normalizeLinks(input: unknown): EventLink[] {
  if (!Array.isArray(input)) return [];
  const icons = LINK_ICONS as readonly string[];
  const out: EventLink[] = [];
  for (const raw of input) {
    const label = String((raw as EventLink)?.label ?? "").trim();
    const url = String((raw as EventLink)?.url ?? "").trim();
    if (!label || !url) continue;
    const placeholder = url === ISSUES_PLACEHOLDER || url === RANDOM_PLACEHOLDER;
    if (!placeholder && !/^https?:\/\//i.test(url)) continue;
    const icon = String((raw as EventLink)?.icon ?? "");
    out.push({
      label,
      url,
      icon: (icons.includes(icon) ? icon : "i-ph-globe") as EventLink["icon"],
    });
  }
  return out.slice(0, MAX_LINKS);
}
