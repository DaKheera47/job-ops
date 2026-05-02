import { type ExternalToast, toast } from "sonner";
import { formatUserFacingError } from "@/client/lib/error-format";

export function showErrorToast(
  error: unknown,
  fallback?: string,
  options?: ExternalToast,
): string | number {
  const message = formatUserFacingError(error, fallback);
  return options === undefined
    ? toast.error(message)
    : toast.error(message, options);
}
