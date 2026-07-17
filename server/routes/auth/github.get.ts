// GitHub OAuth callback. No extra scopes: the public profile is all the chat
// needs to attribute a message.
export default defineOAuthGitHubEventHandler({
  config: {},
  async onSuccess(event, { user }) {
    await setUserSession(event, {
      user: {
        login: user.login,
        name: user.name ?? user.login,
        avatarUrl: user.avatar_url,
        isChatAdmin: isChatAdmin(user.login),
      },
    });
    return sendRedirect(event, "/");
  },
  onError(event, error) {
    console.error("GitHub OAuth failed:", error);
    return sendRedirect(event, "/?auth=error");
  },
});
