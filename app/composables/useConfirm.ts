interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  resolve?: (value: boolean) => void;
}

export function useConfirm() {
  const state = useState<ConfirmState>("confirm", () => ({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
  }));

  function confirm(opts: {
    title: string;
    message: string;
    confirmLabel?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      state.value = {
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? "Confirm",
        resolve,
      };
    });
  }

  function answer(value: boolean) {
    state.value.resolve?.(value);
    state.value = { ...state.value, open: false, resolve: undefined };
  }

  return { state, confirm, answer };
}
