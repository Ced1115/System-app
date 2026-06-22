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

- **STATUS tab** — 5 stats, each leveling independently off quest XP:
  - **STR** — strength/bodyweight quests (push-ups, etc.)
  - **VIT** — runs / cardio / endurance
  - **AGI** — stretching / mobility
  - **INT** — learning / study
  - **SNS** — archery, balance work, reaction/reflex drills, breathwork/focus — anything perception or precision based
  
  Both player level and each stat level use a flat linear XP curve (a fixed amount more needed each level — no exponential blowup). Level-ups grant 3 stat points to allocate with the `+` button.

- **QUESTS tab** — Each stat has a **pool** of several quests. Every day at reset, the system rolls **one random quest per stat** (5 total) as your **mandatory** picks — it won't repeat the same quest two days running if there's another option in that stat's pool. You need to clear **at least 3 of the 5** (any tier, any 3 stats) to avoid a penalty. The rest of each stat's pool shows up under **OPTIONAL TODAY** — extra quests you can do for bonus XP, but they don't count toward the 3-of-5 requirement.

  Every quest (mandatory, optional, or one-off) has **4 difficulty tiers** — Easy / Medium / Hard / Brutal — each with its own target and XP reward. Tap a quest card, pick whichever tier you're attempting that day, log your result:
  - ≥100% of that tier's target → full XP for the tier
  - ≥75% → 75% of that tier's XP
  - <75% → no XP, tier not cleared
  
  Each tier can only pay out once per day — clearing Easy then going back for Medium pays the Medium reward on top, but re-logging Easy again that day doesn't pay twice.

- **Penalty Zone** — if fewer than 3 of the 5 mandatory daily picks clear by reset time, you get the red penalty overlay and a Penalty Quest (default: 150 burpees) appears pinned at the top of the Daily Quest list. Clear it to lift the penalty.
- **LOG tab** — full history: completions (with tier), level-ups, penalties, and a per-cycle "cleared X/5" summary on every reset.
- **MANAGE QUEST POOL** (bottom of Quests tab) — add more quests to any stat's pool (more variety = fewer repeats), or remove ones you don't want. Deleting today's rolled pick for a stat automatically re-rolls that slot from what's left. Each stat needs at least one quest in its pool at all times.

## Notes on the numbers

- Player XP needed per level: `100 + (level-1) × 25` — same increment every level.
- Stat XP needed per level: `50 + (level-1) × 15` — same idea, per stat.
- Reset hour is 4 AM, hardcoded in `app.js` (`getResetHour()`) — change that one function if you want a different cutoff.
- Default pool has 5–6 quests per stat (STR/VIT/AGI/INT/SNS) covering bodyweight strength, cardio, mobility, learning, and archery/balance/reflex/breathwork respectively — edit freely in MANAGE QUEST POOL.
- Tier targets/XP are whatever you set when creating a quest — there's no built-in formula scaling them, so set Hard/Brutal numbers that actually reflect your own effort curve.
- All data is local to the browser/device. No accounts, no sync. If you want it on multiple devices, you'd need to add manual export/import or a backend — let me know if you want that built in.
