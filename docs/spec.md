# Health tracking: spec

A personal health app, used by one person, starting with blood pressure. It replaces a Google
Sheet that was edited by hand.

## Goals

- Recording a blood pressure session on a phone takes seconds.
- The app does all the calculation (averages, morning and evening splits, trends); storage holds
  only raw readings.
- Data is never lost: not if the phone is offline, the laptop is asleep, or the laptop dies.
- It grows into a general health app (weight, sleep, medication and so on) without a rewrite.

## How it runs

- A Node server on the MacBook stores data in SQLite and serves the app. It listens on
  localhost only, and Tailscale Serve exposes it over HTTPS to devices on the tailnet.
- The app is a PWA, installed to the phone's home screen. It opens without the laptop, showing
  the last data it fetched.
- Single user, no login. Being on the tailnet is the access control, optionally tightened by
  checking the Tailscale login header (`HEALTH_ALLOWED_TAILSCALE_LOGIN`).

## Blood pressure

- A session is a time, one to five readings and an optional note. Each reading is systolic,
  diastolic and an optional pulse. New sessions default to three readings; the default can be
  changed in settings and adjusted per session.
- The time defaults to the moment the form opens and can be edited for back-filling.
- Readings outside plausible ranges, or with diastolic at or above systolic, are rejected.
  Unusual but plausible values get a warning.
- Sessions can be edited and deleted. Deleting is a soft delete with an undo.
- Morning is 03:00 to 11:59 London time; everything else is evening. Readings taken after
  midnight count towards the previous day's evening.
- Averages weight each session equally. Categories use NICE home-monitoring thresholds
  (135/85 for stage 1, 150/95 for stage 2) and are shown for multi-day averages, not single
  readings.
- All times are stored as UTC instants and displayed in Europe/London.

## Offline behaviour

- A new session is written to the phone's IndexedDB before it is sent. If the laptop can't be
  reached it stays queued and syncs automatically later.
- While anything is unsynced, a banner that can't be dismissed says so.
- Sessions have client-generated IDs, so resending is safe: identical content is a no-op, while
  different content under the same ID is rejected as a conflict and flagged for review rather
  than dropped.
- Edits, deletes and settings changes need the laptop.

## Backups

Three layers, each verified automatically:

1. Litestream streams every change to Cloudflare R2, encrypted with a key Cloudflare doesn't
   store.
2. Every day the app uploads a full JSON export and a CSV of all readings to a folder in Google
   Drive. These are readable without the app.
3. Every day the app restores the R2 replica into a temporary file, runs an integrity check
   and confirms it matches the live data. It also re-downloads each Drive upload to confirm
   it is byte-for-byte correct, and rebuilds a database from the JSON to prove it is complete.

If a backup isn't set up, has failed, or hasn't been verified for 36 hours, the app shows a
banner that can't be dismissed.

## History

The original sheet's Data tab was imported once with `npm run import:sheet`. Rows that
couldn't be imported unambiguously were left for manual review rather than guessed at. The
sheet itself is kept as an archive and is no longer written to.
