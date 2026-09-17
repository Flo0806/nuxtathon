import type { EventConfig, EventPhase, EventStats, LeaderboardEntry } from "#shared/types/event";
import { ogFontFiles } from "./og-fonts";

const NUXT_GREEN = 0x00dc82;
const MEDALS = ["🥇", "🥈", "🥉"];

// Pushes the stored webhook into pigeon. Called on boot and after every settings
// save; an empty url turns the channel off.
export async function configureDiscord(): Promise<void> {
  const { discordWebhookUrl } = await resolveEventConfig();
  await discord.configure(discordWebhookUrl ? { webhookUrl: discordWebhookUrl } : undefined);
}

export const siteUrl = () => useRuntimeConfig().public.siteUrl || "https://nuxtathon.live";

export const BOT_IDENTITY = () => ({
  username: "Nuxtathon",
  avatarUrl: `${siteUrl()}/app-icon.png`,
});

export interface RankedLine {
  login: string;
  name: string | null;
  score: number;
  // "▲ from 4", "▼ from 1", "new", or "" when unchanged.
  move: string;
}

// Relative to the previously announced order.
export function movement(login: string, rank: number, previous: string[]): string {
  const was = previous.findIndex((l) => l.toLowerCase() === login.toLowerCase());
  if (was < 0) return "new";
  if (was + 1 === rank) return "";
  return was + 1 > rank ? `▲ from ${was + 1}` : `▼ from ${was + 1}`;
}

export function top3Lines(entries: LeaderboardEntry[], previous: string[]): RankedLine[] {
  return entries.slice(0, 3).map((e, i) => ({
    login: e.login,
    name: e.name,
    score: e.score,
    move: movement(e.login, i + 1, previous),
  }));
}

// The ranking card. Discord embeds only offer author, title, description,
// inline fields, thumbnail and footer, so the hierarchy is: who leads (in the
// description, one line each), then the event totals as a row of fields.
export function rankingEmbed(
  config: EventConfig,
  top: RankedLine[],
  stats: EventStats,
  contributors: number,
  opts: { test?: boolean } = {},
) {
  const site = siteUrl();
  const rows = top.map((t, i) => {
    const who = `**[${t.name || t.login}](https://github.com/${t.login})**`;
    const move = t.move ? `  \`${t.move}\`` : "";
    return `${MEDALS[i]}  ${who}  ·  ${t.score} ${t.score === 1 ? "issue" : "issues"}${move}`;
  });

  return {
    author: {
      name: `${config.title} · ${config.eyebrow}`,
      url: site,
      icon_url: `${site}/app-icon.png`,
    },
    title: opts.test ? "TEST · Top 3 changed" : "Top 3 changed",
    url: site,
    color: NUXT_GREEN,
    description: rows.join("\n"),
    fields: [
      { name: "Issues closed", value: `**${stats.issuesClosed}**`, inline: true },
      { name: "PRs merged", value: `**${stats.merged}**`, inline: true },
      { name: "Contributors", value: `**${contributors}**`, inline: true },
    ],
    thumbnail: { url: `${site}/app-icon.png` },
    footer: { text: opts.test ? "Test message from the admin page" : "Live leaderboard" },
    timestamp: new Date().toISOString(),
  };
}

const ANNOUNCE_KEY = "announce";
interface AnnounceState {
  // Logins of the last announced top 3, in rank order.
  top3: string[];
  sentAt: string | null;
}
// One process, so a flag is enough to stop two overlapping recomputes from
// posting the same change twice while Discord is slow.
let inflight = false;

const sameOrder = (a: string[], b: string[]) =>
  a.map((l) => l.toLowerCase()).join("\n") === b.map((l) => l.toLowerCase()).join("\n");

// Called after every leaderboard recompute. Posts when the ordered top 3 differs
// from the last announced one; the state is written only after a successful
// send, so a Discord hiccup retries on the next recompute instead of losing the
// change.
export async function announceRankingIfChanged(
  config: EventConfig,
  phase: EventPhase,
  entries: LeaderboardEntry[],
  stats: EventStats,
): Promise<void> {
  if (!config.discordAnnounce || phase !== "live" || inflight) return;
  if (!discord.status().configured) return;
  const top = entries.slice(0, 3).map((e) => e.login);
  if (top.length === 0) return;

  const storage = useStorage("state");
  const prev = (await storage.getItem<AnnounceState>(ANNOUNCE_KEY)) ?? { top3: [], sentAt: null };
  if (sameOrder(prev.top3, top)) return;

  inflight = true;
  try {
    const contributors = entries.filter((e) => e.score > 0).length;
    const embed = rankingEmbed(config, top3Lines(entries, prev.top3), stats, contributors);
    await discord.send("Ranking update", { embeds: [embed], ...BOT_IDENTITY() });
    await storage.setItem(ANNOUNCE_KEY, { top3: top, sentAt: new Date().toISOString() });
  } finally {
    inflight = false;
  }
}

export async function clearAnnounceState(): Promise<void> {
  await useStorage("state").removeItem(ANNOUNCE_KEY);
}

// Posted once on fire, regardless of the announce toggle: the organizer just
// pressed the button, and the channel is where the result belongs.
export async function announceFinal(
  config: EventConfig,
  entries: LeaderboardEntry[],
  stats: EventStats,
): Promise<void> {
  if (!discord.status().configured) return;
  const site = siteUrl();
  const winner = entries[0];
  const rows = entries.slice(0, 3).map((e, i) => {
    const who = `**[${e.name || e.login}](https://github.com/${e.login})**`;
    return `${MEDALS[i]}  ${who}  ·  ${e.score} ${e.score === 1 ? "issue" : "issues"}`;
  });
  const png = renderOgPng(await ogFontFiles(), ogTextFor(config, "results"));

  await discord.send(
    winner
      ? `🏁 **${config.title} is over.** Congratulations, ${winner.name || winner.login}!`
      : `🏁 **${config.title} is over.**`,
    {
      embeds: [
        {
          author: {
            name: `${config.title} · ${config.eyebrow}`,
            url: site,
            icon_url: `${site}/app-icon.png`,
          },
          title: "Final results",
          url: site,
          color: NUXT_GREEN,
          description: rows.join("\n"),
          fields: [
            { name: "Issues closed", value: `**${stats.issuesClosed}**`, inline: true },
            { name: "PRs merged", value: `**${stats.merged}**`, inline: true },
            {
              name: "Contributors",
              value: `**${entries.filter((e) => e.score > 0).length}**`,
              inline: true,
            },
          ],
          image: { url: "attachment://nuxtathon.png" },
          footer: { text: "Thank you all for contributing" },
          timestamp: new Date().toISOString(),
        },
      ],
      media: [{ data: png, filename: "nuxtathon.png" }],
      ...BOT_IDENTITY(),
    },
  );
}
