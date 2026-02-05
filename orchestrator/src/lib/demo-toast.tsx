import { FlaskConical, ShieldBan } from "lucide-react";
import type React from "react";
import { toast } from "sonner";

function DemoToastCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex w-[360px] items-start gap-3 rounded-lg border border-amber-300/70 bg-gradient-to-br from-amber-200/95 via-amber-300/95 to-amber-400/95 p-3 text-amber-950 shadow-[0_8px_24px_rgba(245,158,11,0.35)]">
      <div className="mt-0.5 text-amber-900">{icon}</div>
      <div className="space-y-1">
        <p className="text-sm font-semibold leading-tight text-amber-950">
          {title}
        </p>
        <p className="text-xs text-amber-900/90">{description}</p>
      </div>
    </div>
  );
}

export function showDemoSimulatedToast(description: string): void {
  toast.custom(
    () => (
      <DemoToastCard
        title="Simulated in Demo Mode"
        description={description}
        icon={<FlaskConical className="h-4 w-4" />}
      />
    ),
    { duration: 3600 },
  );
}

export function showDemoBlockedToast(description: string): void {
  toast.custom(
    () => (
      <DemoToastCard
        title="Blocked in Public Demo"
        description={description}
        icon={<ShieldBan className="h-4 w-4" />}
      />
    ),
    { duration: 4200 },
  );
}
