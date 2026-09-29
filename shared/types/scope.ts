// Which pull requests an event counts, by where they were opened. Closed issues
// follow the PR (a PR in scope may close an issue in any repo).
export interface EventScope {
  // Single repositories, "owner/repo".
  repos: string[];
  // Organizations whose every repository counts, e.g. "nuxt-modules".
  orgs: string[];
  // Also accept PRs to modules listed in the nuxt/modules registry. Those repos
  // cannot be searched, so contributors submit such PRs by link.
  registry: boolean;
}

// Nuxtathon #1: the core repo only. Also what an archived result without a
// scope was run with, whatever the current default says.
export const DEFAULT_SCOPE: EventScope = { repos: ["nuxt/nuxt"], orgs: [], registry: false };
