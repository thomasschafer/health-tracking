# Operations

How to run the app on the laptop, set up backups, and recover data.

## Setting up a new machine

Once the accounts exist, every secret a machine needs is in `~/.config/health-tracking/env`.
Keep a copy of that file in your password manager (as a secure note) so a new machine only
needs it pasted back.

1. Install Node 26, Git and Tailscale, and sign in to Tailscale.
2. Clone the repo, then run `npm ci && npm run build`.
3. Recreate `~/.config/health-tracking/env` from your password manager, and copy
   `deploy/litestream.example.yml` to `~/.config/health-tracking/litestream.yml` with your
   Cloudflare account ID filled in. Make both readable only by you (`chmod 600`).
4. Install Litestream (`scripts/install-litestream.sh` puts a verified copy in `.tools/bin`).
5. Restore the database from R2 (see [Recovering data](#recovering-data)). Skip this on a
   brand new setup.
6. Start the app and Litestream (see [Running](#running)), then run `npm run backup:check`.
7. Expose the app with Tailscale Serve and add it to your phone's home screen.

For a brand new setup, first create the accounts as described in
[Setting up Cloudflare R2](#setting-up-cloudflare-r2) and
[Setting up the automatic Google Drive export](#setting-up-the-automatic-google-drive-export-optional) if you want it.

## Data and configuration locations

| What               | Where                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| Database           | `~/.local/share/health-tracking/health.db` (override with `HEALTH_DATA_DIR`) |
| Pre-import backups | `~/.local/share/health-tracking/backups/`                                    |
| Environment file   | `~/.config/health-tracking/env` (suggested)                                  |
| Litestream config  | `~/.config/health-tracking/litestream.yml` (suggested)                       |

Nothing in these locations may ever be committed. The repo is public.

## Environment variables

| Variable                                                                             | Purpose                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `HEALTH_DATA_DIR`                                                                    | Where the database lives. Defaults to `~/.local/share/health-tracking`. |
| `HEALTH_HOST`, `HEALTH_PORT`                                                         | Listen address. Defaults to `127.0.0.1:8787`; keep it on localhost.     |
| `HEALTH_ALLOWED_TAILSCALE_LOGIN`                                                     | Optional. Only API requests from this Tailscale login are allowed.      |
| `LITESTREAM_CONFIG`                                                                  | Path to the Litestream config. Enables replica checks.                  |
| `LITESTREAM_BIN`                                                                     | Litestream binary. Defaults to `litestream` on the `PATH`.              |
| `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY`                           | R2 API token, read by Litestream.                                       |
| `LITESTREAM_SSE_CUSTOMER_KEY`                                                        | Encryption key for the R2 objects. Keep a copy off the laptop.          |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | Enable the daily Drive export. All three or none.                       |
| `HEALTH_BACKUP_CHECK_INTERVAL_HOURS`                                                 | How often backup checks run. Defaults to 24.                            |

## Running

```sh
npm ci
npm run build
scripts/start-server.sh       # the app
scripts/start-litestream.sh   # replication to R2, once it is set up
```

Both scripts read `~/.config/health-tracking/env` (override with `HEALTH_ENV_FILE`), so they can
be run as they are by launchd.

Expose it to the tailnet over HTTPS (needed for the PWA):

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:8787
```

Then open `https://<machine>.<tailnet>.ts.net:8443` on the phone and use "Add to Home Screen".

The server and Litestream both need to run whenever the laptop is awake. Starting them
automatically (launchd) is to be set up in the dotfiles repo.

## Setting up Cloudflare R2

1. In the Cloudflare dashboard, enable R2. Then create the bucket, either in the dashboard or
   with `npx wrangler login` followed by
   `npx wrangler r2 bucket create health-tracking-backups --location weur`.
2. Create an R2 API token with "Object Read & Write" on that bucket only. Note the access key
   ID, secret access key and your account ID.
3. Generate an encryption key and save it in your password manager as well as the env file:
   `openssl rand -base64 32`.
4. Copy `deploy/litestream.example.yml` to `~/.config/health-tracking/litestream.yml` and fill
   in the account ID.
5. Add `LITESTREAM_CONFIG`, `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` and
   `LITESTREAM_SSE_CUSTOMER_KEY` to the env file.
6. Run `litestream replicate -config ~/.config/health-tracking/litestream.yml` with that
   environment, then `npm run backup:check` to confirm a restore works end to end.

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
litestream restore -config ~/.config/health-tracking/litestream.yml \
  -o ~/.local/share/health-tracking/health.db \
  ~/.local/share/health-tracking/health.db
```

Add `-timestamp 2026-10-17T20:00:00Z` to restore to a point in time.

From a Drive export, if R2 is unavailable: download the latest `health-export-*.json` and
rebuild a database from it, then move it into place while the server is stopped:

```sh
node scripts/restore-from-export.ts health-export-2026-10-17.json /tmp/health.db
mv /tmp/health.db ~/.local/share/health-tracking/health.db
```

The CSV export opens directly in any spreadsheet if all else fails.

## Importing from the original sheet

```sh
npm run import:sheet -- path/to/sheet.csv            # dry run, writes import-review.md
npm run import:sheet -- path/to/sheet.csv --resolutions resolutions.json --apply
```

The import is idempotent and backs the database up before writing.
