interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

let seq = 0;

export function useToast() {
  const toasts = useState<Toast[]>("toasts", () => []);

  function push(message: string, type: Toast["type"]) {
    const id = ++seq;
    toasts.value = [...toasts.value, { id, message, type }];
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 3500);
  }

  return {
    toasts,
    success: (message: string) => push(message, "success"),
    error: (message: string) => push(message, "error"),
  };
}
