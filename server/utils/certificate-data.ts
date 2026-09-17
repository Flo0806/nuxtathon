import type { Award, FinalResult, LeaderboardEntry } from "#shared/types/event";

// Everything a certificate needs besides the variant: fonts from the server
// assets, the avatar fetched from GitHub (optional, a failure just drops it).
export async function certificateInput(result: FinalResult, entry: LeaderboardEntry) {
  const assets = useStorage("assets:server");
  const [display, mono, monoBold] = await Promise.all([
    assets.getItemRaw<Uint8Array>("fonts/ChakraPetch-Bold.ttf"),
    assets.getItemRaw<Uint8Array>("fonts/JetBrainsMono-Medium.ttf"),
    assets.getItemRaw<Uint8Array>("fonts/JetBrainsMono-Bold.ttf"),
  ]);
  if (!display || !mono || !monoBold) throw new Error("certificate fonts missing");

  // Two url shapes: avatars.githubusercontent.com/u/1?v=4 (GraphQL, `s`) and
  // github.com/<login>.png?size=80 (manual credits, `size`). Set both.
  const avatarUrl = new URL(entry.avatarUrl);
  avatarUrl.searchParams.set("s", "256");
  avatarUrl.searchParams.set("size", "256");
  const avatar = await $fetch<ArrayBuffer>(avatarUrl.toString(), { responseType: "arrayBuffer" })
    .then((b) => new Uint8Array(b))
    .catch(() => undefined);

  return {
    config: archivedConfig(result),
    entry,
    totalContributors: result.standings.filter((e) => e.score > 0).length,
    finalizedAt: result.finalizedAt,
    // Until the organizer's own signature lands in the settings.
    signedBy: "Daniel Roe",
    avatar,
    fonts: { display, mono, monoBold },
  };
}

// The 16 Phosphor "fill" bodies, extracted from @iconify-json/ph into a small
// asset so the 4.5 MB icon set is not bundled. Regenerate when AWARD_ICONS
// changes: read `icons[name + "-fill"].body` from @iconify-json/ph/icons.json
// for each name and write the map to server/assets/award-icons.json.
export async function awardIconBody(icon: Award["icon"]): Promise<string> {
  const icons =
    await useStorage("assets:server").getItem<Record<string, string>>("award-icons.json");
  return icons?.[icon] ?? icons?.trophy ?? "";
}

export async function archivedEvent(slug: string): Promise<FinalResult> {
  const list = await listArchive();
  const slugs = archiveSlugs(list);
  const result = list.find((r) => slugs.get(r) === slug);
  if (!result) throw createError({ statusCode: 404, statusMessage: "No such event" });
  return result;
}

export function standingFor(result: FinalResult, login: string): LeaderboardEntry {
  const entry = result.standings.find((e) => e.login.toLowerCase() === login.toLowerCase());
  if (!entry || entry.score <= 0) {
    throw createError({ statusCode: 404, statusMessage: "No certificate for this login" });
  }
  return entry;
}
