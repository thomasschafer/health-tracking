import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

interface ListRowProps {
  title: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  icon?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
}

/** A row in a grouped list. Rows with a destination or action render as links or buttons. */
export function ListRow({
  title,
  detail,
  value,
  icon,
  to,
  href,
  onClick,
  chevron,
  destructive,
}: ListRowProps) {
  const content = (
    <>
      {icon !== undefined && <span className="list-icon">{icon}</span>}
      <span className="list-text">
        <span className={destructive === true ? "list-title destructive" : "list-title"}>
          {title}
        </span>
        {detail !== undefined && <span className="list-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className="list-value">{value}</span>}
      {(chevron ?? (to !== undefined || href !== undefined)) && (
        <ChevronRight className="list-chevron" size={18} aria-hidden="true" />
      )}
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} className="list-row interactive" viewTransition>
        {content}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a href={href} className="list-row interactive" download>
        {content}
      </a>
    );
  }
  if (onClick !== undefined) {
    return (
      <button type="button" className="list-row interactive" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="list-row">{content}</div>;
}
