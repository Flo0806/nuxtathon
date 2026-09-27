// Toggles one issue on this user's list. Watching is private and carries no
// meaning for anyone else: the event rules say issues are not reserved.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const body = await readBody<{ number?: number; watch?: boolean }>(event);
  const number = Math.trunc(Number(body?.number));
  if (!Number.isInteger(number) || number <= 0) {
    throw createError({ statusCode: 422, statusMessage: "Not an issue number" });
  }

  const state = await readWatch(user.login);
  const watching = state.watching.filter((n) => n !== number);
  const seen = { ...state.seen };
  if (body?.watch === false) {
    delete seen[String(number)];
  } else {
    if (watching.length >= MAX_WATCHED) {
      throw createError({
        statusCode: 422,
        statusMessage: `The watch list holds at most ${MAX_WATCHED} issues`,
      });
    }
    // Newest first, so a long list stays useful without sorting in the client.
    watching.unshift(number);
    // Acknowledged as of now: what happened before you cared is not news.
    seen[String(number)] = new Date().toISOString();
  }
  await writeWatch(user.login, { watching, seen });
  return { watching, seen };
});
