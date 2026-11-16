# Student Portal — guide for Claude

You are helping develop **Student Portal**, a Windows desktop app for **AKI Consultant**, an educational consultancy in Kuwait that helps students apply to universities abroad. The owner is Imran (admin). Read this whole file before changing anything.

## What the app must stay
- **Standalone.** It runs without Claude or any AI service. Claude is only the development tool.
- **Free to run.** Database = AKI's own **Supabase free tier**. Student documents (coming) = AKI's dedicated **Google Drive** account. Don't add paid services without asking.
- **Windows desktop** (Tauri 2). Small team (under 5 staff, under 500 students a year), several people working at the same time.
- **No data in this repository.** The repo is public. Never commit student data, keys, passwords or the Supabase URL. Each computer enters the Supabase URL and public key on first launch.
- **English now, Arabic later.** All interface text goes through `t('English text')` (`web/js/i18n.js`), and CSS uses logical properties (`margin-inline-start`, `inset-inline-end`, …) so right-to-left works without a rewrite. Keep doing both.
- **Professional, simple and reliable** for non-technical office staff. Plain-English messages, no jargon.

## How it's built
```
web/                    the whole interface: plain HTML/CSS/JS ES modules, NO build step, no npm packages
  index.html, styles.css
  js/app.js             start-up, connect screen, sign-in, sidebar navigation, hash router (#/students/<id>/<tab>), self-update banner
  js/api.js             Supabase REST client (auth, select/insert/update/remove/rpc), friendly error messages,
                        optimistic locking: update(table, id, patch, expectUpdatedAt) fails if someone else saved first
  js/store.js           shared state: signed-in profile, permissions (can('perm')), statuses, employees, roles
  js/ui.js              h() element builder, icons, modal/confirm/toast, date formatting (dd Mon yyyy, 12-hour)
  js/i18n.js            t() translation layer
  js/fields.js          student profile fields (grouped), option lists, permission list
  js/home.js            Home: today's follow-ups, stats, pipeline, expiring passports/Civil IDs, recent activity
  js/students.js        student list (search/filter/sort), profile tabs, new-student form, communication log, change history
  js/followups.js       follow-up reminders, Tasks page, WhatsApp (whatsapp://send) and email (mailto:) buttons
  js/requests.js        requests to the Admin (remove student, temporary Finance access), one-time codes, Notifications page
  js/settings.js        my account, employees, roles & permissions, statuses, activity log, connection/about
src-tauri/              Windows shell (Rust): window, single instance, open_external (WhatsApp/mail/https), self-update from GitHub Releases
docs/supabase-setup.sql the complete database: tables, row-level security, audit triggers, functions. Safe to re-run.
.github/workflows/      every push to main builds the installer and publishes a GitHub Release ("v<version>-build<run number>")
```

### Database (Supabase / Postgres)
- `profiles` (one per login, `role_id`, `extra_perms`, `revoked_perms`, `active`), `roles` (`perms` array, `{*}` = everything), `temp_grants` (time-limited permissions).
- `my_perms()` / `has_perm('x')` compute effective permissions; **every rule is enforced by row-level security in the database**, not just hidden in the UI. When you add a table, add RLS policies for it.
- `students`, `contacts` (communication log), `follow_ups`, `statuses` (customisable), `admin_requests` (remove_student / finance_access, with hashed one-time codes).
- `stamp_row()` trigger fills created_by/at, updated_by/at. `audit_row()` trigger writes every insert/update/delete with a field-by-field diff to `audit_log` (append-only; nobody can edit it). New tables that matter should get both triggers (see the `do $$ … foreach t in array …` block).
- The first account created becomes the Admin. Admins add employees from the app (Supabase sign-up with "Confirm email" off); new logins are inactive until given a role.
- Permission names: `students.view/create/edit/delete/export`, `universities.view/manage`, `documents.view/upload/delete`, `visa.view/edit`, `finance.view/edit/manage`, `tasks.assign`, `users.manage`, `settings.manage`, `audit.view`, `backup.export`.

### Changing the database
`docs/supabase-setup.sql` must always build the complete, current database from scratch **and** be safe to re-run on an existing one (`create table if not exists`, `create or replace function`, `add column if not exists`, policies dropped and recreated). For a change, update that file, and tell the admin to run it again in Supabase → SQL Editor (mention it in the commit message, which becomes the release notes). Never drop or rename columns that hold data without a migration that keeps the data.

## Owner's decisions (keep them)
- Mandatory student fields: **Name, Number (phone), DOB**. Note shown as "Mandatory: Name, Number, DOB".
- Same Civil ID or passport number can't be registered twice; restore matching uses Civil ID + passport number.
- Each university application gets its own status, plus one overall student status.
- Only Admins remove students. Others send a removal request; the Admin removes it, rejects, or creates a one-time code **on the Admin's computer** (only its hash is stored) that lets that employee do it once. Finance access works the same way (temporary access). Notifications are **in-app only** (Notifications page + badge), no Windows pop-ups.
- Follow-ups: set from a student's profile (date + reminder + who it's for); shown on Home ("Today's follow-ups") and Tasks, with a WhatsApp button (opens WhatsApp Desktop; 8-digit numbers get +965) and an email button (default mail app, student's name filled in).
- Communication log is entered manually. Student IDs shown as `AKI-00001`.
- Branding: AKI Consultant logo (`web/img/logo.png`), colours from the logo (cyan `#1aa9cf`, deep teal `#0b7ea3`, coral, yellow), Inter font, light theme.

## Roadmap (agreed order)
1. ✅ Sign-in, roles, employees, students, statuses, communication log, history, follow-ups/tasks, admin requests
2. Applications per university (own status, offers, deadlines) and **documents**: upload/preview/download per student, categories, stored on AKI's Google Drive through a secured server function (staff never get Drive access directly). The **admin's laptop keeps a full local copy**: one folder per student named `<Student Name> - AKI-00001` in a folder the admin chooses, synced by the Windows app even when other employees upload.
3. Universities & course catalogues (import + manual edits), commission terms per university
4. Visa: unlocks at Offer Accepted, previous-refusals check, per-country checklist, appointments, decision/expiry; Visa Guides for UK, USA, Canada, Australia, New Zealand, Malaysia, Turkey, UAE, Germany, Hungary, Netherlands, Ireland (process from Kuwait, funds, statement rules, editable with "last verified" date); bank statement calculator (living cost × months + tuition − paid + dependants, shown in KWD, statement date checks)
5. Finance: commissions (% of first-year tuition or fixed, optional aggregator cut), expected vs received, IELTS / visa / translation income, occasional student fees, expenses, reports in KWD, multi-currency
6. Backups: nightly Drive snapshot (keep 7 nightly + 1 per month forever), daily CSV of all student data (no documents) auto-saved on the admin PC at a set time (default 5 PM), CSV import/restore, export only for `backup.export`

## Working on it
- **Update this file in the same commit as every change** (features, decisions, database, roadmap status), so it always matches the latest code. The app's Settings → Connection & about page links to this file on GitHub for anyone continuing the work with their own Claude.
- Keep the no-build-step approach: plain ES modules, no frameworks, no npm dependencies in `web/`.
- Test the interface by serving `web/` locally with a fake `fetch` for Supabase, and test SQL against a local Postgres with a small mock `auth` schema (`auth.users`, `auth.uid()` reading `request.jwt.claim.sub`).
- Bump `version` in `src-tauri/tauri.conf.json` and `Cargo.toml` for notable releases (the build number always increases on its own, which is what triggers the in-app update).
- Commit to `main` only when the owner asks; each push publishes a new release that every installed copy will offer to install.
