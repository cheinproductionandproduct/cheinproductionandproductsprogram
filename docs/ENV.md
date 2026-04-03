# Environment variables

## Optional: Google Maps (Car List — Messenger location search)

For **Car List → Messenger** (Lalamove, Grab, etc.), the start and destination location fields use **Google Places Autocomplete** so users can search and select an address on the map.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable **Maps JavaScript API** and **Places API**.
2. Create an API key (Credentials → Create credentials → API key) and restrict it to your domain if needed.
3. Set in `.env.local`:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

If this variable is not set, the location inputs still work: users can type the address manually (a short hint is shown).

---

## Optional: LINE Official Account (advance register)

To connect **past-due** advance payment clearance items on the APC table page (ทะเบียนคุมลูกหนี้เงินทดรอง) to your LINE Official Account:

1. Set in `.env.local` (or your deployment env):

   ```bash
   NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL=https://line.me/R/ti/p/@your_official_id
   ```

   Or use a LINE invite link, e.g. `https://lin.ee/xxxxx`.

2. On the advance register page (`/dashboard/advance-register`), when there are items that have **passed the clearance due date** (พ้นกำหนด), a green panel appears:
   - **เปิด LINE** — opens your LINE Official Account in a new tab so staff can follow up.
   - **คัดลอกรายการสำหรับส่ง LINE** — copies a short summary of past-due items (document numbers and names) so you can paste it into a LINE chat.

If this variable is not set, the LINE panel is hidden.

---

## Cron: LINE reminder every Friday 8 AM (who hasn’t cleared advance)

A scheduled job runs **every Friday at 8:00 AM Bangkok time** (01:00 UTC). It fetches the list of people who have **not** cleared their advance (past-due clearance) and sends that list to LINE.

You can use either **LINE Official Account (Messaging API)** or **LINE Notify**. The cron uses Messaging API first if both are configured.

### 1. CRON_SECRET (required for cron)

Set a secret so only the cron runner can call the API:

```bash
CRON_SECRET=your-long-random-secret-at-least-8-chars
```

- On **Vercel**: set `CRON_SECRET` in Project → Settings → Environment Variables. Vercel Cron will send `Authorization: Bearer <CRON_SECRET>` when it hits the endpoint.
- For **external cron** (e.g. cron-job.org): call `GET https://your-domain.com/api/cron/line-past-due?secret=YOUR_CRON_SECRET` or send header `Authorization: Bearer YOUR_CRON_SECRET`.

### 2a. LINE Official Account (Messaging API) — recommended

Use your LINE Official Account to send the Friday reminder.

1. In [LINE Developers Console](https://developers.line.biz/console/), open your channel (Messaging API channel for your Official Account).
2. Get a **Channel access token** (long-lived): Channel → Messaging API tab → Issue channel access token. Or use a long-lived token from the “Channel access token” docs.
3. Set in env (for broadcast to **all users who added your OA**):

```bash
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
```

With only `LINE_CHANNEL_ACCESS_TOKEN` set, the cron uses **broadcast**:  
`POST https://api.line.me/v2/bot/message/broadcast` — the message is sent from your OA to everyone who added it.

If you prefer to send **only to one user / one group**, also set:

```bash
LINE_PUSH_TO_ID=U1234567890abcdef...   # or group ID / room ID
```

When `LINE_PUSH_TO_ID` is present, the cron uses **push** instead of broadcast.

**Custom message text (optional)**  
You can override the intro and add an outro using:

- **`LINE_PAST_DUE_INTRO`** – Custom text at the start (before the past-due list). Use `{{DATE}}` or `{{TODAY}}` to insert today’s date (dd/mm/yyyy). If not set, the default header is used (“รายการพ้นกำหนดเคลียร์เงินทดรอง…” and date).
- **`LINE_PAST_DUE_OUTRO`** – Custom text at the end (after the list). Same placeholders supported.

Example in `.env`:

```bash
LINE_PAST_DUE_INTRO="สวัสดีครับ รายการพ้นกำหนดเคลียร์เงินทดรอง อัปเดต {{DATE}}\n\n"
LINE_PAST_DUE_OUTRO="\nกรุณาเคลียร์ให้เรียบร้อยครับ"
```

### 2b. LINE Notify (fallback)

If you don’t set Messaging API vars, the cron can use LINE Notify instead:

1. Go to [LINE Notify](https://notify-bot.line.me/) and sign in.
2. Generate a token for the recipient (person or group).
3. Set in env:

```bash
LINE_NOTIFY_ACCESS_TOKEN=your_line_notify_token
```

### Summary

| Variable                     | Required | Purpose |
|-----------------------------|----------|--------|
| `CRON_SECRET`               | Yes      | Authenticates the cron request (Vercel or external). |
| `LINE_CHANNEL_ACCESS_TOKEN` | For Official Account | Channel access token (Messaging API). If set alone → **broadcast** to all OA friends. |
| `LINE_PUSH_TO_ID`           | Optional | User ID, group ID, or room ID to **target** a single chat instead of broadcast. |
| `LINE_PAST_DUE_INTRO`       | Optional | Custom intro text before the list. Use `{{DATE}}` or `{{TODAY}}` for today’s date. |
| `LINE_PAST_DUE_OUTRO`       | Optional | Custom text after the list. Same placeholders. |
| `LINE_NOTIFY_ACCESS_TOKEN`  | For Notify fallback | LINE Notify token (used only if Messaging API vars are not set). |
