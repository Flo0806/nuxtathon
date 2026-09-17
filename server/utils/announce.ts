import type { EventConfig, EventStats, LeaderboardEntry } from "#shared/types/event";

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
