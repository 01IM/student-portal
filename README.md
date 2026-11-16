# Student Portal · AKI Consultant

A Windows desktop app for managing AKI Consultant's students, universities, applications, documents, visas and finances. Several employees can work in it at the same time, and every computer sees the same data.

It runs on its own: no Claude, no subscription. The database is AKI's own free Supabase project, and student documents will live on AKI's own Google Drive. **This repository contains only the app's code.** No student data, passwords or keys are ever stored here.

## What's in this version (phase 1)

- Employee sign-in with roles (Admin, Counsellor, Accountant, Front desk), custom roles, and per-person permission adjustments
- Admin screen to add, deactivate and reset employees
- Student database: register, search, filter, sort, and full profiles (personal, Civil ID / passport, contact & guardian, education, study preferences, notes)
- Customisable student statuses with colours and pipeline order
- Duplicate check when registering (same Civil ID or passport can't be registered twice)
- Communication log per student (calls, WhatsApp, emails, visits)
- Follow-up reminders set from a student's profile, shown on Home ("Today's follow-ups") and on the Tasks page, with one-click WhatsApp and email
- Only Admins remove students; employees send a removal request or use a one-time code the Admin creates. Finance access can be requested the same way. Requests and answers appear under Notifications.
- Settings → Connection & about (Admin): starter text and a guide ([CLAUDE.md](CLAUDE.md)) so anyone can continue developing the app with their own Claude
- Full change history per student, plus a company-wide activity log: who changed what, when, from what to what
- Home screen with today's follow-ups, pipeline and recent activity
- Automatic updates

**Coming next:** applications per university and documents (with a full local copy on the admin's laptop) → universities, tasks & reminders → visa section, guides and bank statement calculator → finance → backups (nightly Drive snapshots, daily CSV on the admin PC, CSV restore).

---

## One-time setup (about 15 minutes, done by the admin)

### 1. Create the database (free)
1. Go to **supabase.com** → sign up (use the dedicated AKI Google account) → **New project**.
2. Name: `AKI Student Portal`. Set a strong database password and save it somewhere safe. Region: **Central EU (Frankfurt)**. Plan: **Free**.
3. Wait about a minute for the project to start.

### 2. Two sign-in settings
In the project: **Authentication → Sign In / Providers → Email**
- Turn **Confirm email** **off** (employees are added by the admin, so no confirmation emails are needed).
- Keep **Allow new users to sign up** **on** (the app uses it when the admin adds an employee; new accounts can't see anything until the admin gives them a role).

### 3. Create the tables
1. **SQL Editor → New query**.
2. Open [`docs/supabase-setup.sql`](docs/supabase-setup.sql), copy everything, paste it in, click **Run**. You should see *Success*.

### 4. Create your admin account
**Authentication → Users → Add user → Create new user**: your email and a password, tick **Auto Confirm User**.
The first account ever created automatically becomes the active **Admin**.

### 5. Copy the two connection values
**Project Settings → API** (or **API Keys**): copy the **Project URL** and the **anon public** key (or **publishable** key).

### 6. Install the app on each computer
1. On this page, open **Releases** (right-hand side) → download the newest file ending in **`-setup.exe`** → run it.
   Windows may say *"Windows protected your PC"* because the app isn't signed with a paid certificate: click **More info → Run anyway**.
2. On first launch, paste the Project URL and key, then sign in.
3. Add employees in **Settings → Employees → Add employee**. Give each person their email and the temporary password shown; they choose their own password when they first sign in.

Updates install themselves: when a new version is published, an **Update available** box appears at the bottom of the menu.

---

## Good to know

- **Free plan limits:** 500 MB of database (enough for many thousands of students) and 50,000 sign-ins a month. A free Supabase project **pauses after 7 days without any use**; normal daily office use keeps it awake. If it ever pauses, open the project on supabase.com and click **Restore**.
- **Security:** every rule about who can see or change what is enforced by the database itself, not just hidden in the app. Deactivating an employee locks them out immediately. The activity log can't be edited or deleted by anyone, including admins.
- **Updating the database:** when a new version needs database changes, the release notes will say so and include a SQL file to run once, the same way as step 3.

## For developers

- `web/`: the interface (plain HTML, CSS and JavaScript modules; no build step)
- `src-tauri/`: the Windows shell (Tauri 2): window, single instance, self-update from GitHub Releases
- `docs/supabase-setup.sql`: tables, permissions (row-level security), audit triggers
- `.github/workflows/build-windows.yml`: builds and publishes the installer on every push to `main`
- Arabic: all interface text goes through `t()` in `web/js/i18n.js`, and the layout uses logical CSS properties, so adding Arabic means filling in the dictionary.
