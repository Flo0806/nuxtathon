// Participation certificate for one contributor of an archived event. Public,
// like the archive itself. Cached per url; the archive never changes after fire.
export default definePdfHandler(
  async (event) => {
    const slug = getRouterParam(event, "slug") ?? "";
    const login = (getRouterParam(event, "login") ?? "").replace(/\.pdf$/, "");
    const result = await archivedEvent(slug);
    const entry = standingFor(result, login);
    return participationCertificate(await certificateInput(result, entry));
  },
  { filename: "nuxtathon-certificate.pdf", cache: { maxAge: 86400 } },
);
