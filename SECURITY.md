# Security Policy

## Reporting a vulnerability

Please report security issues privately by email to **fazalabbas2002@gmail.com** rather than opening a public issue. Include steps to reproduce and the affected version or commit.

You can expect an acknowledgement within 5 days. Once a fix is ready, it will be released and the report credited if you'd like.

## Scope

In scope: the Laravel API (`api/`) and the React app (`web/`). Please only test against your own local copy — do not scan or load-test any hosted instance.

## What's already in place

- Bearer tokens (Laravel Sanctum) that expire after 7 days; the API sets no cookies
- Every client, voice note, call log and task is scoped to the signed-in user's organization; records from other organizations return 404. Reps see their own notes; managers see their whole organization's
- Manager-only routes (team, dashboard, prompt settings) are checked on the server, not just hidden in the UI
- Voice note audio is encrypted at rest with AES-256-GCM before it reaches the disk or bucket, and is only served back through an authenticated endpoint. Transcripts, parsed results, call summaries and task titles are encrypted at rest with Laravel's encrypter
- Uploads are limited to 25 MB and checked by their actual contents, not just the file name
- Rate limits on sign-in, registration, the demo sign-in, uploads, processing and the API as a whole
- On PostgreSQL, the app connects as its own role that owns a dedicated schema, and row level security is switched on for every table, so other database roles are denied
- Security headers on API responses; CORS limited to the configured web app origin; a Content-Security-Policy on the web app
- The demo organization is shared, so notes uploaded there are deleted after 24 hours
