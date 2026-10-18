# Design

The app should feel like a native iPhone app: calm, quick to use and never tacky. These notes
keep it consistent as categories are added.

## Principles

- Data first. Numbers are large, use rounded figures (`.rounded-nums`) and sit on quiet
  surfaces. Decoration never competes with values.
- One identity colour per category (`--bp` for blood pressure), used for its icon, chart marks
  and primary buttons. Status colours (good, warning, serious, critical) are reserved for health
  status and always come with a label.
- Fast entry. Logging is reachable in one tap from Summary and the category page, uses an
  in-app keypad, and moves between fields on its own.
- Never lose data silently. Unsynced readings and backup problems show as notices that can't be
  dismissed. Drafts survive the app closing.
- Motion is short (under 300ms), eases out, and is disabled for reduced-motion users.

## Structure

- Summary (`/`): one card per category plus highlights drawn from each category's insights.
- Browse (`/browse`): every category.
- Category pages: an overview with a chart, insights and recent entries; a full history; and a
  full-screen entry flow without the tab bar.
- Settings (`/settings`): per-category preferences, sync and backup status.

## Adding a category

1. Add its identity colour to `src/client/styles/tokens.css` (light and dark) and check the
   contrast of text on it.
2. Build its pages under `src/client/categories/<id>/`, reusing the components in
   `src/client/ui/`.
3. Register it in `src/client/categories/registry.tsx` with a summary card and highlights.
4. Add its routes in `src/client/main.tsx`.

## Charts

Charts follow the dataviz guidance: thin marks, recessive gridlines, no dual axes, one series
colour per measure, values in text colours rather than series colours, and a scrubbable readout
so every value is reachable without hovering precisely.

## Reviewing changes visually

With the app running, `node scripts/screenshots.ts http://127.0.0.1:8787 /tmp/shots` saves
the main screens on an iPhone viewport in light and dark mode.
