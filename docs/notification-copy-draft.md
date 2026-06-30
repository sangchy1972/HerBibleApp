# Her Bible — Notification Copy (DRAFT for review)

> English source copy only. After you approve, we translate to the other 6 languages + implement.
> Tone: warm, gentle, feminine, devotional. Never guilt-trip. Emojis sparingly.

---

## Push entry points (overview)

| # | Type | Trigger | Fires when |
|---|---|---|---|
| 1 | Morning devotional | Daily **10:00** | always |
| 2 | Afternoon pause | Daily **16:00** | always |
| 3 | Before you rest (night) | Daily **21:00** | always |
| 4 | Gospel & Psalms reminder | Daily **14:00** | only if today's Gospel & Psalm NOT read |
| 5 | Win‑back (lapsed user) | Days **1–30** since last open | only if user hasn't opened that day |
| 6 | (existing) Morning & Evening **prayer** reminders | user‑set times | kept as‑is |

⚠️ **Density guardrail (my strong recommendation):** with all of the above, an active user could get 4–6/day — that's back into spam/retention‑risk territory. So I recommend:
- **Skip‑if‑engaged:** if the user already prayed / read that day, suppress the conditional + some fixed slots that day.
- **Cap delivered ≤ 3–4/day** per user.
- **Taper win‑back** (don't fire all 30 days — see that section).
We can wire these guardrails in; flagging so density stays safe.

---

## 1. Morning devotional — 10:00 (rotating)
- ☀️ Good morning · Today's verse is ready — start the day with God.
- Morning grace · His mercies are new this morning. 🙏
- A quiet moment · Five minutes with His Word before the day fills up.
- He's near today · Open your heart — today's verse is waiting.
- Begin with peace · Let God have the first word today.

## 2. Afternoon pause — 16:00 (rotating)
- 🌤️ Afternoon pause · Take a breath — a verse to carry you through the day.
- Midday strength · Feeling stretched? His Word steadies the heart.
- A moment for you · Step away for two minutes and be refreshed in Him.
- He sees you today · Whatever this afternoon holds, you're not alone.
- Pause & pray · A short prayer can change the rest of your day. 🙏

## 3. Before you rest — 21:00 (rotating)
- 🌙 Before you rest · End the day with His Word and let today go.
- Peaceful night · Lay today down before God and breathe.
- Rest in Him · Close the day with a verse and a quiet prayer.
- Give thanks · Name one grace from today before you sleep. 🙏
- Tonight's verse is waiting · A gentle word to end your day.

## 4. Gospel & Psalms reminder — 14:00 (only if not read today)
- 📖 Today's Gospel & Psalm · Your reading is waiting — just a few minutes.
- Haven't read yet today? · Today's Gospel & Psalm is ready for you. 🙏
- A psalm for right now · Let today's psalm meet you where you are.
- Keep your reading going · A few verses are all it takes today.
- His Word for today · Today's Gospel passage is waiting — open it now.

## 5. Win‑back — lapsed user, by days away (Day 1–30)
> Fire once on the given day of absence, only if the user hasn't opened the app that day.
> **Recommended taper (not all 30):** Days 1, 2, 3, 5, 7, 10, 14, 21, 30. (Full 30 written below in case you want them.)

1. We saved today's verse for you 🙏 · A quiet moment with God is waiting whenever you're ready.
2. He's still here 💛 · Your verse for today is ready when you are.
3. Missing your quiet time? · Come back for five peaceful minutes with His Word.
4. A gentle nudge 🌿 · Your heart deserves a small pause today.
5. Grace doesn't expire · Whenever you return, His Word is waiting for you.
6. We kept your spot 🙏 · Today's verse is right where you left it.
7. One week — and you're missed 💛 · A fresh start is just one verse away.
8. He never stopped pursuing you · Today is a good day to come home to His Word.
9. A little peace today? · Two minutes with God can steady the whole day.
10. Ten days — your seat is still here · Begin again: no pressure, just grace.
11. Rest for your heart 🌙 · His Word is gentle with the weary. Come rest a moment.
12. We kept the light on 🕯️ · Your verse for today is ready whenever you are.
13. A word made for today · Let one verse meet you right where you are.
14. Two weeks, still loved 💛 · Nothing has changed about how God sees you.
15. Halfway through the month, fully welcome · Come back for a quiet moment today.
16. Your story isn't paused to Him · Pick today up with a single verse.
17. Still cheering for you 🙏 · One small step back into His Word.
18. A calm in the noise · Two minutes of Scripture for a busy life.
19. He's writing grace over today · Come see today's verse.
20. Twenty days — and a warm welcome back · Your daily verse is ready.
21. Three weeks: a new week, a new start · Let's begin again, gently.
22. One verse is enough to begin · No catching up needed — just come.
23. He delights in your return · Today's Word is waiting for you. 🙏
24. A soft place for a tired heart 🌿 · Rest in one verse today.
25. Your spot has been waiting · Step back in for a peaceful minute.
26. Grace upon grace, still for you · Today is a beautiful day to return.
27. He's near, even now · A quiet verse to carry you today.
28. Four weeks, and always welcome 💛 · Come home to His Word today.
29. Almost a month — your seat is still warm · One verse to start again.
30. A month apart, never out of His heart 🙏 · Begin again today, with grace.

---

## 6. (Existing) Morning & Evening prayer reminders
Kept exactly as they are now (user‑set times, 10 rotating variants each). No change.

---

### Format note for each line above
`Title · Body` — left of the `·` is the bold notification title, right is the body. (Same shape as the current `notif.push.*` strings.)
