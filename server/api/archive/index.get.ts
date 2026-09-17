export default defineEventHandler(async () => {
  const list = await listArchive();
  const slugs = archiveSlugs(list);
  return list.map((r) => summarize(r, slugs.get(r)!));
});
