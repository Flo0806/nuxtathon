// Shape of the session user set in the GitHub OAuth callback.
declare module "#auth-utils" {
  interface User {
    login: string;
    name: string;
    avatarUrl: string;
  }
}

export {};
