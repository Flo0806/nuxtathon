import { randomUUID } from "node:crypto";
import type { Award } from "#shared/types/event";
import { AWARD_ICONS } from "#shared/types/event";

// Replaces the awards of one archived event (by slug). Also patches `final`
// when it is the same event, so the live results view and the archive agree.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: string; awards?: Award[] }>(event);
  const slug = body?.slug ?? "";

  const state = await readRuntimeState();
  const list = await listArchive();
  const slugs = archiveSlugs(list);
  const target = list.find((r) => slugs.get(r) === slug);
  if (!target) throw createError({ statusCode: 404, statusMessage: "No such event" });

  // Same rule as the certificate routes: only contributors with a score.
  const eligible = new Map(
    target.standings.filter((e) => e.score > 0).map((e) => [e.login.toLowerCase(), e.login]),
  );
  const awards: Award[] = [];
  for (const a of body?.awards ?? []) {
    const login = String(a?.login ?? "").trim();
    const title = String(a?.title ?? "").trim();
    if (!login || !title) {
      throw createError({
        statusCode: 422,
        statusMessage: "Every award needs a recipient and a title",
      });
    }
    const canonical = eligible.get(login.toLowerCase());
    if (!canonical) {
      throw createError({ statusCode: 422, statusMessage: `${login} has no score in this event` });
    }
    const icon = (AWARD_ICONS as readonly string[]).includes(a.icon) ? a.icon : "trophy";
    awards.push({
      id: typeof a.id === "string" && a.id ? a.id : randomUUID(),
      login: canonical,
      title,
      text: String(a.text ?? "").trim(),
      icon,
    });
  }

  const same = (r: { title: string; startsAt: string }) =>
    r.title === target.title && r.startsAt === target.startsAt;
  const archive = state.archive.map((r) => (same(r) ? { ...r, awards } : r));
  const final = state.final && same(state.final) ? { ...state.final, awards } : state.final;
  await writeRuntimeState({ ...state, archive, final });
  return { awards };
});
