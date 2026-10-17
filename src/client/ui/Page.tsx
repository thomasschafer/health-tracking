import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface PageProps {
  title: string;
  subtitle?: string;
  back?: { to: string; label: string };
  /** Shown to the right of the title, e.g. an add button. */
  action?: ReactNode;
  children: ReactNode;
}

/** A screen with an iOS-style large title. */
export function Page({ title, subtitle, back, action, children }: PageProps) {
  return (
    <div className="page">
      <header className="page-header">
        {back !== undefined && (
          <Link to={back.to} className="back-link" viewTransition>
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <div className="page-title-row">
          <div>
            {subtitle !== undefined && <p className="page-subtitle">{subtitle}</p>}
            <h1 className="page-title">{title}</h1>
          </div>
          {action}
        </div>
      </header>
      <div className="page-body">{children}</div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  footer,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="section">
      {(title !== undefined || action !== undefined) && (
        <div className="section-header">
          {title !== undefined && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
      {footer !== undefined && <div className="section-footer">{footer}</div>}
    </section>
  );
}
