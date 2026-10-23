# health-tracking

A personal health tracking PWA, starting with blood pressure. It runs on a laptop, is reached
from a phone over Tailscale, and stores data in SQLite with verified off-site backups.

- [Spec](docs/spec.md): what the app does and why.
- [Operations](docs/operations.md): setting up a new machine, running it, setting up backups
  and recovering data.

## Development

Requires Node 26.

```sh
npm ci
npm run dev:seed     # optional: copy a snapshot of your real database into .dev-data
npm run dev:server   # API on :8789, with its data in .dev-data
npm run dev          # Vite dev server with the API proxied
npm run check        # type-check, lint, format check and unit tests
npm run build && npm run test:e2e
```

Development uses its own port and data directory, so it never touches a running copy of the
app, its database or its backups. Set `HEALTH_PORT` or `HEALTH_DATA_DIR` to override them. It
also accepts any request, rather than only those Tailscale Serve forwards from your login (see
`HEALTH_AUTH` in [Operations](docs/operations.md#environment-variables)).

This repository is public. Never commit health data, databases, exports or credentials.
