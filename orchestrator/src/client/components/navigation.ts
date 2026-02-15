import {
  BookOpen,
  Columns3,
  Home,
  Inbox,
  LayoutDashboard,
  Settings,
  Shield,
} from "lucide-react";

declare const __APP_VERSION__: string;

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
  external?: boolean;
};

const releaseVersion = (() => {
  if (typeof __APP_VERSION__ !== "string") return null;
  const match = __APP_VERSION__.match(/^v\d+\.\d+\.\d+/);
  return match ? match[0] : null;
})();

const docsLabel = releaseVersion
  ? `Documentation (${releaseVersion})`
  : "Documentation";

export const NAV_LINKS: NavLink[] = [
  { to: "/overview", label: "Overview", icon: Home },
  {
    to: "/jobs/ready",
    label: "Jobs",
    icon: LayoutDashboard,
    activePaths: [
      "/jobs/ready",
      "/jobs/discovered",
      "/jobs/applied",
      "/jobs/all",
    ],
  },
  {
    to: "/applications/in-progress",
    label: "In Progress",
    icon: Columns3,
    activePaths: ["/applications/in-progress"],
  },
  { to: "/tracking-inbox", label: "Tracking Inbox", icon: Inbox },
  { to: "/docs", label: docsLabel, icon: BookOpen, external: true },
  { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const isNavActive = (
  pathname: string,
  to: string,
  activePaths?: string[],
) => {
  if (pathname === to) return true;
  if (!activePaths) return false;
  return activePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
};
