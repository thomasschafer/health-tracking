import { CATEGORIES } from "../categories/registry.tsx";
import { List, ListRow } from "../ui/List.tsx";
import { Page } from "../ui/Page.tsx";

export function BrowsePage() {
  return (
    <Page title="Browse">
      <List>
        {CATEGORIES.map((c) => (
          <ListRow
            key={c.id}
            to={c.path}
            icon={
              <span className="category-icon" style={{ background: `var(${c.colorVar})` }}>
                <c.icon size={18} color="white" aria-hidden="true" />
              </span>
            }
            title={c.name}
            detail={c.description}
          />
        ))}
      </List>
    </Page>
  );
}
