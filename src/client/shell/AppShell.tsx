import { Heart, LayoutGrid, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { StatusStrip } from "./StatusStrip.tsx";

const TABS = [
  { to: "/", label: "Summary", icon: Heart, end: true },
  { to: "/browse", label: "Browse", icon: LayoutGrid, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <StatusStrip />
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label="Main">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab" viewTransition>
            <Icon size={24} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
