// Marks everything as read. The list then stops flagging what was already seen.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const state = await readWatch(user.login);
  const now = new Date().toISOString();
  const seen = Object.fromEntries(state.watching.map((n) => [String(n), now]));
  await writeWatch(user.login, { ...state, seen });
  return { seen };
});
