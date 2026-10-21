# Operations

How to run the app on the laptop, set up backups, and recover data.

## Setting up a new machine

With the accounts below already set up, this is mostly automatic. On a Mac set up with
[dotfiles](https://github.com/thomasschafer/dotfiles), `./setup.sh personal` clones this repo,
deploys it, installs the background services (see [Running](#running)) and runs
`scripts/setup-machine.sh`. Without dotfiles, install Node 26, clone and build the repo
(`npm ci && npm run build`), then run that script.

`scripts/setup-machine.sh` asks for the settings file (`~/.config/health-tracking/env`): paste
a saved copy, or enter the R2 details. It restores the database from R2, then saves the
settings, and finally offers to serve the app over Tailscale. It is safe to re-run.

Keep a copy of the settings file in your password manager (as a secure note): every secret is
in it, so a new machine only needs it pasted in. The one secret that can't be recreated is
`LITESTREAM_SSE_CUSTOMER_KEY`; without it, the R2 backups can't be read.

## Starting from nothing

For a new person, or after losing the accounts. Do these in order; each takes a few minutes.

1. **Tailscale.** Create a tailnet at tailscale.com and turn on MagicDNS and HTTPS
   certificates (both under DNS in the admin console; HTTPS is needed for the PWA). Install
   Tailscale on the Mac and the phone and sign both in.
2. **Cloudflare R2.** Create a Cloudflare account and follow
   [Setting up Cloudflare R2](#setting-up-cloudflare-r2) to create the bucket and an API token.
   Don't create an encryption key yet; the next step does.
3. **The Mac.** Set it up as in [Setting up a new machine](#setting-up-a-new-machine). When
   `scripts/setup-machine.sh` asks for the settings file, choose to enter the R2 details and
   leave the encryption key blank to generate one. Save the key it prints, and then the whole
   settings file, in your password manager straight away.
4. **The phone.** Open the address the setup script prints
   (`https://<machine>.<tailnet>.ts.net:8443`) and add it to the home screen: Share, then Add
   to Home Screen on iPhone; the menu, then Add to Home screen on Android.
5. **Check it.** Add a reading on the phone, then confirm backups work end to end with
   `scripts/check-backups.sh`. The app's
   Settings should show the cloud backup as verified.
6. **Backup monitor.** Set up the [backup monitor](#backup-monitor), so you hear about it if
   backups stop.
7. **Copies elsewhere.** In the app, use Export all data to save a first copy to Google Drive
   or similar. The app reminds you every 30 days.
8. **Optional:** set up the [automatic Google Drive export](#setting-up-the-automatic-google-drive-export-optional).

To bring over existing data, restore the database from R2 or an export (see
[Recovering data](#recovering-data)) before step 3 saves the settings file, or import the
original sheet (see [Importing from the original sheet](#importing-from-the-original-sheet)).

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

Two launchd agents, defined in dotfiles, keep things running. With dotfiles, they run the
latest deployed commit (see below) rather than this checkout:

| Service                                     | Label                                               | Log                                             |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| The app (`scripts/start-server.sh`)         | `org.nix-community.home.health-tracking-server`     | `~/.local/state/health-tracking/server.log`     |
| Replication (`scripts/start-litestream.sh`) | `org.nix-community.home.health-tracking-litestream` | `~/.local/state/health-tracking/litestream.log` |

They start at login, restart if they crash, and only run once the settings file exists. Like
everything else, they pause while the Mac sleeps and catch up when it wakes.

To ship changes, commit them, then run `deploy health-tracking` (from dotfiles). It builds `main`
in a fresh copy under `~/.local/share/deploys/health-tracking`, and only switches to it and
restarts both services if the build succeeds. `deploy health-tracking <ref>` deploys another
commit, such as an older one to roll back. Without dotfiles, run `npm run build` and restart
the server. Phones install the new version by themselves at the next safe moment, such as when
the app is next opened.

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
3. Have an encryption key for the backups: `scripts/setup-machine.sh` generates one if you
   leave it blank, or use `openssl rand -base64 32`. Save it in your password manager.
4. Run `scripts/setup-machine.sh` and choose to enter the R2 details, or add them to the
   settings file yourself (see the variables above; `LITESTREAM_CONFIG` points at
   `deploy/litestream.yml` in this repo).
5. Once replication is running, run
   `scripts/check-backups.sh` to confirm a
   restore works end to end.

## Backup monitor

A Cloudflare Worker (`monitor/` in this repo) checks once a day that the R2 backups are still
being updated. Backups change at least daily while the laptop is awake, because the app's daily
restore check writes to the database and Litestream takes a daily snapshot. If the newest file
in the bucket is more than 72 hours old, the Worker creates a Todoist task, "Health tracking
backups have stopped", and closes it again once backups resume.

The Worker only lists file names and upload times in the bucket. It never reads the backups,
which it couldn't decrypt anyway, and it has no public URL.

To set it up, with Wrangler logged in to the account that owns the bucket (`npx wrangler login`):

```sh
npm run monitor:deploy
npx wrangler secret put TODOIST_TOKEN --config monitor/wrangler.jsonc
```

The Todoist token is under Settings, Integrations, Developer in Todoist. Redeploy after changing
anything in `monitor/`. To see recent runs, open the Worker in the Cloudflare dashboard and look
at its logs.

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
