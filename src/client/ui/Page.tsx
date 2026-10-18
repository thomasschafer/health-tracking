import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";

interface PageProps {
  title: string;
  subtitle?: string;
  back?: { to: string; label: string };
  /** Shown to the right of the title, e.g. an add button. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * A screen with an iOS-style large title. Once the title scrolls away, a compact bar with the
 * title (and back link) stays pinned to the top.
 */
export function Page({ title, subtitle, back, action, children }: PageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry !== undefined) setCompact(!entry.isIntersecting);
      },
      { rootMargin: "-44px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const backLink = back !== undefined && (
    <Link to={back.to} className="back-link" viewTransition>
      <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
      {back.label}
    </Link>
  );

  return (
    <div className="page">
      <div className={compact ? "compact-bar visible" : "compact-bar"} aria-hidden={!compact}>
        <span className="compact-bar-side">{compact && backLink}</span>
        <span className="compact-bar-title">{title}</span>
        <span className="compact-bar-side" />
      </div>
      <header className="page-header">
        {backLink}
        {subtitle !== undefined && <p className="page-subtitle">{subtitle}</p>}
        <div className="page-title-row">
          <h1 className="page-title" ref={titleRef}>
            {title}
          </h1>
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
