# ⚽ 5-a-side

A phone-first app for one friends' football group. Players join with an invite link and look after their own profile. The app collects replies, makes fair teams and keeps everyone's rating honest, so the organizer doesn't have to.

## How it works

**Joining.** The organizer shares an invite link (Organizer → Invite link). Players sign up, pick a position, rate themselves honestly and agree to share their phone number with the organizer only.

**Ratings nobody can game.** Each player's overall comes from three sources:

| Source | How it's used |
|---|---|
| Self-rating | Starting point only. Pulled halfway to average, and fades out as teammates rate you. |
| Teammates | After each match, everyone rates 4 random people they played with (1–5 taps). Trimmed, weighted averages ignore revenge ratings and friends inflating friends. Shown to the player once 4+ different people have rated them. |
| Results (Elo) | Wins, losses and goal difference. Can't be faked. Its weight grows over the first 5 matches. |

The visible overall moves at most 3 points per update. The organizer can add a small, recorded correction (−5 to +5, with a reason) that fades over 5 matches.

**Punctuality.** The organizer taps "Arrived" at the pitch, and the time is saved. Players see their own record and can tap "This is wrong" within 48 hours; the organizer accepts or rejects it. Other players never see anyone's punctuality.

**Behaviour, privately.** After each match: "Happy to play with them again? 👍/👎". Only a pattern from 3+ different people raises a quiet flag for the organizer. Nobody sees individual answers.

**Who plays with whom.** Each player privately picks up to 3 people they enjoy playing with and up to 2 they'd rather not be teamed with. Only the team-maker reads these. The organizer sees only "8/10 wishes met".

**Fair teams.** The team-maker tries every possible split (126 for 10 players) and weighs: equal strength, keepers on different sides, defenders and forwards spread out, wishes, and not the same teammates every week. It offers 3 options. The organizer can swap players on the pitch, then publish and share to WhatsApp as an image.

**Everything else.** In / Out / Maybe replies with an automatic waitlist, reminders, "Add to calendar", weather at kick-off, cost tracking (who has paid), Player of the Week/Month voting, push notifications, English and Arabic (right-to-left), dark and light themes, and installation as a phone app.

## Privacy rules (enforced on the server, in `backend/services/views.js`)

- **Everyone sees:** name, photo, position, overall, attributes, stats, form, positive badges.
- **A player also sees:** their own self-rating, teammate breakdown (once 4+ raters), punctuality, adjustment value.
- **The organizer also sees:** contact details, punctuality, the concern flag, the adjustment reason and history.
- **Nobody ever sees:** who rated whom, MVP votes, "play again" answers, play-with / prefer-not picks.

## Running it locally

```bash
cd backend && npm install
cd ../frontend && npm install && npm run build
cd ../backend && npm run demo
```

`npm run demo` starts the app at http://localhost:3000 on a **temporary in-memory database** with a sample group, so it never touches your real data. Logins: `organizer@demo.test` / `demo1234`, or a player such as `omar@demo.test` / `demo1234`.

Tests (74, including a full match-week run through the API):

```bash
cd backend && npm test
```

## Deploying (Render)

1. Set the environment variables listed in [backend/.env.example](backend/.env.example). New in this version:
   - `ORGANIZER_EMAIL`: your email. Sign up at `/join/organizer` with it to create the organizer account.
   - `JWT_SECRET`, `REFRESH_TOKEN_SECRET`: at least 32 random characters each. The server refuses to start without them.
   - `CRON_SECRET`, plus a free scheduler (for example cron-job.org) calling `POST /api/cron/tick` every 15–30 minutes with the header `x-cron-secret`. This sends reminders and closes rating rounds.
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: for phone notifications (`npx web-push generate-vapid-keys`).
   - `GMAIL_USER` / `GMAIL_APP_PASSWORD`: for password reset codes.
2. Old data does not fit the new structure. To wipe it, run this from `backend/` with `MONGO_URI` set:
   ```bash
   node scripts/resetData.js
   ```
   This only shows counts. Add `--yes` to actually delete. **Deleted data cannot be recovered.**
3. Deploy, then open `/join/organizer` and sign up with `ORGANIZER_EMAIL`.

## Structure

```
backend/
  models/        User, Player, Match, PeerRating, Preference, Settings, Poll, Feedback
  services/      ratingService (rating maths), balancingService (team-maker),
                 standingsService (recomputes everyone from match history),
                 matchService (replies, waitlist, results, rating rounds), views (privacy), push, email
  controllers/   auth, me, matches, organizer, polls, cron
  routes/index.js   every route and who may call it, in one file
  tests/         unit tests + end-to-end API test
frontend/src/app/
  core/          API client, login session, translations (en/ar), theme, models
  shared/ui/     pitch, player card, reply card, icons, pop-ups
  features/      home, matches, match, rate, squad, vote, me, organizer, auth
```
