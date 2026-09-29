// The nuxt/modules registry as nuxt.com serves it: every listed module with its
// repository and maintainers. Used to tell "my own module" from "someone else's"
// (a maintainer's PRs to their own repo are reviewed, never auto-scored).
//
// Changes a few times a week, so a day of caching is plenty; the payload is
// ~0.5 MB, which is why it is not fetched per recompute.
const REGISTRY_URL = "https://api.nuxt.com/modules";

interface RegistryModule {
  repo?: string;
  maintainers?: { github?: string }[];
}

// Repo ("owner/name", lowercase) -> maintainer logins (lowercase). Entries such
// as "clerk/javascript#main/packages/nuxt" point into a monorepo; the PR lives in
// the repo, so the branch and path are dropped and modules sharing a repo merge.
export const fetchRegistryMaintainers = defineCachedFunction(
  async (): Promise<Record<string, string[]>> => {
    const { modules } = await $fetch<{ modules: RegistryModule[] }>(REGISTRY_URL, {
      headers: { "user-agent": "nuxtathon-leaderboard" },
    });
    const out: Record<string, Set<string>> = {};
    for (const m of modules ?? []) {
      const repo = (m.repo ?? "").split("#")[0]!.split("/").slice(0, 2).join("/").toLowerCase();
      if (!/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(repo)) continue;
      const set = (out[repo] ??= new Set());
      for (const person of m.maintainers ?? []) {
        if (person.github) set.add(person.github.toLowerCase());
      }
    }
    return Object.fromEntries(Object.entries(out).map(([repo, set]) => [repo, [...set]]));
  },
  // Kept on the "issues" mount: admin actions clear "cache" completely, and every
  // review click would otherwise download the registry again.
  { maxAge: 24 * 60 * 60, name: "module-registry", getKey: () => "maintainers", base: "issues" },
);

// For callers that must not fail with the registry: an outage then means nobody
// is treated as a maintainer, which the admin check reports.
export async function registryMaintainers(): Promise<{
  byRepo: Map<string, Set<string>>;
  ok: boolean;
}> {
  try {
    const raw = await fetchRegistryMaintainers();
    return {
      byRepo: new Map(Object.entries(raw).map(([repo, logins]) => [repo, new Set(logins)])),
      ok: true,
    };
  } catch (e) {
    console.error("[registry] could not load module maintainers:", e);
    return { byRepo: new Map(), ok: false };
  }
}
