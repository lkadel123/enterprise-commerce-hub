import { toast, type ExternalToast } from "sonner";

export type { ExternalToast };

/**
 * Thin, storefront-scoped wrapper around the global Sonner toasts mounted by
 * `<Toaster />` in `providers.tsx`. It must NOT create a second toast instance
 * or re-mount a Toaster — it only forwards to the existing one.
 */
export const ToastMsg = {
  success(message: string, options?: ExternalToast) {
    return toast.success(message, options);
  },
  error(message: string, options?: ExternalToast) {
    return toast.error(message, options);
  },
  info(message: string, options?: ExternalToast) {
    return toast.info(message, options);
  },
  warning(message: string, options?: ExternalToast) {
    return toast.warning(message, options);
  },
  message(message: string, options?: ExternalToast) {
    return toast.message(message, options);
  },
  dismiss(id?: string | number) {
    return toast.dismiss(id);
  },
};

export type ToastMsgType = typeof ToastMsg;
