# Deploying The Handler

One Render web service runs everything: the API and the app. It costs nothing on the free plans.
Allow about 45 minutes the first time.

## 1. Database (MongoDB Atlas)

1. Open your Atlas project. **Database Access → Add new database user**:
   - Choose a long random password (use Atlas's "Autogenerate").
   - Under privileges, choose **Read and write to any database**. Better still: open "Specific privileges" and choose `readWrite` on the `the-handler` database only.
2. **Network Access → Add IP address → Allow access from anywhere (`0.0.0.0/0`)**.
   Render's free plan has no fixed IP address, so this is needed. The strong password from step 1 is what protects the database.
3. **Connect → Drivers** → copy the connection string into `MONGO_URI`. Put your user and password in it, and the database name `the-handler` before the `?`.
4. Old data from the previous version doesn't fit the new structure. To wipe it, run this on your computer from `backend/`, with `MONGO_URI` in `backend/.env`:
   ```bash
   node scripts/resetData.js
   ```
   That only shows what is there. Add `--yes` to delete it. **This cannot be undone.**

## 2. Google sign-in (Google Cloud Console)

1. Go to <https://console.cloud.google.com> and create a project called "The Handler".
2. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform"):
   - Choose **External**.
   - App name: The Handler. Add your support email and developer email.
   - Scopes: leave the defaults (`email`, `profile`, `openid`). These basic scopes need no Google review.
   - **Publish the app** (Audience → Publish). While it's in "Testing", only test users you add one by one can sign in.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins**:
     - `https://YOUR-APP.onrender.com`
     - `http://localhost:3000` (for local testing)
   - **Authorized redirect URIs**: none needed.
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into `GOOGLE_CLIENT_ID`. The client *secret* is not used. Don't paste it anywhere.

## 3. Photos (Cloudinary)

Yes, player photos are stored on Cloudinary. The free plan is far more than a group needs.

1. Sign up at <https://cloudinary.com>.
2. On the **Dashboard → API Keys**, copy the cloud name, API key and API secret into the three `CLOUDINARY_*` variables.

Photos are checked to be real JPG, PNG or WebP images under 3 MB, then cropped to 400×400 around the face.

## 4. Email (Brevo)

Render's free plan blocks outgoing mail-server (SMTP) connections, so Gmail can't send from there.
The app sends through **Brevo** instead, over HTTPS. Its free plan allows 300 emails a day.

1. Create a free account at <https://www.brevo.com>.
2. **Senders, domains & dedicated IPs → Senders → Add a sender**: enter the address emails should come from (your Gmail is fine) and confirm the code Brevo emails you.
3. **SMTP & API → API keys → Generate a new API key**, name it "The Handler", and copy it.
4. On Render, set `BREVO_API_KEY` to that key and `EMAIL_FROM` to the sender address from step 2.
5. Deploy, then in the app open **Organizer → Group settings → Send me a test email**. It shows the real error if something is wrong.

Gmail (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, an app password from Google Account → Security → App passwords) still works when running the app on your own computer or on a paid server. If `BREVO_API_KEY` is set, Brevo is used.

Emails are used for:
- Password reset codes
- Teams published
- Match cancelled
- Day-before match reminders
- Your "Notify the group" messages
- Reminders to enter a missing result (organizer)

Players can switch emails off in **Me → App → Emails**.

## 5. Phone notifications (once)

Run this once on your computer:

```bash
npx web-push generate-vapid-keys
```

Copy the two keys into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. **Never change them later**: every phone would silently stop getting notifications.

Each player turns notifications on in **Me → App → Notifications**. On iPhone this only works after "Add to Home Screen" (iOS 16.4 or newer).

## 6. Render

1. **New → Web Service** → connect your GitHub repo → pick the branch.
2. Settings:
   - **Root directory:** leave empty
   - **Build command:** `npm run build`
   - **Start command:** `npm start`
   - **Instance type:** Free
3. **Environment**: add every variable from [backend/.env.example](backend/.env.example). Set `APP_URL` to your Render address.
4. Deploy. When it's live, open `https://YOUR-APP.onrender.com/login`.

## 7. Create your organizer account

- **With Google (easiest):** on the login screen tap **Continue with Google** and choose the Gmail you put in `ORGANIZER_EMAIL`. Then fill in your phone number, position and self-rating.
- **With a password:** open `/join/organizer`. Sign up with `ORGANIZER_EMAIL` and type your `ORGANIZER_SETUP_CODE`.

Then open **Organizer → Invite link → Share** and send the link to your WhatsApp group.

## 8. Keep it awake on match days (optional)

Free Render services sleep after 15 minutes. The first visit after that takes 30–60 seconds; the app shows "Waking the server up…" meanwhile.

To avoid the wait, add a free monitor at <https://uptimerobot.com> that opens `https://YOUR-APP.onrender.com/health` every 10 minutes.

## Who can do what

| | Anyone on the internet | Members (joined with the invite link) | Organizer (only `ORGANIZER_EMAIL`) |
|---|---|---|---|
| Sign up | ✗ needs the invite link | | |
| See matches, squad, votes | ✗ | ✓ | ✓ |
| Organizer screen, create matches, make teams, check-in, notify | ✗ | ✗ blocked by the server | ✓ |
| See phone numbers and emails | ✗ | ✗ | ✓ |
| See who rated whom, play-with picks | ✗ | ✗ | ✗ nobody |

The organizer role can't be claimed in the app. It's set only by `ORGANIZER_EMAIL` on the server, and nobody is "seeded".

If the invite link leaks, open **Organizer → Invite link → Reset link**. The old link stops working immediately.

## Security checklist

- [ ] `JWT_SECRET` and `REFRESH_TOKEN_SECRET` are different, random, and 32+ characters. The server refuses to start otherwise.
- [ ] The Atlas database user has a strong, generated password.
- [ ] 2-Step Verification is on for your Google account, Atlas, Render, Cloudinary and GitHub.
- [ ] No `.env` file is committed. Check with `git ls-files | grep .env` (it should only list `.env.example`).
- [ ] `ORGANIZER_SETUP_CODE` is left empty if you use Google, or is random if you don't.
