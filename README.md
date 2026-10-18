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
npm run dev:server   # API on :8787, using ~/.local/share/health-tracking unless HEALTH_DATA_DIR is set
npm run dev          # Vite dev server with the API proxied
npm run check        # type-check, lint, format check and unit tests
npm run build && npm run test:e2e
```

This repository is public. Never commit health data, databases, exports or credentials.
