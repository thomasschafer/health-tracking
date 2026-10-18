# Operations

How to run the app on the laptop, set up backups, and recover data.

## Setting up a new machine

On a Mac set up with [dotfiles](https://github.com/thomasschafer/dotfiles), `./setup.sh personal`
does everything: it clones this repo, builds it, installs the background services (below) and
runs `scripts/setup-machine.sh`. Without dotfiles, clone and build the repo yourself, then run
that script.

`scripts/setup-machine.sh` asks for the settings file (`~/.config/health-tracking/env`): paste
a saved copy, or enter the R2 details. It restores the database from R2, then saves the
settings, and finally offers to serve the app over Tailscale. It is safe to re-run.

Keep a copy of the settings file in your password manager (as a secure note): every secret is
in it, so a new machine only needs it pasted in. The one secret that can't be recreated is
`LITESTREAM_SSE_CUSTOMER_KEY`; without it, the R2 backups can't be read.

For a brand new setup, create the R2 bucket and token first (see
[Setting up Cloudflare R2](#setting-up-cloudflare-r2)).

## Data and configuration locations

| What               | Where                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| Database           | `~/.local/share/health-tracking/health.db` (override with `HEALTH_DATA_DIR`) |
| Pre-import backups | `~/.local/share/health-tracking/backups/`                                    |
| Environment file   | `~/.config/health-tracking/env` (suggested)                                  |
| Litestream config  | `deploy/litestream.yml` in this repo (no secrets)                            |
| Service logs       | `~/.local/state/health-tracking/`                                            |

Nothing in these locations may ever be committed. The repo is public.

## Environment variables

| Variable                                                                             | Purpose                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `HEALTH_DATA_DIR`                                                                    | Where the database lives. Defaults to `~/.local/share/health-tracking`. |
| `HEALTH_HOST`, `HEALTH_PORT`                                                         | Listen address. Defaults to `127.0.0.1:8787`; keep it on localhost.     |
| `HEALTH_ALLOWED_TAILSCALE_LOGIN`                                                     | Optional. Only API requests from this Tailscale login are allowed.      |
| `LITESTREAM_CONFIG`                                                                  | Path to the Litestream config. Enables replica checks.                  |
| `LITESTREAM_ENDPOINT`                                                                | R2 endpoint, `https://<account ID>.r2.cloudflarestorage.com`.           |
| `LITESTREAM_BIN`                                                                     | Litestream binary. Defaults to `litestream` on the `PATH`.              |
| `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY`                           | R2 API token, read by Litestream.                                       |
| `LITESTREAM_SSE_CUSTOMER_KEY`                                                        | Encryption key for the R2 objects. Keep a copy off the laptop.          |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | Enable the daily Drive export. All three or none.                       |
| `HEALTH_BACKUP_CHECK_INTERVAL_HOURS`                                                 | How often backup checks run. Defaults to 24.                            |

## Running

Two launchd agents, defined in dotfiles, keep things running:

| Service                                     | Label                                               | Log                                             |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| The app (`scripts/start-server.sh`)         | `org.nix-community.home.health-tracking-server`     | `~/.local/state/health-tracking/server.log`     |
| Replication (`scripts/start-litestream.sh`) | `org.nix-community.home.health-tracking-litestream` | `~/.local/state/health-tracking/litestream.log` |

They start at login, restart if they crash, and only run once the settings file exists. Like
everything else, they pause while the Mac sleeps and catch up when it wakes.

To ship changes, run `scripts/deploy.sh`: it rebuilds the app and restarts the server.
Phones pick up the new version the next time the app is opened ("A new version is ready").

The app listens on `127.0.0.1:8787` only. Tailscale Serve exposes it over HTTPS (needed for the
PWA), which `scripts/setup-machine.sh` sets up:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:8787
```

Open `https://<machine>.<tailnet>.ts.net:8443` on the phone and add it to the home screen.

## Setting up Cloudflare R2

1. In the Cloudflare dashboard, enable R2. Then create the bucket, either in the dashboard or
   with `npx wrangler login` followed by
   `npx wrangler r2 bucket create health-tracking-backups --location weur`.
2. Create an R2 API token with "Object Read & Write" on that bucket only. Note the access key
   ID, secret access key and your account ID.
3. Generate an encryption key and save it in your password manager as well as the env file:
   `openssl rand -base64 32`.
4. Run `scripts/setup-machine.sh` and choose to enter the R2 details, or add them to the
   settings file yourself (see the variables above; `LITESTREAM_CONFIG` points at
   `deploy/litestream.yml` in this repo).
5. Once replication is running, run
   `node --env-file="$HOME/.config/health-tracking/env" scripts/backup-check.ts` to confirm a
   restore works end to end.

## Setting up the automatic Google Drive export (optional)

This is off by default; "Export all data" in Settings covers saving copies to Drive by hand.

1. In the Google Cloud console, create a project, enable the Google Drive API, and configure
   the OAuth consent screen as "External" with yourself as the only user.
2. Publish the consent screen to production. Apps left in testing mode have refresh tokens that
   expire after 7 days. The app only asks for the `drive.file` scope (files it created itself),
   so publishing doesn't need Google's verification.
3. Create an OAuth client of type "Desktop app" and put its ID and secret in the env file.
4. Run `npm run google:auth` with that environment, approve access in the browser, and add the
   printed `GOOGLE_OAUTH_REFRESH_TOKEN` to the env file.
5. Run `npm run backup:check` to upload and verify the first export. Files appear in a Drive
   folder called "Health tracking exports".

## Recovering data

From R2, if the laptop is lost or the database is damaged:

```sh
set -a; source ~/.config/health-tracking/env; set +a
litestream restore -config "$LITESTREAM_CONFIG" \
  -o ~/.local/share/health-tracking/health.db \
  ~/.local/share/health-tracking/health.db
```

Add `-timestamp 2026-10-17T20:00:00Z` to restore to a point in time.

From a Drive export, if R2 is unavailable: download the latest `health-export-*.json.txt` (or `.json` from the automatic export) and
rebuild a database from it, then move it into place while the server is stopped:

```sh
node scripts/restore-from-export.ts health-export-2026-10-17.json.txt /tmp/health.db
mv /tmp/health.db ~/.local/share/health-tracking/health.db
```

The CSV export opens directly in any spreadsheet if all else fails.

## Importing from the original sheet

```sh
npm run import:sheet -- path/to/sheet.csv            # dry run, writes import-review.md
npm run import:sheet -- path/to/sheet.csv --resolutions resolutions.json --apply
```

The import is idempotent and backs the database up before writing.
