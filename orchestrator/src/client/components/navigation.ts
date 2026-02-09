import { Home, LayoutDashboard, Settings, Shield } from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
};

export const NAV_LINKS: NavLink[] = [
  { to: "/home", label: "Home", icon: Home },
  {
    to: "/ready",
    label: "Dashboard",
    icon: LayoutDashboard,
    activePaths: ["/ready", "/discovered", "/applied", "/all"],
  },
  { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const isNavActive = (
  pathname: string,
  to: string,
  activePaths?: string[],
) => pathname === to || (activePaths ? activePaths.includes(pathname) : false);
