import type { Award } from "#shared/types/event";
import { AWARD_ICONS } from "#shared/types/event";

// Renders an award as it is in the form, saved or not.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: string; award?: Partial<Award> }>(event);
  const result = await archivedEvent(body?.slug ?? "");
  const a = body?.award ?? {};
  const entry = standingFor(result, String(a.login ?? ""));
  const icon = (AWARD_ICONS as readonly string[]).includes(String(a.icon)) ? a.icon! : "trophy";
  const award: Award = {
    id: a.id || "preview",
    login: entry.login,
    title: String(a.title ?? "").trim() || "Award title",
    text: String(a.text ?? "").trim(),
    icon,
  };
  const doc = awardCertificate({
    ...(await certificateInput(result, entry)),
    award: { ...award, iconBody: await awardIconBody(icon) },
  });
  return sendPdf(event, doc, { filename: "award-preview.pdf" });
});
