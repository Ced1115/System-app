# THE SYSTEM

A Solo Leveling–style quest tracker. Installable PWA, works offline, all data stored locally on your device (localStorage — same pattern as your Japanese apps).

## Install on phone

**Easiest path — GitHub Pages (same as your other PWAs):**
1. Push this folder to a repo (or a folder in `ced1115.github.io`)
2. Open the deployed URL on your phone in Chrome/Safari
3. Chrome (Android): menu → "Add to Home screen" / "Install app"
   Safari (iOS): Share → "Add to Home Screen"
4. It'll launch fullscreen, no browser chrome, works offline after first load

**Quick local test first:**
```
cd system-app
python3 -m http.server 8080
```
Visit `http://localhost:8080` (or your LAN IP from your phone) to test before deploying.

## How it works

- **STATUS tab** — 6 stats, each leveling independently off quest XP:
  - **STR** — strength/bodyweight quests (push-ups, etc.)
  - **VIT** — runs / cardio / endurance
  - **AGI** — stretching / mobility
  - **INT** — learning / study
  - **SNS** — archery, balance work, reaction/reflex drills, breathwork/focus — anything perception or precision based
  - **DIS** — Discipline: chores, life admin, hygiene, errands — the unglamorous stuff (clean your room, dishes, laundry, budgeting, etc.)
  
  Both player level and each stat level use a flat linear XP curve (a fixed amount more needed each level — no exponential blowup). Player level is purely a prestige/progress number — stats only grow from their own quest XP, never from manual allocation.

- **QUESTS tab** — Each stat has a **pool** of several quests. Every day at reset, the system rolls **one random quest per stat** (6 total) as your **mandatory** picks — it won't repeat the same quest two days running if there's another option in that stat's pool. You need to clear **at least 4 of the 6** (any tier, any 4 stats) to avoid a penalty. The rest of each stat's pool shows up under **OPTIONAL TODAY**, grouped by stat with its own header — extra quests you can do for bonus XP, but they don't count toward the 4-of-6 requirement.

  Every quest (mandatory, optional, or one-off) has **4 difficulty tiers** — Easy / Medium / Hard / Brutal — each with its own target and XP reward. Tap a quest card, pick whichever tier you're attempting that day, log your result:
  - ≥100% of that tier's target → full XP for the tier
  - ≥75% → 75% of that tier's XP
  - <75% → no XP, tier not cleared
  
  Each tier can only pay out once per day — clearing Easy then going back for Medium pays the Medium reward on top, but re-logging Easy again that day doesn't pay twice.

- **Can't-do-today Reroll** — for days when the rolled quest genuinely isn't doable (no gym access, no archery range, 50-hour work week, whatever), each mandatory quest card has a **↻ swap for a no-equipment quest** button. Tapping it:
  - Replaces that stat's quest for today with one of its tagged **"anywhere" quests** — no equipment, no specific location, doable wherever you are (e.g. push-ups instead of forge work for STR, stretching instead of footwork drills for AGI).
  - Gives **noticeably lower XP** than a normal quest at the same tier — it's a real fallback, not a free equivalent swap.
  - Still counts fully toward the 4-of-6 requirement (and the weak-stat focus rule, if that's the stat you reroll) — it's a substitution, not an exemption.
  - **Once per stat per day** — after rerolling, you're locked into that anywhere quest for the rest of the cycle; the button shows "already rerolled today" afterward.
  - If a stat has no anywhere-tagged quest in its pool yet, the button is disabled and tells you to add one.
  
  When adding a quest in MANAGE QUEST POOL, check **"ANYWHERE" QUEST** if it genuinely needs no equipment or location — that's what makes it eligible as a reroll fallback. Tagged quests show an "anywhere" label in the pool list.

- **Weak Stat Focus** — if one stat falls **3+ levels behind the average of the other 5** (using relative level, so partial XP progress counts too — not just the whole-number level), it's flagged as your **weakest stat**:
  - Its daily quest gets pinned to the top of the mandatory list with a gold **FOCUS · REQUIRED** badge, and a banner explains why.
  - **That quest must clear, full stop** — even if you clear all 5 other mandatory quests, skipping the weak stat's quest alone triggers the penalty.
  - The Status tab shows a live "WEAK STAT" callout and marks the lagging stat's row in gold, so you can see it coming before it's locked in as tomorrow's focus.
  - Which stat counts as weak is locked in once per day at reset time — it won't shift mid-day even if you make quick progress, so the rule stays predictable.
  - If no stat is meaningfully behind, this rule is simply inactive and the normal 4-of-6 requirement applies alone.

- **Penalty Zone** — if fewer than 4 of the 6 mandatory daily picks clear (or the weak stat's focus quest specifically doesn't clear) by reset time:
  - The **entire app turns red** — persistent tint, not just a one-time popup — and stays that way until the penalty is cleared.
  - A **Penalty Quest** (burpees, scaling target) appears pinned at the top of the Daily Quest list.
  - Every stat (and your player level) takes a **one-time XP loss**, and **all XP earned from quests is reduced** until the penalty clears — both scale with how many cycles you've failed *in a row*: -15% per consecutive fail, capped at -60%. Miss one day and it's a minor dip; ignore it for days straight and it gets serious, but it never deletes a level or sends you backward beyond that cap.
  - Clearing the Penalty Quest **fully resets the fail streak to zero** immediately — tint gone, debuff gone, fresh start.
  - The Status tab shows a live "PENALTY DEBUFF" readout (current % and streak count) whenever one is active.

- **LOG tab** — three sections now:
  - **LAST 7 DAYS**: total XP earned, clean days vs penalty days, average quests cleared per day, and a 7-day strip of pips (cyan = perfect day, dim = partial, red = penalty day).
  - **WEAK STAT HISTORY**: a bar per stat showing how many times it's been flagged as the weak/focus stat overall. If one stat shows up here constantly, it's worth checking whether its pool's tier targets are just calibrated too high rather than you actually slacking.
  - **FULL LOG**: the original chronological feed — completions, level-ups, penalties, resets.
- **MANAGE QUEST POOL** (bottom of Quests tab) — add more quests to any stat's pool (more variety = fewer repeats), or remove ones you don't want. Deleting today's rolled pick for a stat automatically re-rolls that slot from what's left. Each stat needs at least one quest in its pool at all times. When adding a new quest, fill in the Medium tier and tap **AUTO-FILL EASY / HARD / BRUTAL FROM MEDIUM** to scale the other three tiers automatically (ratios derived from the app's existing default pool: Easy ≈ 0.4×, Hard ≈ 1.9×, Brutal ≈ 3.2× of Medium) — then adjust by hand if needed.

## Notes on the numbers

- Player XP needed per level: `100 + (level-1) × 25` — same increment every level.
- Stat XP needed per level: `50 + (level-1) × 15` — same idea, per stat.
- Reset hour is 4 AM, hardcoded in `app.js` (`getResetHour()`) — change that one function if you want a different cutoff.
- Default pool has 8–10 quests per stat (STR/VIT/AGI/INT/SNS/DIS) covering bodyweight strength, cardio, mobility, learning, archery/balance/reflex/breathwork, and life-admin tasks respectively — edit freely in MANAGE QUEST POOL.
- Penalty escalation constants live near the top of `app.js`: `REQUIRED_CLEARS` (4 of 6), `DEBUFF_PER_FAIL`/`DEBUFF_CAP` (XP gain reduction), `STAT_LOSS_PER_FAIL`/`STAT_LOSS_CAP` (one-time XP loss on fail), `WEAK_STAT_THRESHOLD` (how many levels behind average triggers focus mode, default 3). Change those if the numbers don't feel right once you've lived with them for a bit.
- Day-by-day history for the weekly summary is capped at 60 entries (~8-9 weeks) to keep localStorage from growing unbounded — older entries just roll off, the weak-stat counters and full log are unaffected by that cap.
- Tier targets/XP are whatever you set when creating a quest — there's no built-in formula scaling them, so set Hard/Brutal numbers that actually reflect your own effort curve.
- All data is local to the browser/device. No accounts, no sync. If you want it on multiple devices, you'd need to add manual export/import or a backend — let me know if you want that built in.
