// Session user shape (per the nuxt-auth-utils README). Lives in shared/ so the
// augmentation is picked up by all of Nuxt's split tsconfigs.
declare module "#auth-utils" {
  interface User {
    login: string;
    name: string;
    avatarUrl: string;
    isChatAdmin: boolean;
  }
}

export {};
