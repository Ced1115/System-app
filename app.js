// ===================== THE SYSTEM — app logic =====================

const STORAGE_KEY = 'system_state_v8'; // v8: anywhere-quest tagging + once-daily reroll fallback

const STATS = [
  { id: 'STR', name: 'Strength' },   // bodyweight/strength quests
  { id: 'VIT', name: 'Vitality' },   // runs / cardio / endurance
  { id: 'AGI', name: 'Agility' },    // stretches / mobility
  { id: 'INT', name: 'Intelligence' }, // learning / study
  { id: 'SNS', name: 'Sense' },      // archery, balance, reaction/reflex, breathwork/focus
  { id: 'DIS', name: 'Discipline' }, // chores, life admin, hygiene, errands — the unglamorous stuff
];

const RANKS = [
  { min: 1, label: 'E' }, { min: 10, label: 'D' }, { min: 20, label: 'C' },
  { min: 35, label: 'B' }, { min: 50, label: 'A' }, { min: 70, label: 'S' },
  { min: 90, label: 'National' },
];

const TITLES = [
  { min: 1, label: 'Novice' }, { min: 10, label: 'Awakened' }, { min: 20, label: 'Hunter' },
  { min: 35, label: 'Vanguard' }, { min: 50, label: 'Shadow Monarch' }, { min: 70, label: 'Sovereign' },
];

function xpNeededForLevel(level) {
  // linear ramp: same increment every level, no exponential blowup
  return 100 + (level - 1) * 25;
}

function statXpNeeded(level) {
  return 50 + (level - 1) * 15;
}

const WEAK_STAT_THRESHOLD = 3; // levels behind the average of the other stats to count as "weak"

// Relative level = level + fractional progress into the next level's XP bar.
// Lets us compare stats fairly even mid-level (e.g. STR 4 at 90% progress
// is meaningfully ahead of STR 4 at 5% progress).
function relativeStatLevel(statId) {
  const s = state.stats[statId];
  if (!s) return 0;
  const needed = statXpNeeded(s.level);
  return s.level + (needed > 0 ? s.xp / needed : 0);
}

// Returns the stat id that's at least WEAK_STAT_THRESHOLD levels behind the
// average of all OTHER stats, or null if nothing qualifies. Only ever
// returns one stat — the single furthest-behind one, if it clears the bar.
function findWeakStat() {
  const levels = {};
  STATS.forEach(s => { levels[s.id] = relativeStatLevel(s.id); });

  let weakest = null;
  let worstGap = 0;
  STATS.forEach(s => {
    const others = STATS.filter(o => o.id !== s.id).map(o => levels[o.id]);
    const avgOthers = others.reduce((a, b) => a + b, 0) / others.length;
    const gap = avgOthers - levels[s.id];
    if (gap >= WEAK_STAT_THRESHOLD && gap > worstGap) {
      worstGap = gap;
      weakest = s.id;
    }
  });
  return weakest;
}

function defaultTiers(easy, easyXp, med, medXp, hard, hardXp, brutal, brutalXp) {
  return [
    { label: 'Easy', target: easy, xp: easyXp },
    { label: 'Medium', target: med, xp: medXp },
    { label: 'Hard', target: hard, xp: hardXp },
    { label: 'Brutal', target: brutal, xp: brutalXp },
  ];
}

function defaultState() {
  const stats = {};
  STATS.forEach(s => { stats[s.id] = { level: 1, xp: 0 }; });
  return {
    playerName: 'PLAYER',
    level: 1,
    xp: 0,
    stats,
    questPool: defaultQuestPool(),
    dailyRoll: {},          // { STR: questId, VIT: questId, ... } — today's mandatory pick per stat
    lastRoll: {},           // { STR: questId, ... } — yesterday's pick, so we avoid repeats
    todayWeakStat: null,    // stat id flagged as "weak" for the current cycle, or null
    rerolledToday: {},      // { STR: true, ... } — stats whose mandatory quest was swapped to an "anywhere" quest today
    dailyProgress: {},      // { questId: { tiersCleared: [bool,bool,bool,bool], current, tierIndex } }
    oneOffQuests: [],       // { id, name, unit, stat, tiers, tiersCleared, current, tierIndex }
    lastResetISO: null,     // ISO date string of last daily reset
    penaltyActive: false,
    penaltyQuest: null,     // a generated makeup quest while penalty is active
    failStreak: 0,          // consecutive failed cycles (< required cleared count) — drives escalating debuff
    log: [],                // { dateISO, type, msg }
    dayHistory: [],         // [{ dateISO, cleared, total, xpEarned, penalty, weakStat }] — one entry per completed cycle, newest first
    weakStatCounts: {},      // { STR: n, VIT: n, ... } — how many times each stat has been flagged weak
    cycleXpEarned: 0,        // running total of XP earned during the current (not-yet-closed) cycle
  };
}

// Quest pools — several quests per stat. The daily system rolls ONE of these
// per stat each day as the mandatory pick; the rest are available as optional
// extra quests for that stat, same tier system, just not required.
function defaultQuestPool() {
  return {
    STR: [
      { id: 'p_str_1', name: 'Push-ups', unit: 'reps', stat: 'STR', anywhere: true, tiers: defaultTiers(10, 8, 50, 20, 100, 35, 150, 55) },
      { id: 'p_str_2', name: 'Squats', unit: 'reps', stat: 'STR', anywhere: true, tiers: defaultTiers(15, 8, 60, 20, 120, 35, 180, 55) },
      { id: 'p_str_3', name: 'Pull-ups', unit: 'reps', stat: 'STR', tiers: defaultTiers(3, 10, 10, 25, 20, 45, 35, 70) },
      { id: 'p_str_4', name: 'Plank Hold', unit: 'min', stat: 'STR', anywhere: true, tiers: defaultTiers(1, 8, 3, 20, 5, 35, 8, 55) },
      { id: 'p_str_5', name: 'Forge / Anvil Work', unit: 'min', stat: 'STR', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 120, 70) },
      { id: 'p_str_6', name: 'Weighted Carry', unit: 'min', stat: 'STR', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 30, 70) },
      { id: 'p_str_7', name: 'Dips', unit: 'reps', stat: 'STR', anywhere: true, tiers: defaultTiers(5, 8, 20, 20, 40, 35, 70, 55) },
      { id: 'p_str_8', name: 'Deadlifts / Weighted Lifts', unit: 'min', stat: 'STR', tiers: defaultTiers(10, 10, 20, 25, 40, 45, 70, 70) },
      { id: 'p_str_9', name: 'Stone Sculpture / Chiseling', unit: 'min', stat: 'STR', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 120, 70) },
      { id: 'p_str_10', name: 'Handstand / Planche Work', unit: 'min', stat: 'STR', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 35, 70) },
      { id: 'p_str_11', name: 'Lunges', unit: 'reps', stat: 'STR', anywhere: true, tiers: defaultTiers(10, 8, 40, 20, 80, 35, 130, 55) },
    ],
    VIT: [
      { id: 'p_vit_1', name: 'Run', unit: 'km', stat: 'VIT', tiers: defaultTiers(1, 10, 3, 25, 5, 45, 10, 80) },
      { id: 'p_vit_2', name: 'Cycling', unit: 'km', stat: 'VIT', tiers: defaultTiers(3, 10, 10, 25, 20, 45, 40, 80) },
      { id: 'p_vit_3', name: 'Jump Rope', unit: 'min', stat: 'VIT', tiers: defaultTiers(3, 10, 8, 25, 15, 45, 25, 80) },
      { id: 'p_vit_4', name: 'Stairs / Hill Sprints', unit: 'min', stat: 'VIT', tiers: defaultTiers(3, 10, 8, 25, 15, 45, 25, 80) },
      { id: 'p_vit_5', name: 'Swimming', unit: 'min', stat: 'VIT', tiers: defaultTiers(10, 10, 20, 25, 35, 45, 60, 80) },
      { id: 'p_vit_6', name: 'Hiking', unit: 'km', stat: 'VIT', tiers: defaultTiers(2, 10, 5, 25, 10, 45, 18, 80) },
      { id: 'p_vit_7', name: 'Rowing / Erg', unit: 'min', stat: 'VIT', tiers: defaultTiers(5, 10, 12, 25, 25, 45, 40, 80) },
      { id: 'p_vit_8', name: 'Burpees', unit: 'reps', stat: 'VIT', anywhere: true, tiers: defaultTiers(10, 8, 30, 20, 60, 35, 100, 55) },
      { id: 'p_vit_9', name: 'Calisthenics Circuit', unit: 'min', stat: 'VIT', anywhere: true, tiers: defaultTiers(10, 8, 20, 20, 35, 35, 60, 55) },
      { id: 'p_vit_10', name: 'High Knees / Jog in Place', unit: 'min', stat: 'VIT', anywhere: true, tiers: defaultTiers(3, 8, 8, 20, 15, 35, 25, 55) },
    ],
    AGI: [
      { id: 'p_agi_1', name: 'Stretching', unit: 'min', stat: 'AGI', anywhere: true, tiers: defaultTiers(5, 6, 15, 15, 30, 26, 60, 45) },
      { id: 'p_agi_2', name: 'Mobility Flow', unit: 'min', stat: 'AGI', anywhere: true, tiers: defaultTiers(5, 6, 15, 15, 25, 26, 45, 45) },
      { id: 'p_agi_3', name: 'Footwork Drills', unit: 'min', stat: 'AGI', tiers: defaultTiers(5, 8, 15, 20, 25, 35, 45, 60) },
      { id: 'p_agi_4', name: 'Jumping Jacks / Agility Ladder', unit: 'min', stat: 'AGI', anywhere: true, tiers: defaultTiers(3, 6, 8, 15, 15, 26, 25, 45) },
      { id: 'p_agi_5', name: 'Yoga Flow', unit: 'min', stat: 'AGI', tiers: defaultTiers(10, 8, 20, 20, 35, 35, 60, 60) },
      { id: 'p_agi_6', name: 'Hip Mobility / Splits Work', unit: 'min', stat: 'AGI', anywhere: true, tiers: defaultTiers(5, 6, 15, 15, 25, 26, 45, 45) },
      { id: 'p_agi_7', name: 'Dynamic Warmup', unit: 'min', stat: 'AGI', anywhere: true, tiers: defaultTiers(5, 6, 10, 15, 20, 26, 35, 45) },
      { id: 'p_agi_8', name: 'Archery Footwork / Stance Drills', unit: 'min', stat: 'AGI', tiers: defaultTiers(5, 8, 15, 20, 25, 35, 40, 60) },
    ],
    INT: [
      { id: 'p_int_1', name: 'Study', unit: 'min', stat: 'INT', anywhere: true, tiers: defaultTiers(15, 8, 30, 20, 60, 35, 120, 60) },
      { id: 'p_int_2', name: 'Japanese (Anki / Genki)', unit: 'min', stat: 'INT', anywhere: true, tiers: defaultTiers(15, 8, 30, 20, 60, 35, 90, 60) },
      { id: 'p_int_3', name: 'Robotics / Code Work', unit: 'min', stat: 'INT', tiers: defaultTiers(20, 10, 45, 25, 90, 45, 150, 80) },
      { id: 'p_int_4', name: 'Reading (non-fiction)', unit: 'min', stat: 'INT', anywhere: true, tiers: defaultTiers(15, 8, 30, 20, 60, 35, 100, 60) },
      { id: 'p_int_5', name: 'CAD / Design Work', unit: 'min', stat: 'INT', tiers: defaultTiers(20, 10, 45, 25, 90, 45, 150, 80) },
      { id: 'p_int_6', name: 'FreeCAD / Hexapod Design', unit: 'min', stat: 'INT', tiers: defaultTiers(20, 10, 45, 25, 90, 45, 150, 80) },
      { id: 'p_int_7', name: 'Physics / Math Practice', unit: 'min', stat: 'INT', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 100, 80) },
      { id: 'p_int_8', name: 'Documentation / Note Writing', unit: 'min', stat: 'INT', anywhere: true, tiers: defaultTiers(10, 8, 25, 20, 45, 35, 80, 60) },
    ],
    SNS: [
      { id: 'p_sns_1', name: 'Archery Practice', unit: 'shots', stat: 'SNS', tiers: defaultTiers(10, 10, 30, 25, 60, 45, 100, 80) },
      { id: 'p_sns_2', name: 'Balance Training', unit: 'min', stat: 'SNS', anywhere: true, tiers: defaultTiers(3, 8, 8, 20, 15, 35, 25, 60) },
      { id: 'p_sns_3', name: 'Reaction Drills', unit: 'min', stat: 'SNS', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 35, 80) },
      { id: 'p_sns_4', name: 'Meditation / Breathwork', unit: 'min', stat: 'SNS', anywhere: true, tiers: defaultTiers(5, 8, 10, 20, 20, 35, 40, 60) },
      { id: 'p_sns_5', name: 'Sparring / Airsoft Drill', unit: 'min', stat: 'SNS', tiers: defaultTiers(10, 10, 20, 25, 40, 45, 70, 80) },
      { id: 'p_sns_6', name: 'Slacklining', unit: 'min', stat: 'SNS', tiers: defaultTiers(3, 10, 8, 25, 15, 45, 25, 80) },
      { id: 'p_sns_7', name: 'Knife / Blade Precision Work', unit: 'min', stat: 'SNS', tiers: defaultTiers(10, 10, 20, 25, 40, 45, 70, 80) },
      { id: 'p_sns_8', name: 'Cold Exposure / Breath Hold', unit: 'min', stat: 'SNS', anywhere: true, tiers: defaultTiers(1, 8, 3, 20, 6, 35, 10, 60) },
      { id: 'p_sns_9', name: 'Eyes-Closed Balance / Proprioception Drill', unit: 'min', stat: 'SNS', anywhere: true, tiers: defaultTiers(2, 8, 5, 20, 10, 35, 18, 60) },
    ],
    DIS: [
      { id: 'p_dis_1', name: 'Clean Your Room', unit: 'min', stat: 'DIS', tiers: defaultTiers(10, 10, 20, 25, 35, 45, 60, 70) },
      { id: 'p_dis_2', name: 'Do the Dishes', unit: 'min', stat: 'DIS', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 30, 70) },
      { id: 'p_dis_3', name: 'Laundry', unit: 'loads', stat: 'DIS', tiers: defaultTiers(1, 10, 2, 25, 3, 45, 4, 70) },
      { id: 'p_dis_4', name: 'Meal Prep / Cooking', unit: 'min', stat: 'DIS', tiers: defaultTiers(15, 10, 30, 25, 45, 45, 70, 70) },
      { id: 'p_dis_5', name: 'Errands / Admin Tasks', unit: 'min', stat: 'DIS', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 100, 70) },
      { id: 'p_dis_6', name: 'Tidy Workspace / Tool Organization', unit: 'min', stat: 'DIS', tiers: defaultTiers(10, 10, 20, 25, 40, 45, 70, 70) },
      { id: 'p_dis_7', name: 'No Phone Before Bed', unit: 'min', stat: 'DIS', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 90, 70) },
      { id: 'p_dis_8', name: 'Early Wake-up (before 7AM)', unit: 'days', stat: 'DIS', tiers: defaultTiers(1, 15, 1, 30, 1, 50, 1, 80) },
      { id: 'p_dis_9', name: 'Budget / Finance Review', unit: 'min', stat: 'DIS', tiers: defaultTiers(10, 10, 20, 25, 40, 45, 60, 70) },
      { id: 'p_dis_10', name: 'Inbox Zero / Messages Cleanup', unit: 'min', stat: 'DIS', tiers: defaultTiers(10, 10, 20, 25, 35, 45, 60, 70) },
    ],
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const defaults = defaultState();
    // merge in case of missing keys from older versions
    return Object.assign(defaults, parsed, {
      stats: Object.assign({}, defaults.stats, parsed.stats),
      questPool: Object.assign({}, defaults.questPool, parsed.questPool),
    });
  } catch (e) {
    console.error('Failed to load state', e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------- Daily reset / rollover ----------------

function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getResetHour() { return 4; } // daily reset at 4 AM local, system-style

function currentCycleKey() {
  const now = new Date();
  const adjusted = new Date(now);
  if (now.getHours() < getResetHour()) adjusted.setDate(adjusted.getDate() - 1);
  return todayKey(adjusted);
}

function nextResetTime() {
  const now = new Date();
  const reset = new Date(now);
  reset.setHours(getResetHour(), 0, 0, 0);
  if (now >= reset) reset.setDate(reset.getDate() + 1);
  return reset;
}

const REQUIRED_CLEARS = 4; // out of STATS.length (6) mandatory daily quests
const DEBUFF_PER_FAIL = 0.15;  // -15% XP gain per consecutive failed cycle
const DEBUFF_CAP = 0.60;       // caps at -60% XP gain
const STAT_LOSS_PER_FAIL = 0.15; // -15% of current stat's xp-to-next per consecutive fail
const STAT_LOSS_CAP = 0.60;      // caps at -60%

function currentDebuffFraction() {
  return Math.min(DEBUFF_CAP, state.failStreak * DEBUFF_PER_FAIL);
}

function checkDailyRollover() {
  const cycle = currentCycleKey();
  if (state.lastResetISO === cycle) return;

  // first run ever: roll initial picks, no penalty
  if (state.lastResetISO === null) {
    rollDailyQuests();
    state.lastResetISO = cycle;
    saveState();
    return;
  }

  // evaluate previous cycle: need at least REQUIRED_CLEARS of the rolled
  // stat-quests cleared (any tier, >=75%). One quest is rolled per stat, so
  // this automatically means that many different stats represented.
  let clearedCount = 0;
  STATS.forEach(s => {
    const qid = state.dailyRoll[s.id];
    if (!qid) return;
    const prog = state.dailyProgress[qid];
    if (prog && prog.tiersCleared && prog.tiersCleared.some(Boolean)) clearedCount += 1;
  });

  // hard requirement: if a stat was flagged as "weak" for today's cycle, its
  // quest MUST clear — failing it alone triggers a penalty regardless of how
  // many of the other 6 cleared. Uses the snapshot taken when today was
  // rolled, not a fresh recalculation (stat levels may have shifted since).
  let weakStatFailed = false;
  if (state.todayWeakStat) {
    const qid = state.dailyRoll[state.todayWeakStat];
    const prog = qid && state.dailyProgress[qid];
    const cleared = prog && prog.tiersCleared && prog.tiersCleared.some(Boolean);
    if (!cleared) weakStatFailed = true;
  }

  const hadFullRoll = STATS.every(s => !!state.dailyRoll[s.id]);
  const penaltyTriggeredToday = hadFullRoll && (clearedCount < REQUIRED_CLEARS || weakStatFailed);

  if (penaltyTriggeredToday) {
    state.failStreak += 1;
    applyStatLossForFailedCycle();
    triggerPenalty();
    if (weakStatFailed && clearedCount >= REQUIRED_CLEARS) {
      addLog('penalty', 'Focus quest (' + state.todayWeakStat + ') was not cleared — penalty triggered despite meeting the general quota.');
    }
  }

  addLog('reset', 'Daily Quest cycle reset. Cleared ' + clearedCount + '/' + STATS.length + ' stat quests.');

  // record a compact snapshot of the cycle that just ended, for the weekly summary
  if (hadFullRoll) {
    state.dayHistory = state.dayHistory || [];
    state.dayHistory.unshift({
      dateISO: new Date().toISOString(),
      cleared: clearedCount,
      total: STATS.length,
      xpEarned: state.cycleXpEarned || 0,
      penalty: penaltyTriggeredToday,
      weakStat: state.todayWeakStat || null,
    });
    if (state.dayHistory.length > 60) state.dayHistory.length = 60; // ~8-9 weeks, keeps storage bounded
  }
  state.cycleXpEarned = 0;

  rollDailyQuests();
  state.dailyProgress = {};
  state.lastResetISO = cycle;
  saveState();
}

// Applies a one-time XP loss to every stat (and the player level bar) when a
// cycle fails. Loss scales with the current fail streak, same cap as the
// gain-debuff, and never drops a stat's xp below 0 or removes levels.
function applyStatLossForFailedCycle() {
  const lossFraction = Math.min(STAT_LOSS_CAP, state.failStreak * STAT_LOSS_PER_FAIL);
  STATS.forEach(s => {
    const stat = state.stats[s.id];
    const needed = statXpNeeded(stat.level);
    const loss = Math.round(needed * lossFraction);
    stat.xp = Math.max(0, stat.xp - loss);
  });
  const needed = xpNeededForLevel(state.level);
  state.xp = Math.max(0, state.xp - Math.round(needed * lossFraction));
  addLog('penalty', 'Stats weakened by the failed cycle (-' + Math.round(lossFraction * 100) + '% XP).');
}

// Rolls one random quest per stat from that stat's pool, avoiding yesterday's
// pick where the pool has more than one option.
function rollDailyQuests() {
  const newRoll = {};
  STATS.forEach(s => {
    const pool = state.questPool[s.id] || [];
    if (pool.length === 0) return;
    const prev = state.lastRoll[s.id];
    let candidates = pool;
    if (pool.length > 1 && prev) {
      candidates = pool.filter(q => q.id !== prev);
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    newRoll[s.id] = pick.id;
  });
  // remember today's picks so tomorrow's roll can avoid repeating them
  state.lastRoll = Object.assign({}, state.dailyRoll);
  state.dailyRoll = newRoll;
  state.rerolledToday = {}; // fresh reroll allowance for the new cycle
  // snapshot the weak stat for this cycle — locked in at roll time so XP
  // earned during the day doesn't retroactively change whether it was "weak"
  state.todayWeakStat = findWeakStat();
  if (state.todayWeakStat) {
    state.weakStatCounts = state.weakStatCounts || {};
    state.weakStatCounts[state.todayWeakStat] = (state.weakStatCounts[state.todayWeakStat] || 0) + 1;
  }
}

function findPoolQuest(questId) {
  for (const sid of Object.keys(state.questPool)) {
    const q = state.questPool[sid].find(q => q.id === questId);
    if (q) return q;
  }
  return null;
}

// Swaps today's mandatory quest for a given stat to one of that stat's
// "anywhere" (no equipment/location needed) quests, for days when the
// normal pick isn't realistically doable. Once per stat per cycle — after
// using it you're locked into the anywhere quest for the rest of the day.
function rerollToAnywhereQuest(statId) {
  if (state.rerolledToday[statId]) {
    showToast('Already rerolled ' + statId + ' today.');
    return;
  }
  const pool = state.questPool[statId] || [];
  const currentId = state.dailyRoll[statId];
  const anywhereOptions = pool.filter(q => q.anywhere && q.id !== currentId);
  if (anywhereOptions.length === 0) {
    showToast('No "anywhere" quest available for ' + statId + ' yet — add one in MANAGE QUEST POOL.');
    return;
  }
  const pick = anywhereOptions[Math.floor(Math.random() * anywhereOptions.length)];

  // clear any progress logged against the old quest for this slot, since
  // it's being replaced and no longer counts toward today's requirement
  if (currentId) delete state.dailyProgress[currentId];

  state.dailyRoll[statId] = pick.id;
  state.rerolledToday[statId] = true;
  saveState();
  render();
  showToast('Rerolled ' + statId + ' → ' + pick.name + ' (lower XP, no equipment needed)');
}

// Returns the XP fraction earned for a single tier attempt: 1 if target met,
// 0.75 if at least 75% of target reached, otherwise 0 (no partial credit below 75%).
function tierFraction(current, target) {
  if (target <= 0) return 0;
  const ratio = current / target;
  if (ratio >= 1) return 1;
  if (ratio >= 0.75) return 0.75;
  return 0;
}

// ---------------- Penalty ----------------

function triggerPenalty() {
  state.penaltyActive = true;
  const burpeeTarget = 100 + state.failStreak * 50; // escalates with consecutive fails
  state.penaltyQuest = {
    id: 'penalty_' + Date.now(),
    name: 'Penalty Quest: ' + burpeeTarget + ' Burpees',
    target: burpeeTarget,
    unit: 'reps',
    current: 0,
  };
  addLog('penalty', 'PENALTY ZONE triggered — failed cycle #' + state.failStreak + ' in a row.');
}

function clearPenalty() {
  state.penaltyActive = false;
  state.penaltyQuest = null;
  state.failStreak = 0;
  addLog('reset', 'Penalty lifted. Fail streak reset.');
  saveState();
}

// ---------------- XP / Leveling ----------------

function addLog(type, msg) {
  state.log.unshift({ dateISO: new Date().toISOString(), type, msg });
  if (state.log.length > 200) state.log.length = 200;
}

function grantXP(amount, statId) {
  const levelUps = [];
  const statGains = [];

  // while a penalty is active, all XP gains are reduced based on the fail streak
  if (state.penaltyActive) {
    const debuff = currentDebuffFraction();
    amount = Math.round(amount * (1 - debuff));
  }

  state.cycleXpEarned = (state.cycleXpEarned || 0) + amount;

  // player XP
  state.xp += amount;
  let needed = xpNeededForLevel(state.level);
  while (state.xp >= needed) {
    state.xp -= needed;
    state.level += 1;
    levelUps.push(state.level);
    needed = xpNeededForLevel(state.level);
  }

  // stat XP (stat gets same amount as a sub-track)
  if (statId && state.stats[statId]) {
    const s = state.stats[statId];
    s.xp += amount;
    let sNeeded = statXpNeeded(s.level);
    while (s.xp >= sNeeded) {
      s.xp -= sNeeded;
      s.level += 1;
      statGains.push(statId + ' → ' + s.level);
      sNeeded = statXpNeeded(s.level);
    }
  }

  if (levelUps.length > 0) {
    showLevelUp(state.level, statGains);
    addLog('levelup', 'Reached Level ' + state.level + '.');
  }
  saveState();
  return amount;
}

// ---------------- Rendering ----------------

const el = (id) => document.getElementById(id);

function render() {
  renderHud();
  renderStatus();
  renderQuests();
  renderLog();
  renderPenalty();
}

function renderHud() {
  el('playerName').textContent = state.playerName;
  el('hudLevel').textContent = state.level;
  const needed = xpNeededForLevel(state.level);
  el('xpCurrent').textContent = state.xp;
  el('xpNeeded').textContent = needed;
  el('xpFill').style.width = Math.min(100, (state.xp / needed) * 100) + '%';
}

function renderStatus() {
  const weakStat = findWeakStat();

  const callout = el('weakStatCallout');
  if (weakStat) {
    callout.classList.remove('hidden');
    const statName = (STATS.find(s => s.id === weakStat) || {}).name || weakStat;
    const lockedNote = state.todayWeakStat === weakStat
      ? ' Its quest is locked in as today\'s required focus.'
      : ' Tomorrow\'s roll will lock in a required focus quest for it.';
    callout.innerHTML = `<span class="focus-banner-tag">WEAK STAT</span> ${statName} (${weakStat}) is falling behind the others.${lockedNote}`;
  } else {
    callout.classList.add('hidden');
  }

  const grid = el('statGrid');
  grid.innerHTML = '';
  STATS.forEach(s => {
    const data = state.stats[s.id];
    const needed = statXpNeeded(data.level);
    const pct = Math.min(100, (data.xp / needed) * 100);
    const row = document.createElement('div');
    row.className = 'stat-row' + (s.id === weakStat ? ' weak' : '');
    row.innerHTML = `
      <span class="stat-id">${s.id}</span>
      <span class="stat-name">${s.name}</span>
      ${s.id === weakStat ? '<span class="weak-stat-tag">WEAK</span>' : ''}
      <span class="stat-level">${data.level}</span>
      <div class="stat-mini-bar"><div class="stat-mini-fill" style="width:${pct}%"></div></div>
    `;
    grid.appendChild(row);
  });

  const title = TITLES.slice().reverse().find(t => state.level >= t.min);
  const rank = RANKS.slice().reverse().find(r => state.level >= r.min);
  el('jobTitle').textContent = title ? title.label : 'Novice';
  el('rankValue').textContent = rank ? rank.label : 'E';

  const debuffRow = el('debuffRow');
  if (state.penaltyActive) {
    debuffRow.classList.remove('hidden');
    const pct = Math.round(currentDebuffFraction() * 100);
    el('debuffValue').textContent = '-' + pct + '% XP · fail streak: ' + state.failStreak;
  } else {
    debuffRow.classList.add('hidden');
  }
}

function renderQuests() {
  // countdown
  const reset = nextResetTime();
  updateCountdown(reset);

  // ---- mandatory: today's rolled quest, one per stat ----
  const dailyList = el('dailyQuestList');
  dailyList.innerHTML = '';

  if (state.todayWeakStat) {
    const banner = document.createElement('div');
    banner.className = 'focus-banner';
    const statName = (STATS.find(s => s.id === state.todayWeakStat) || {}).name || state.todayWeakStat;
    banner.innerHTML = `<span class="focus-banner-tag">FOCUS</span> ${statName} is lagging behind — its quest today is mandatory no matter what else you clear.`;
    dailyList.appendChild(banner);
  }

  let clearedCount = 0;
  // show the weak stat's quest first so it can't be missed, then the rest in stat order
  const orderedStats = state.todayWeakStat
    ? [STATS.find(s => s.id === state.todayWeakStat), ...STATS.filter(s => s.id !== state.todayWeakStat)]
    : STATS;
  orderedStats.forEach(s => {
    const qid = state.dailyRoll[s.id];
    if (!qid) return;
    const quest = findPoolQuest(qid);
    if (!quest) return;
    const prog = state.dailyProgress[qid] || { current: 0, tierIndex: 0, tiersCleared: [false, false, false, false] };
    if (prog.tiersCleared.some(Boolean)) clearedCount += 1;
    const isFocus = state.todayWeakStat === s.id;
    dailyList.appendChild(buildTierQuestCard(quest, prog, 'daily', isFocus ? 'focus' : true));
  });

  el('dailyProgressCount').textContent = clearedCount + ' / ' + STATS.length + ' cleared · need ' + REQUIRED_CLEARS + ' to avoid penalty';
  el('dailyProgressCount').classList.toggle('warn', clearedCount < REQUIRED_CLEARS);
  el('dailyProgressCount').classList.toggle('safe', clearedCount >= REQUIRED_CLEARS);

  if (state.penaltyActive && state.penaltyQuest) {
    const pq = state.penaltyQuest;
    const card = buildFlatQuestCard(
      { id: pq.id, name: pq.name, target: pq.target, unit: pq.unit, isPenalty: true },
      { current: pq.current },
      'penalty'
    );
    dailyList.appendChild(card);
  }

  // ---- optional: rest of each stat's pool, not rolled today, grouped by stat ----
  const optionalList = el('optionalQuestList');
  optionalList.innerHTML = '';
  let anyOptional = false;
  STATS.forEach(s => {
    const pool = state.questPool[s.id] || [];
    const rolledId = state.dailyRoll[s.id];
    const remaining = pool.filter(q => q.id !== rolledId);
    if (remaining.length === 0) return;
    anyOptional = true;

    const header = document.createElement('div');
    header.className = 'optional-stat-header';
    header.innerHTML = `<span class="optional-stat-id">${s.id}</span><span class="optional-stat-name">${s.name}</span>`;
    optionalList.appendChild(header);

    remaining.forEach(quest => {
      const prog = state.dailyProgress[quest.id] || { current: 0, tierIndex: 0, tiersCleared: [false, false, false, false] };
      optionalList.appendChild(buildTierQuestCard(quest, prog, 'daily', false));
    });
  });
  if (!anyOptional) {
    optionalList.innerHTML = '<div class="log-empty">No optional quests in the pool.</div>';
  }

  // ---- one-off quests, unchanged ----
  const oneOffList = el('oneOffQuestList');
  oneOffList.innerHTML = '';
  if (state.oneOffQuests.length === 0) {
    oneOffList.innerHTML = '<div class="log-empty">No active quests. Tap + NEW to add one.</div>';
  }
  state.oneOffQuests.forEach(q => {
    const prog = { current: q.current || 0, tierIndex: q.tierIndex || 0, tiersCleared: q.tiersCleared || [false, false, false, false] };
    const card = buildTierQuestCard(q, prog, 'oneoff', false);
    oneOffList.appendChild(card);
  });
}

// Quest card for tiered quests (rolled daily picks, optional pool quests, one-offs).
// Shows which difficulty tiers have been cleared today as small pips,
// plus the live progress bar for whichever tier is currently selected.
function buildTierQuestCard(quest, prog, kind, isMandatory) {
  const tiers = quest.tiers || [];
  const tierIndex = Math.min(prog.tierIndex || 0, tiers.length - 1);
  const activeTier = tiers[tierIndex] || { target: 1, xp: 0, label: '?' };
  const cleared = prog.tiersCleared || [];
  const anyCleared = cleared.some(Boolean);
  const allCleared = tiers.length > 0 && cleared.filter(Boolean).length === tiers.length;
  const pct = Math.min(100, ((prog.current || 0) / activeTier.target) * 100);
  const fraction = tierFraction(prog.current || 0, activeTier.target);

  const isFocus = isMandatory === 'focus';
  const card = document.createElement('div');
  card.className = 'quest-card' + (allCleared ? ' complete' : '') + (isFocus ? ' focus' : (isMandatory ? ' mandatory' : ''));
  const statLabel = quest.stat ? ' · ' + quest.stat : '';
  const badge = isFocus
    ? '<span class="focus-tag">FOCUS · REQUIRED</span>'
    : (isMandatory ? '<span class="mandatory-tag">MANDATORY</span>' : '<span class="optional-tag">optional</span>');
  const displayXP = state.penaltyActive ? Math.round(activeTier.xp * (1 - currentDebuffFraction())) : activeTier.xp;
  const xpDisplay = state.penaltyActive && displayXP < activeTier.xp
    ? `<span class="xp-debuffed">+${displayXP} XP</span> <span class="xp-original">+${activeTier.xp}</span>${statLabel}`
    : `+${activeTier.xp} XP${statLabel}`;

  const pips = tiers.map((t, i) => {
    const done = cleared[i];
    const isActive = i === tierIndex;
    return `<span class="tier-pip ${done ? 'done' : ''} ${isActive ? 'active' : ''}">${t.label[0]}</span>`;
  }).join('');

  card.innerHTML = `
    <div class="quest-top">
      <span class="quest-name ${anyCleared ? 'done' : ''}">${anyCleared ? '✓ ' : ''}${quest.name}</span>
      ${badge}
    </div>
    <div class="quest-sub-row">
      <div class="tier-pip-row">${pips}</div>
      <span class="quest-reward">${xpDisplay}</span>
    </div>
    <div class="quest-bar"><div class="quest-bar-fill ${fraction >= 1 ? 'full' : (fraction >= 0.75 ? 'partial' : '')}" style="width:${pct}%"></div></div>
    <div class="quest-progress-text">${prog.current || 0} / ${activeTier.target} ${quest.unit || ''} · ${activeTier.label}</div>
  `;

  // reroll option: only for mandatory/focus quests (not optional or one-off),
  // hidden once the quest is already cleared today
  if (isMandatory && quest.stat && !anyCleared) {
    const alreadyRerolled = !!state.rerolledToday[quest.stat];
    const hasAnywhereOption = (state.questPool[quest.stat] || []).some(q => q.anywhere && q.id !== quest.id);
    const rerollBtn = document.createElement('button');
    rerollBtn.className = 'reroll-btn';
    if (alreadyRerolled) {
      rerollBtn.textContent = '↻ already rerolled today';
      rerollBtn.disabled = true;
    } else if (!hasAnywhereOption) {
      rerollBtn.textContent = '↻ no fallback quest set up for ' + quest.stat;
      rerollBtn.disabled = true;
    } else {
      rerollBtn.textContent = '↻ can\'t do this today — swap for a no-equipment quest';
      rerollBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rerollToAnywhereQuest(quest.stat);
      });
    }
    card.appendChild(rerollBtn);
  }
  if (kind === 'oneoff') {
    const del = document.createElement('button');
    del.className = 'quest-delete';
    del.textContent = '✕ remove';
    del.style.marginTop = '8px';
    del.style.fontSize = '10px';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      state.oneOffQuests = state.oneOffQuests.filter(q => q.id !== quest.id);
      saveState();
      render();
    });
    card.appendChild(del);
  }
  card.addEventListener('click', () => openProgressModal(quest, kind));
  return card;
}

// Quest card for flat (non-tiered) quests — currently only the penalty makeup quest.
function buildFlatQuestCard(quest, prog, kind) {
  const pct = Math.min(100, ((prog.current || 0) / quest.target) * 100);
  const isComplete = (prog.current || 0) >= quest.target;
  const card = document.createElement('div');
  card.className = 'quest-card' + (isComplete ? ' complete' : '');
  card.innerHTML = `
    <div class="quest-top">
      <span class="quest-name ${isComplete ? 'done' : ''}">${isComplete ? '✓ ' : ''}${quest.name}</span>
      <span class="quest-reward">${quest.isPenalty ? 'MAKEUP' : ''}</span>
    </div>
    <div class="quest-bar"><div class="quest-bar-fill ${isComplete ? 'full' : ''}" style="width:${pct}%"></div></div>
    <div class="quest-progress-text">${prog.current || 0} / ${quest.target} ${quest.unit || ''}</div>
  `;
  card.addEventListener('click', () => openProgressModal(quest, kind));
  return card;
}

function updateCountdown(reset) {
  const diff = reset - new Date();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el('resetCountdown').textContent =
    String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function renderLog() {
  renderWeeklySummary();
  renderWeakStatHistory();

  const list = el('logList');
  list.innerHTML = '';
  if (state.log.length === 0) {
    list.innerHTML = '<div class="log-empty">No history yet. Complete a quest to begin.</div>';
    return;
  }
  state.log.forEach(entry => {
    const d = document.createElement('div');
    d.className = 'log-entry ' + (entry.type === 'levelup' ? 'levelup' : entry.type === 'penalty' ? 'penalty' : '');
    const date = new Date(entry.dateISO);
    d.innerHTML = `<div class="log-date">${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div><div class="log-msg">${entry.msg}</div>`;
    list.appendChild(d);
  });
}

// Last 7 completed cycles: total XP, days cleared, penalty count, and which
// stat earned the most XP this week (derived from dayHistory snapshots).
function renderWeeklySummary() {
  const section = el('weeklySummary');
  const history = (state.dayHistory || []).slice(0, 7);
  if (history.length === 0) {
    section.innerHTML = '<div class="log-empty">No completed cycles yet — check back after your first daily reset.</div>';
    return;
  }

  const totalXP = history.reduce((sum, d) => sum + (d.xpEarned || 0), 0);
  const cleanDays = history.filter(d => !d.penalty).length;
  const penaltyDays = history.filter(d => d.penalty).length;
  const avgCleared = (history.reduce((sum, d) => sum + (d.cleared || 0), 0) / history.length).toFixed(1);

  section.innerHTML = `
    <div class="weekly-grid">
      <div class="weekly-stat"><span class="weekly-num">${totalXP}</span><span class="weekly-label">XP earned</span></div>
      <div class="weekly-stat"><span class="weekly-num">${cleanDays}/${history.length}</span><span class="weekly-label">clean days</span></div>
      <div class="weekly-stat"><span class="weekly-num">${avgCleared}/${STATS.length}</span><span class="weekly-label">avg cleared</span></div>
    </div>
    <div class="weekly-days">${history.map(d => {
      const cls = d.penalty ? 'fail' : (d.cleared >= STATS.length ? 'perfect' : 'ok');
      const day = new Date(d.dateISO).toLocaleDateString(undefined, { weekday: 'short' });
      return `<div class="weekly-day-pip ${cls}" title="${day}: ${d.cleared}/${d.total} cleared, +${d.xpEarned} XP">${day[0]}</div>`;
    }).reverse().join('')}</div>
    ${penaltyDays > 0 ? `<div class="weekly-note">${penaltyDays} penalty day${penaltyDays > 1 ? 's' : ''} this week.</div>` : ''}
  `;
}

// How many times each stat has been flagged as the weak/focus stat overall —
// a structural signal: a stat flagged constantly might mean its pool targets
// are miscalibrated rather than you actually slacking on it.
function renderWeakStatHistory() {
  const section = el('weakStatHistory');
  const counts = state.weakStatCounts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    section.innerHTML = '<div class="log-empty">No stat has been flagged weak yet.</div>';
    return;
  }
  const maxCount = Math.max(...Object.values(counts));
  section.innerHTML = STATS.map(s => {
    const n = counts[s.id] || 0;
    if (n === 0) return '';
    const pct = Math.round((n / maxCount) * 100);
    return `
      <div class="weak-history-row">
        <span class="weak-history-id">${s.id}</span>
        <div class="weak-history-bar"><div class="weak-history-fill" style="width:${pct}%"></div></div>
        <span class="weak-history-count">${n}×</span>
      </div>`;
  }).join('');
}

function renderPenalty() {
  // Persistent whole-app red tint for as long as the penalty is active —
  // distinct from the one-time full-screen overlay shown on app open.
  document.body.classList.toggle('penalty-tint', state.penaltyActive);
}

// ---------------- Progress modal (tap-to-log) ----------------

let activeProgressQuest = null;
let activeProgressKind = null;
let activeTierIndex = 0;

function openProgressModal(quest, kind) {
  activeProgressQuest = quest;
  activeProgressKind = kind;
  el('progressQuestName').textContent = quest.name.toUpperCase();

  const tierRow = el('progressTierRow');

  if (kind === 'penalty') {
    tierRow.innerHTML = '';
    tierRow.classList.add('hidden');
    el('progressLabel').textContent = 'AMOUNT COMPLETED (' + (quest.unit || 'units') + ')';
    el('progressInput').value = state.penaltyQuest?.current || 0;
    el('progressModal').classList.remove('hidden');
    return;
  }

  tierRow.classList.remove('hidden');
  const progStore = kind === 'daily' ? state.dailyProgress[quest.id] : state.oneOffQuests.find(q => q.id === quest.id);
  const tiersCleared = (progStore && progStore.tiersCleared) || [false, false, false, false];
  activeTierIndex = (progStore && progStore.tierIndex) || 0;

  tierRow.innerHTML = quest.tiers.map((t, i) => `
    <button class="tier-select-btn ${i === activeTierIndex ? 'active' : ''} ${tiersCleared[i] ? 'cleared' : ''}" data-tier="${i}">
      ${t.label}<span class="tier-select-meta">${t.target}${quest.unit ? ' ' + quest.unit : ''} · +${t.xp}xp</span>
    </button>
  `).join('');

  tierRow.querySelectorAll('.tier-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTierIndex = parseInt(btn.dataset.tier);
      tierRow.querySelectorAll('.tier-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tier = quest.tiers[activeTierIndex];
      el('progressLabel').textContent = tier.label.toUpperCase() + ' — AMOUNT COMPLETED (' + (quest.unit || 'units') + ')';
      el('progressInput').value = (progStore && progStore.current) || 0;
    });
  });

  const tier = quest.tiers[activeTierIndex];
  el('progressLabel').textContent = tier.label.toUpperCase() + ' — AMOUNT COMPLETED (' + (quest.unit || 'units') + ')';
  el('progressInput').value = (progStore && progStore.current) || 0;
  el('progressModal').classList.remove('hidden');
}

function closeProgressModal() {
  el('progressModal').classList.add('hidden');
  activeProgressQuest = null;
  activeProgressKind = null;
}

function saveProgress() {
  const val = Math.max(0, parseFloat(el('progressInput').value) || 0);
  const quest = activeProgressQuest;
  const kind = activeProgressKind;
  if (!quest) return closeProgressModal();

  if (kind === 'penalty') {
    state.penaltyQuest.current = val;
    if (val >= state.penaltyQuest.target) {
      clearPenalty();
      showToast('Penalty lifted.');
    }
    saveState();
    render();
    closeProgressModal();
    return;
  }

  const tier = quest.tiers[activeTierIndex];
  const fraction = tierFraction(val, tier.target);

  if (kind === 'daily') {
    const existing = state.dailyProgress[quest.id] || { tiersCleared: [false, false, false, false] };
    const alreadyCleared = !!existing.tiersCleared[activeTierIndex];
    existing.current = val;
    existing.tierIndex = activeTierIndex;
    if (fraction > 0 && !alreadyCleared) {
      existing.tiersCleared[activeTierIndex] = true;
      const xpAward = fraction >= 1 ? tier.xp : Math.round(tier.xp * 0.75);
      const actualXP = grantXP(xpAward, quest.stat);
      const debuffNote = actualXP < xpAward ? ' (debuffed)' : '';
      addLog('quest', 'Completed "' + quest.name + '" (' + tier.label + ')' + (fraction < 1 ? ' partial' : '') + ' +' + actualXP + ' XP' + debuffNote);
      showToast('+' + actualXP + ' XP — ' + quest.name + ' (' + tier.label + ')' + debuffNote);
    }
    state.dailyProgress[quest.id] = existing;
  } else if (kind === 'oneoff') {
    const q = state.oneOffQuests.find(q => q.id === quest.id);
    if (q) {
      if (!q.tiersCleared) q.tiersCleared = [false, false, false, false];
      const alreadyCleared = !!q.tiersCleared[activeTierIndex];
      q.current = val;
      q.tierIndex = activeTierIndex;
      if (fraction > 0 && !alreadyCleared) {
        q.tiersCleared[activeTierIndex] = true;
        const xpAward = fraction >= 1 ? tier.xp : Math.round(tier.xp * 0.75);
        const actualXP = grantXP(xpAward, q.stat);
        const debuffNote = actualXP < xpAward ? ' (debuffed)' : '';
        addLog('quest', 'Completed "' + q.name + '" (' + tier.label + ')' + (fraction < 1 ? ' partial' : '') + ' +' + actualXP + ' XP' + debuffNote);
        showToast('+' + actualXP + ' XP — ' + q.name + ' (' + tier.label + ')' + debuffNote);
      }
    }
  }

  saveState();
  render();
  closeProgressModal();
}

// ---------------- One-off quest modal ----------------

let questModalMode = 'oneoff';

function openQuestModal(mode = 'oneoff') {
  questModalMode = mode;
  el('qName').value = '';
  el('qUnit').value = '';
  el('qAnywhere').checked = false;
  for (let i = 0; i < 4; i++) {
    el('qTierTarget' + i).value = '';
    el('qTierXP' + i).value = '';
  }
  const sel = el('qStat');
  sel.innerHTML = STATS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  el('questModalTitle').textContent = mode === 'daily' ? 'NEW DAILY QUEST' : 'NEW QUEST';
  el('qAnywhereRow').classList.toggle('hidden', mode !== 'daily');
  el('questModal').classList.remove('hidden');
}

function closeQuestModal() { el('questModal').classList.add('hidden'); }

// Rounds a target to a clean-looking number depending on magnitude, so
// auto-suggested tiers don't come out as ugly values like "23.7 reps".
function roundNice(value, unit) {
  if (value <= 0) return 0;
  if (value < 3) return Math.max(1, Math.round(value));
  if (value < 20) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}

// Derived from the ratios across the app's default quest pool (Easy/Hard/
// Brutal relative to Medium, averaged across ~50 quests): Easy runs about
// 0.4x Medium, Hard about 1.9x, Brutal about 3.2x — same ratio applies to
// both target and XP since they scale together in the existing data.
const TIER_SCALE_RATIOS = { easy: 0.4, hard: 1.9, brutal: 3.2 };

function autoFillTiersFromMedium() {
  const medTarget = parseFloat(el('qTierTarget1').value);
  const medXp = parseInt(el('qTierXP1').value);
  if (!medTarget || medTarget <= 0) {
    showToast('Enter a Medium target first.');
    return;
  }
  const xpBase = medXp && medXp > 0 ? medXp : Math.max(10, Math.round(medTarget * 2)); // reasonable XP if left blank

  el('qTierTarget0').value = roundNice(medTarget * TIER_SCALE_RATIOS.easy);
  el('qTierXP0').value = Math.round(xpBase * TIER_SCALE_RATIOS.easy / 5) * 5;
  el('qTierXP1').value = xpBase;
  el('qTierTarget2').value = roundNice(medTarget * TIER_SCALE_RATIOS.hard);
  el('qTierXP2').value = Math.round(xpBase * TIER_SCALE_RATIOS.hard / 5) * 5;
  el('qTierTarget3').value = roundNice(medTarget * TIER_SCALE_RATIOS.brutal);
  el('qTierXP3').value = Math.round(xpBase * TIER_SCALE_RATIOS.brutal / 5) * 5;

  showToast('Tiers auto-filled from Medium. Adjust as needed.');
}

function saveNewQuest() {
  const name = el('qName').value.trim();
  if (!name) { showToast('Enter a quest name.'); return; }
  const unit = el('qUnit').value.trim() || 'reps';
  const stat = el('qStat').value;

  const labels = ['Easy', 'Medium', 'Hard', 'Brutal'];
  const tiers = [];
  for (let i = 0; i < 4; i++) {
    const target = parseFloat(el('qTierTarget' + i).value);
    const xp = parseInt(el('qTierXP' + i).value);
    if (target > 0 && xp > 0) {
      tiers.push({ label: labels[i], target, xp });
    }
  }
  if (tiers.length === 0) { showToast('Set at least one difficulty tier.'); return; }

  if (questModalMode === 'daily') {
    const anywhere = el('qAnywhere').checked;
    if (!state.questPool[stat]) state.questPool[stat] = [];
    state.questPool[stat].push({ id: 'p_' + stat.toLowerCase() + '_' + Date.now(), name, unit, stat, anywhere, tiers });
    saveState();
    renderDailyTemplateList();
  } else {
    state.oneOffQuests.push({
      id: 'q_' + Date.now(), name, unit, stat, tiers,
      current: 0, tierIndex: 0, tiersCleared: tiers.map(() => false),
    });
    saveState();
    render();
  }
  closeQuestModal();
  showToast('Quest added: ' + name);
}

// ---------------- Daily template manager ----------------

function openDailyModal() {
  renderDailyTemplateList();
  el('dailyModal').classList.remove('hidden');
}
function closeDailyModal() { el('dailyModal').classList.add('hidden'); render(); }

function renderDailyTemplateList() {
  const list = el('dailyTemplateList');
  list.innerHTML = '';
  let any = false;
  STATS.forEach(s => {
    const pool = state.questPool[s.id] || [];
    if (pool.length === 0) return;
    any = true;
    const header = document.createElement('div');
    header.className = 'pool-stat-header';
    header.textContent = s.name + ' (' + s.id + ')';
    list.appendChild(header);

    pool.forEach(q => {
      const row = document.createElement('div');
      row.className = 'daily-template-row';
      const tierSummary = (q.tiers || []).map(tier => tier.label[0] + ':' + tier.target).join(' ');
      const isRolledToday = state.dailyRoll[s.id] === q.id;
      row.innerHTML = `
        <div class="daily-template-info">
          <div>${q.name}${isRolledToday ? ' <span class="rolled-today-tag">today\'s pick</span>' : ''}${q.anywhere ? ' <span class="anywhere-tag">anywhere</span>' : ''}</div>
          <div class="daily-template-meta">${tierSummary} ${q.unit}</div>
        </div>
        <button class="quest-delete" data-id="${q.id}">✕</button>
      `;
      row.querySelector('.quest-delete').addEventListener('click', () => {
        if (pool.length <= 1) {
          showToast('Keep at least one quest per stat.');
          return;
        }
        state.questPool[s.id] = state.questPool[s.id].filter(x => x.id !== q.id);
        // if we just deleted today's rolled quest for this stat, re-roll that slot
        if (state.dailyRoll[s.id] === q.id) {
          const remaining = state.questPool[s.id];
          const pick = remaining[Math.floor(Math.random() * remaining.length)];
          state.dailyRoll[s.id] = pick.id;
          delete state.dailyProgress[q.id];
        }
        saveState();
        renderDailyTemplateList();
        render();
      });
      list.appendChild(row);
    });
  });
  if (!any) {
    list.innerHTML = '<div class="log-empty">No quests in the pool yet.</div>';
  }
}

function addDailyTemplate() {
  openQuestModal('daily');
}

// ---------------- Level up / Toast ----------------

function showLevelUp(level, statGains) {
  el('newLevel').textContent = level;
  el('statGainList').innerHTML = statGains.map(g => '<div>' + g + '</div>').join('');
  el('levelUpOverlay').classList.remove('hidden');
}

let toastTimer = null;
function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ---------------- Tabs ----------------

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      el('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ---------------- Init ----------------

function init() {
  checkDailyRollover();
  setupTabs();
  render();

  // show penalty overlay once per app open if active and not yet acknowledged this session
  if (state.penaltyActive) {
    el('penaltyOverlay').classList.remove('hidden');
  }

  el('penaltyAck').addEventListener('click', () => {
    el('penaltyOverlay').classList.add('hidden');
  });
  el('levelUpAck').addEventListener('click', () => {
    el('levelUpOverlay').classList.add('hidden');
  });

  el('addQuestBtn').addEventListener('click', () => openQuestModal('oneoff'));
  el('qCancel').addEventListener('click', closeQuestModal);
  el('qSave').addEventListener('click', saveNewQuest);
  el('autoFillTiersBtn').addEventListener('click', autoFillTiersFromMedium);

  el('manageQuestsBtn').addEventListener('click', openDailyModal);
  el('dailyClose').addEventListener('click', closeDailyModal);
  el('dailyAddBtn').addEventListener('click', addDailyTemplate);

  el('progressCancel').addEventListener('click', closeProgressModal);
  el('progressSave').addEventListener('click', saveProgress);

  setInterval(() => {
    checkDailyRollover();
    updateCountdown(nextResetTime());
  }, 1000);

  setTimeout(() => {
    el('boot').style.opacity = '0';
    setTimeout(() => el('boot').remove(), 500);
  }, 1500);
}

document.addEventListener('DOMContentLoaded', init);

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW failed', err));
  });
}
