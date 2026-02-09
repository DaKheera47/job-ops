import { lockLabel, type StatusLock } from "./JobCommandBar.utils";
import { JobStatusBadge } from "./JobStatusBadge";

interface JobCommandBarLockBadgeProps {
  activeLock: StatusLock;
}

export const JobCommandBarLockBadge = ({
  activeLock,
}: JobCommandBarLockBadgeProps) => (
  <JobStatusBadge status={activeLock} label={`@${lockLabel[activeLock]}`} />
);
