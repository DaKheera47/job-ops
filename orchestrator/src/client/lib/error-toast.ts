import { type ExternalToast, toast } from "sonner";
import { formatUserFacingError } from "@/client/lib/error-format";

export function showErrorToast(
  error: unknown,
  fallback?: string,
  options?: ExternalToast,
): string | number {
  return toast.error(formatUserFacingError(error, fallback), options);
}
