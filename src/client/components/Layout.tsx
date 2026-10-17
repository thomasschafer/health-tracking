import { NavLink, Outlet } from "react-router";
import { Banners } from "./Banners.tsx";

export function Layout() {
  return (
    <>
      <Banners />
      <main>
        <Outlet />
      </main>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/bp/history">History</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </>
  );
}
