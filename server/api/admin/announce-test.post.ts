// Posts a sample ranking card with fake users. `webhookUrl` in the body tests

import { RankedLine, rankingEmbed } from "~~/server/utils/announce";

// an unsaved url from the form; without it the configured one is used.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ webhookUrl?: string }>(event);
  const override = body?.webhookUrl?.trim();
  if (!override && !discord.status().configured) {
    throw createError({ statusCode: 400, statusMessage: "No Discord webhook configured" });
  }

  const config = await resolveEventConfig();
  const sample: RankedLine[] = [
    { login: "testuser1", name: "Test User 1", score: 14, move: "▲ from 2" },
    { login: "testuser2", name: "Test User 2", score: 13, move: "▼ from 1" },
    { login: "testuser3", name: "Test User 3", score: 9, move: "new" },
  ];
  const stats = { submitted: 61, merged: 48, issuesClosed: 132 };
  const embed = rankingEmbed(config, sample, stats, 27, { test: true });

  // No url in the text: Discord would unfurl it into a second card.
  const res = await discord.send("**TEST** · this is what a ranking update looks like", {
    embeds: [embed],
    ...BOT_IDENTITY(),
    ...(override ? { webhookUrl: override } : {}),
  });
  return { id: res.id ?? null };
});
