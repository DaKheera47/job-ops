import { X } from "lucide-react";
import { defaultStatusToken, statusTokens } from "./constants";
import { lockLabel, type StatusLock } from "./JobCommandBar.utils";

interface JobCommandBarLockBadgeProps {
  activeLock: StatusLock;
  onClear: () => void;
}

export const JobCommandBarLockBadge = ({
  activeLock,
  onClear,
}: JobCommandBarLockBadgeProps) => (
  <div className="flex items-center border-b px-3 py-2">
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold tracking-wide ${
        (statusTokens[activeLock] ?? defaultStatusToken).badge
      }`}
    >
      @{lockLabel[activeLock]}
      <button
        type="button"
        className="inline-flex items-center rounded-full p-0.5 hover:bg-black/20"
        aria-label={`Remove ${lockLabel[activeLock]} filter`}
        onClick={onClear}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  </div>
);
