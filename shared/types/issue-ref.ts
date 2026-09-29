// Identity of an issue or PR across repositories: "owner/repo#123", always
// lowercase. Nuxtathon #1 only knew nuxt/nuxt, so everything stored from it is a
// bare number; those are read as nuxt/nuxt via parseIssueRef.
export type IssueRef = `${string}/${string}#${number}`;
