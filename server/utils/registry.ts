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

interface RegistryData {
  // Repo ("owner/name", lowercase) -> maintainer logins (lowercase).
  maintainers: Record<string, string[]>;
  // Repo -> folder the module lives in, for monorepos such as
  // "clerk/javascript#main/packages/nuxt" (branch "main", folder
  // "packages/nuxt"). Missing = the whole repository is the module.
  paths: Record<string, string>;
}

// Parsed once a day. Entries point either at a repo, at a branch ("#main"), or
// into a monorepo ("#main/packages/nuxt"); the PR lives in the repo, so the repo
// is the key and the folder is kept to tell module work from the rest.
export const fetchRegistry = defineCachedFunction(
  async (): Promise<RegistryData> => {
    const { modules } = await $fetch<{ modules: RegistryModule[] }>(REGISTRY_URL, {
      headers: { "user-agent": "nuxtathon-leaderboard" },
    });
    const maintainers: Record<string, Set<string>> = {};
    const paths: Record<string, string> = {};
    for (const m of modules ?? []) {
      const [target = "", location = ""] = (m.repo ?? "").split("#");
      const repo = target.split("/").slice(0, 2).join("/").toLowerCase();
      if (!/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(repo)) continue;
      // First segment is the branch; branch names with a slash are not
      // distinguishable from a folder, and none in the registry has one.
      const folder = location.split("/").slice(1).join("/").replace(/\/+$/, "");
      if (folder) paths[repo] = folder;
      const set = (maintainers[repo] ??= new Set());
      for (const person of m.maintainers ?? []) {
        if (person.github) set.add(person.github.toLowerCase());
      }
    }
    return {
      maintainers: Object.fromEntries(
        Object.entries(maintainers).map(([repo, set]) => [repo, [...set]]),
      ),
      paths,
    };
  },
  // Kept on the "issues" mount: admin actions clear "cache" completely, and every
  // review click would otherwise download the registry again. The key names the
  // shape, so an entry cached in the older shape is not read back.
  { maxAge: 24 * 60 * 60, name: "module-registry", getKey: () => "v2", base: "issues" },
);

// For callers that must not fail with the registry: an outage then means nobody
// is treated as a maintainer, which the admin check reports.
export async function registryMaintainers(): Promise<{
  byRepo: Map<string, Set<string>>;
  paths: Map<string, string>;
  ok: boolean;
}> {
  try {
    const raw = await fetchRegistry();
    return {
      byRepo: new Map(
        Object.entries(raw.maintainers).map(([repo, logins]) => [repo, new Set(logins)]),
      ),
      paths: new Map(Object.entries(raw.paths)),
      ok: true,
    };
  } catch (e) {
    console.error("[registry] could not load module maintainers:", e);
    return { byRepo: new Map(), paths: new Map(), ok: false };
  }
}
