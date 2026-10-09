# CAM UAT smoke checklist

Use this before each release or tenant config change. Tick as you go.

## 0. Preconditions

- [ ] API starts (`npm run start`) without TypeScript errors
- [ ] `npm test` passes (permission + notification batching unit tests)
- [ ] Frontend starts and signs in with Entra (or dev auth)
- [ ] Directory users visible; at least one committee with chair + secretary
- [ ] Graph mail sender configured if testing real email (`ENTRA_GRAPH_MAIL_SENDER`)
- [ ] Teams: delegated consent granted if testing online meetings

## 1. Sign-in & landing

- [ ] Sign in succeeds
- [ ] Landing page matches role (central/admin → dashboard; single committee → workspace; else committees/actions)

## 2. Committee workspace

- [ ] Open a committee as chair/secretary
- [ ] Distribution email can be set and saved (optional)
- [ ] Secretary tip appears once and can be dismissed

## 3. Meeting create → Teams → mail

- [ ] Create meeting with **Teams** checked and **Send invitation** checked
- [ ] Toast shows Teams success or clear failure reason
- [ ] Toast shows invitation sent / failed / skipped with recipient context
- [ ] Meeting detail shows Teams join link when provisioned
- [ ] `GET /health/metrics` (as platform admin): `teams.provisionAttempts` increased

## 4. Live meeting → QR → outcome

- [ ] While meeting is between start and end: attendance QR available to officers
- [ ] Outside window: QR message explains “only while live”
- [ ] Record outcome (Held / Did not hold / Postponed)
- [ ] Post-meeting checklist updates; toast suggests minutes/actions if missing

## 5. Minutes

- [ ] Upload **draft** (Word/PDF) with “email committee” checked → `MINUTES_ISSUED` path
- [ ] Upload again with checkbox **off** → no mail expected
- [ ] Upload **final** (PDF only)
- [ ] Download / in-app preview works

## 6. Actions (single + bulk)

- [ ] Create one action with multiple owners → owners on To, secretary/central DL on Cc (when set)
- [ ] Import or create **several actions for the same owner on the same meeting** → **one** assignment email (digest), not one per action
- [ ] Open action via `/actions/:id` deep link
- [ ] Owner submits completion with **comment required**, evidence optional
- [ ] Chair/secretary **Approve completion** or **Return for more work**

## 7. Calendar & leave

- [ ] Calendar day chips open meeting detail
- [ ] Team availability note visible (leave-only)
- [ ] Platform admin can record leave with start/end dates

## 8. Reports & dashboard

- [ ] Dashboard **Monthly report** link (central/admin)
- [ ] Reports page shows **preview counts** before download
- [ ] Download CSV / Excel / PDF for a month with data

## 9. Notifications ops

- [ ] Notifications page loads personal feed
- [ ] Platform admin sees **outbox** and can **retry failed emails**
- [ ] `GET /api/health` (or `/health`) returns ok
- [ ] `GET /health/metrics` shows mail batch + Teams counters and outbox failed counts

## 10. Regression guards

- [ ] Ordinary member cannot create meetings/actions (human error message)
- [ ] Logout does not wipe all Microsoft sessions unexpectedly (app-only logout)
- [ ] `npm test` still green after local changes
