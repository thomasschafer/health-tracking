# Agent notes

This app is maintained by agents, so keep it easy to change safely.

- The repo is public. Never commit health data, databases, CSV or JSON exports, or credentials.
  `scripts/check-no-data.sh` and gitleaks run in CI.
- TypeScript is strict everywhere. Validate data at every boundary with the zod schemas in
  `src/shared` (API input, database rows, IndexedDB, imports) and fail loudly on anything
  unexpected rather than guessing.
- The server runs TypeScript directly with Node's type stripping, so only erasable syntax is
  allowed (no enums, namespaces or parameter properties) and imports use `.ts` extensions.
- The phone may run an older cached version of the client than the server. Keep API responses
  backward compatible, and parse responses on the client with schemas that drop unknown keys
  (inputs stay strict).
- Schema changes go in `src/server/db/schema.ts`, followed by `npm run db:generate`. Never edit
  generated migrations. CI fails if the schema and migrations disagree.
- Every change to user data must keep backups verifiable: new tables holding user data belong
  in `DATA_TABLES` in `src/server/backup/replica-check.ts` and in the JSON export.
- Follow `docs/design.md` for UI work, and check visual changes with `scripts/screenshots.ts`
  in light and dark mode before committing.
- Keep the docs in `docs/` current when behaviour changes.
- Before pushing, run `npm run check`, then `npm run build && npm run test:e2e`.
