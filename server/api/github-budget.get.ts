import { DEVELOPER_LOGIN } from "#shared/types/event";

// Same numbers as the admin endpoint, for the developer's GitHub login, so the
// counter can sit on the public pages without the admin password.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.login.toLowerCase() !== DEVELOPER_LOGIN.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: "Not for this account" });
  }
  const token = useRuntimeConfig().githubToken;
  if (getQuery(event).probe && token) await probeBudget(token).catch(() => undefined);
  return budgetSnapshot();
});
