// Award certificate by award id. Awards can be edited after fire, so this one
// is not cached.
export default definePdfHandler(
  async (event) => {
    const slug = getRouterParam(event, "slug") ?? "";
    const id = (getRouterParam(event, "id") ?? "").replace(/\.pdf$/, "");
    const result = await archivedEvent(slug);
    const award = (result.awards ?? []).find((a) => a.id === id);
    if (!award) throw createError({ statusCode: 404, statusMessage: "No such award" });
    const entry = standingFor(result, award.login);
    return awardCertificate({
      ...(await certificateInput(result, entry)),
      award: { ...award, iconBody: await awardIconBody(award.icon) },
    });
  },
  { filename: "nuxtathon-award.pdf" },
);
