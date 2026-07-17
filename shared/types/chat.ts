export interface ChatMessage {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
  text: string;
  // ISO timestamp.
  at: string;
  // Set when a moderator removes it: the row stays as a "deleted" tombstone.
  deleted?: boolean;
}
