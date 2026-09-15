// Basic-Auth token (base64 user:pass) kept in sessionStorage so a reload within
// the tab stays logged in, but it is not sent on every request like a cookie.
const STORAGE_KEY = "nx-admin";

export function useAdminAuth() {
  const token = useState<string | null>("admin-token", () => null);
  // Resolved in setup; handle401 runs after an await, outside the Nuxt context.
  const toast = useToast();

  if (import.meta.client && !token.value) {
    token.value = sessionStorage.getItem(STORAGE_KEY);
  }

  const isAuthed = computed(() => Boolean(token.value));

  function set(user: string, pass: string) {
    token.value = btoa(`${user}:${pass}`);
    if (import.meta.client) sessionStorage.setItem(STORAGE_KEY, token.value);
  }

  function clear() {
    token.value = null;
    if (import.meta.client) sessionStorage.removeItem(STORAGE_KEY);
  }

  const authHeaders = (): Record<string, string> =>
    token.value ? { authorization: `Basic ${token.value}` } : {};

  // Clears the session on 401 (layout re-opens the dialog). True = handled.
  function handle401(e: unknown): boolean {
    if (!is401(e)) return false;
    clear();
    toast.error("Please log in again");
    return true;
  }

  return { token, isAuthed, set, clear, authHeaders, handle401 };
}

export function is401(e: unknown): boolean {
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } };
  return err?.statusCode === 401 || err?.status === 401 || err?.response?.status === 401;
}

export function errMsg(e: unknown): string {
  const err = e as { data?: { statusMessage?: string; message?: string }; message?: string };
  return err?.data?.statusMessage || err?.data?.message || err?.message || "Request failed";
}
