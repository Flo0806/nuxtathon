// Runs `load` once a session exists (on mount and after each re-login) and
// tells the page when to render. Pages stay out of the SSR output, which keeps
// hydration clean without gating <NuxtPage> in the layout.
export function useAdminPage(load: () => Promise<void>) {
  const auth = useAdminAuth();
  const toast = useToast();
  const ready = ref(false);
  onMounted(() => (ready.value = true));

  const visible = computed(() => ready.value && auth.isAuthed.value);

  watch(visible, async (ok) => {
    if (!ok) return;
    try {
      await load();
    } catch (e) {
      if (!auth.handle401(e)) toast.error(errMsg(e));
    }
  });

  return { visible };
}
