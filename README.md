# Asthra 11.0 KeyBreak Cipher Clash

Cybersecurity cipher competition platform for Asthra 11.0. The frontend is React + TypeScript + Vite, the event database is Supabase, and production server actions run through Vercel Functions.

## Features

- Participant login with bcrypt-backed server verification
- Short-lived signed participant sessions
- Server-side answer validation, timing, scoring, decay, and timeout skip rules
- Admin passkey with signed admin JWT
- Participant registration, roles, ban/unban, reset, password reset, and point penalties
- Question/flag add, edit, delete, renumbering, and active-round count
- Competition states: `WAITING`, `LIVE`, and `ENDED`
- Configurable time per question and points-per-second decay
- Live leaderboard with dynamic flag count
- Browser proctoring for tab switches and window blur
- Server-backed anti-cheat incident log with atomic warning counts
- Safe trial reset that preserves questions and accounts

## Architecture

```text
Browser
  -> Vercel Functions (/api/*)
      -> Supabase service-role client / protected RPCs
  -> Supabase public views
      -> questions_public, participants_public, competition_settings
```

Participant answers, skips, team-name changes, and warning reports go through authenticated participant APIs. Admin mutations go through `/api/admin/action` with an admin JWT. Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `JWT_SECRET` to the browser.

## Local Setup

Requirements:

- Node.js 20+
- A Supabase project
- Vercel CLI for testing server functions locally, recommended

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env.local` and configure:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSKEY=your-secure-admin-passkey
JWT_SECRET=your-random-secret-at-least-32-chars
```

Run the frontend only:

```bash
npm run dev
```

For real API routes and server-side authentication, use:

```bash
npx vercel dev
```

Plain Vite mode is only a local demo fallback. It does not provide production-grade auth or server-side scoring.

## Supabase Setup

1. Open Supabase SQL Editor.
2. Run the complete `supabase_schema.sql` from this repository.
3. Confirm the following exist:
   - `participants_public`
   - `questions_public`
   - `competition_settings`
   - `rpc_submit_answer`
   - `rpc_skip_question`
   - `rpc_start_competition`
   - `rpc_increment_warning`
   - `rpc_delete_question`
4. Confirm `participants.password_hash` exists.
5. Confirm anon has read access only to safe views/settings, not raw `participants`, `questions`, `submissions`, or `warnings`.
6. Confirm `service_role` can execute the protected RPCs.

The schema migration renames the old `password` column to `password_hash`. Existing legacy plaintext passwords are upgraded to bcrypt on their next successful login. Back up the database before migration.

## Vercel Setup

Connect the repository to Vercel and set these variables for Production, Preview, and Development as appropriate:

| Variable | Browser-visible | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Restricted public key |
| `SUPABASE_URL` | No | Server Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-only database key |
| `ADMIN_PASSKEY` | No | Admin passkey |
| `JWT_SECRET` | No | Admin/participant JWT signing secret |

Redeploy after changing environment variables. Never add the service-role key, JWT secret, or admin passkey with a `VITE_` prefix.

## Admin Access

Open:

```text
https://your-domain.example/challenge/admin
```

Authenticate with `ADMIN_PASSKEY`. The admin panel contains:

- **Roster**: register teams, reset progress, change roles, ban/unban, reset passwords, apply penalties
- **Questions & Flags**: add, edit, delete, and reorder questions; select active round count
- **Competition Control**: configure timer/decay, start, end, return to waiting, reset trial data
- **Warnings & Anti-Cheat**: refresh and review incident logs; clear logs when preparing a trial/event
- **Database**: test the Supabase connection and copy the current schema

## Competition Runbook

### Prepare

1. Run the Supabase schema migration.
2. Configure Vercel environment variables.
3. Deploy and open `/challenge/admin`.
4. Register test or real participant accounts.
5. Add/edit questions and choose the active round count.
6. Set the time limit and decay. Defaults are `600` seconds and `1` point per second.

### Start

1. Tell participants to log in.
2. Confirm all questions, flags, timer, and active count are correct.
3. Click **Start Competition**.
4. Start resets all participant scores/progress and sets the competition to `LIVE`.
5. Late participants may still log in while the event is live.

### End

Click **End Competition**. Participant terminals lock and the leaderboard remains available for final standings.

Avoid deleting/reordering questions or changing active count while live. The event should use a stable question set once started.

## Trial / Demo Run

Use the built-in trial reset instead of manually deleting accounts or database rows.

1. Register one or two clearly labelled demo accounts, such as `demo_team_1`.
2. Configure one or two active questions and use a short timer, such as `60` seconds, for the demonstration.
3. Click **Start Competition**.
4. Demonstrate:
   - correct answer scoring
   - point decay
   - timeout and **Skip to Next Round**
   - leaderboard updates
   - tab switch/window blur warning
   - warning visibility in **Warnings & Anti-Cheat**
5. When finished, click **Reset Trial Data** and confirm.

**Reset Trial Data clears:**

- participant scores
- question progress
- completion state
- timer state
- warning counts
- anti-cheat incident logs
- competition status back to `WAITING`

**Reset Trial Data preserves:**

- registered participant accounts
- questions and answers
- active-round count
- timer and decay settings

Use **Reset Trial Data** before the real event. Verify the warning log is empty and all participants show `0` progress and `0` score.

## Proctoring and Anti-Cheat

The quiz terminal listens for:

- `visibilitychange` when the tab becomes hidden
- `window.blur` when the browser loses focus

Events are throttled to one report per participant every four seconds. Each report:

1. Uses the participant session token.
2. Is sent to `/api/participant/warning`.
3. Is attributed server-side to the authenticated participant.
4. Atomically increments `warning_count`.
5. Inserts an incident into Supabase `warnings`.
6. Appears in the admin **Warnings & Anti-Cheat** tab.

### Proctoring smoke test

1. Start a trial.
2. Log in as a demo participant.
3. Open the quiz terminal.
4. Switch to another browser tab or window.
5. Return to the quiz.
6. Confirm the warning modal appears.
7. Refresh the admin warning tab.
8. Confirm the participant, event type, timestamp, and warning count appear.

Browser proctoring is a deterrent and audit signal, not a perfect anti-cheat system. It does not detect every operating-system-level action or prevent a determined attacker from using a second device.

## Scoring Rules

For each question:

```text
awarded_points = max(0, question_points - elapsed_seconds * decay_per_second)
```

After the time limit expires:

- answer submission is rejected
- the question value is zero
- only **Skip to Next Round** is available
- skip advances progress without awarding points

Scoring and timeout validation run in the server-side Supabase RPCs.

## Verification Commands

```bash
npm run build
npx oxlint
```

Build warnings about the bundle size and existing React hook dependency warnings do not block compilation, but should be cleaned up before a polished release.

## Deployment Checklist

- [ ] Run `supabase_schema.sql`
- [ ] Back up existing participant data before migration
- [ ] Confirm safe views and RPC grants
- [ ] Set all Vercel environment variables
- [ ] Redeploy after env changes
- [ ] Test admin login
- [ ] Test participant login
- [ ] Test submit/skip with a trial participant
- [ ] Test proctoring warning and admin log
- [ ] Run **Reset Trial Data**
- [ ] Confirm waiting state, zero scores, zero progress, and empty warnings
- [ ] Start the real event
