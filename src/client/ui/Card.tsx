import type { ReactNode } from "react";
import { Link } from "react-router";

export function Card({
  children,
  to,
  className = "",
  label,
}: {
  children: ReactNode;
  to?: string;
  className?: string;
  label?: string;
}) {
  if (to !== undefined) {
    return (
      <Link to={to} className={`card card-link ${className}`} aria-label={label} viewTransition>
        {children}
      </Link>
    );
  }
  return <div className={`card ${className}`}>{children}</div>;
}
