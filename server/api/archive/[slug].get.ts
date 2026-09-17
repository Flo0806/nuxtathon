// One archived event, rendered with the config it ran with.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug") ?? "";
  const list = await listArchive();
  const slugs = archiveSlugs(list);
  const result = list.find((r) => slugs.get(r) === slug);
  if (!result) throw createError({ statusCode: 404, statusMessage: "No such event" });
  return { ...result, config: archivedConfig(result), slug };
});
