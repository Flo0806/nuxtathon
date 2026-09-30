import { parseIssueRef } from "#shared/utils/issue-ref";

// Toggles one issue on this user's list. Watching is private and carries no
// meaning for anyone else: the event rules say issues are not reserved.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const body = await readBody<{ issue?: string; number?: number; watch?: boolean }>(event);
  // `number` is what a tab loaded before refs still sends; it means nuxt/nuxt.
  const ref = parseIssueRef(body?.issue ?? body?.number);
  if (!ref) {
    throw createError({ statusCode: 422, statusMessage: "Not an issue" });
  }

  return withWatchLock(user.login, async () => {
    const state = await readWatch(user.login);
    const watching = state.watching.filter((r) => r !== ref);
    const seen = { ...state.seen };
    if (body?.watch === false) {
      delete seen[ref];
    } else {
      if (watching.length >= MAX_WATCHED) {
        throw createError({
          statusCode: 422,
          statusMessage: `The watch list holds at most ${MAX_WATCHED} issues`,
        });
      }
      // Newest first, so a long list stays useful without sorting in the client.
      watching.unshift(ref);
      // Acknowledged as of now: what happened before you cared is not news.
      seen[ref] = new Date().toISOString();
    }
    await writeWatch(user.login, { watching, seen });
    return { watching, seen };
  });
});
