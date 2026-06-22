// ===================== THE SYSTEM — app logic =====================

const STORAGE_KEY = 'system_state_v3'; // v3: quest pools + daily random roll per stat

const STATS = [
  { id: 'STR', name: 'Strength' },   // bodyweight/strength quests
  { id: 'VIT', name: 'Vitality' },   // runs / cardio / endurance
  { id: 'AGI', name: 'Agility' },    // stretches / mobility
  { id: 'INT', name: 'Intelligence' }, // learning / study
  { id: 'SNS', name: 'Sense' },      // archery, balance, reaction/reflex, breathwork/focus
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
    statPoints: 0,
    stats,
    questPool: defaultQuestPool(),
    dailyRoll: {},          // { STR: questId, VIT: questId, ... } — today's mandatory pick per stat
    lastRoll: {},           // { STR: questId, ... } — yesterday's pick, so we avoid repeats
    dailyProgress: {},      // { questId: { tiersCleared: [bool,bool,bool,bool], current, tierIndex } }
    oneOffQuests: [],       // { id, name, unit, stat, tiers, tiersCleared, current, tierIndex }
    lastResetISO: null,     // ISO date string of last daily reset
    penaltyActive: false,
    penaltyQuest: null,     // a generated makeup quest while penalty is active
    log: [],                // { dateISO, type, msg }
  };
}

// Quest pools — several quests per stat. The daily system rolls ONE of these
// per stat each day as the mandatory pick; the rest are available as optional
// extra quests for that stat, same tier system, just not required.
function defaultQuestPool() {
  return {
    STR: [
      { id: 'p_str_1', name: 'Push-ups', unit: 'reps', stat: 'STR', tiers: defaultTiers(10, 10, 50, 25, 100, 45, 150, 70) },
      { id: 'p_str_2', name: 'Squats', unit: 'reps', stat: 'STR', tiers: defaultTiers(15, 10, 60, 25, 120, 45, 180, 70) },
      { id: 'p_str_3', name: 'Pull-ups', unit: 'reps', stat: 'STR', tiers: defaultTiers(3, 10, 10, 25, 20, 45, 35, 70) },
      { id: 'p_str_4', name: 'Plank Hold', unit: 'min', stat: 'STR', tiers: defaultTiers(1, 10, 3, 25, 5, 45, 8, 70) },
      { id: 'p_str_5', name: 'Forge / Anvil Work', unit: 'min', stat: 'STR', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 120, 70) },
      { id: 'p_str_6', name: 'Weighted Carry', unit: 'min', stat: 'STR', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 30, 70) },
    ],
    VIT: [
      { id: 'p_vit_1', name: 'Run', unit: 'km', stat: 'VIT', tiers: defaultTiers(1, 10, 3, 25, 5, 45, 10, 80) },
      { id: 'p_vit_2', name: 'Cycling', unit: 'km', stat: 'VIT', tiers: defaultTiers(3, 10, 10, 25, 20, 45, 40, 80) },
      { id: 'p_vit_3', name: 'Jump Rope', unit: 'min', stat: 'VIT', tiers: defaultTiers(3, 10, 8, 25, 15, 45, 25, 80) },
      { id: 'p_vit_4', name: 'Stairs / Hill Sprints', unit: 'min', stat: 'VIT', tiers: defaultTiers(3, 10, 8, 25, 15, 45, 25, 80) },
      { id: 'p_vit_5', name: 'Swimming', unit: 'min', stat: 'VIT', tiers: defaultTiers(10, 10, 20, 25, 35, 45, 60, 80) },
    ],
    AGI: [
      { id: 'p_agi_1', name: 'Stretching', unit: 'min', stat: 'AGI', tiers: defaultTiers(5, 8, 15, 20, 30, 35, 60, 60) },
      { id: 'p_agi_2', name: 'Mobility Flow', unit: 'min', stat: 'AGI', tiers: defaultTiers(5, 8, 15, 20, 25, 35, 45, 60) },
      { id: 'p_agi_3', name: 'Footwork Drills', unit: 'min', stat: 'AGI', tiers: defaultTiers(5, 8, 15, 20, 25, 35, 45, 60) },
      { id: 'p_agi_4', name: 'Jumping Jacks / Agility Ladder', unit: 'min', stat: 'AGI', tiers: defaultTiers(3, 8, 8, 20, 15, 35, 25, 60) },
      { id: 'p_agi_5', name: 'Yoga Flow', unit: 'min', stat: 'AGI', tiers: defaultTiers(10, 8, 20, 20, 35, 35, 60, 60) },
    ],
    INT: [
      { id: 'p_int_1', name: 'Study', unit: 'min', stat: 'INT', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 120, 80) },
      { id: 'p_int_2', name: 'Japanese (Anki / Genki)', unit: 'min', stat: 'INT', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 90, 80) },
      { id: 'p_int_3', name: 'Robotics / Code Work', unit: 'min', stat: 'INT', tiers: defaultTiers(20, 10, 45, 25, 90, 45, 150, 80) },
      { id: 'p_int_4', name: 'Reading (non-fiction)', unit: 'min', stat: 'INT', tiers: defaultTiers(15, 10, 30, 25, 60, 45, 100, 80) },
      { id: 'p_int_5', name: 'CAD / Design Work', unit: 'min', stat: 'INT', tiers: defaultTiers(20, 10, 45, 25, 90, 45, 150, 80) },
    ],
    SNS: [
      { id: 'p_sns_1', name: 'Archery Practice', unit: 'shots', stat: 'SNS', tiers: defaultTiers(10, 10, 30, 25, 60, 45, 100, 80) },
      { id: 'p_sns_2', name: 'Balance Training', unit: 'min', stat: 'SNS', tiers: defaultTiers(3, 10, 8, 25, 15, 45, 25, 80) },
      { id: 'p_sns_3', name: 'Reaction Drills', unit: 'min', stat: 'SNS', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 35, 80) },
      { id: 'p_sns_4', name: 'Meditation / Breathwork', unit: 'min', stat: 'SNS', tiers: defaultTiers(5, 10, 10, 25, 20, 45, 40, 80) },
      { id: 'p_sns_5', name: 'Sparring / Airsoft Drill', unit: 'min', stat: 'SNS', tiers: defaultTiers(10, 10, 20, 25, 40, 45, 70, 80) },
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

  // evaluate previous cycle: need at least 3 of the 5 rolled stat-quests
  // cleared (any tier, >=75%). Since exactly one quest is rolled per stat,
  // "3 of 5" automatically means 3 different stats.
  let clearedCount = 0;
  STATS.forEach(s => {
    const qid = state.dailyRoll[s.id];
    if (!qid) return;
    const prog = state.dailyProgress[qid];
    if (prog && prog.tiersCleared && prog.tiersCleared.some(Boolean)) clearedCount += 1;
  });

  const hadFullRoll = STATS.every(s => !!state.dailyRoll[s.id]);
  if (hadFullRoll && clearedCount < 3) {
    triggerPenalty();
  }

  addLog('reset', 'Daily Quest cycle reset. Cleared ' + clearedCount + '/5 stat quests.');
  rollDailyQuests();
  state.dailyProgress = {};
  state.lastResetISO = cycle;
  saveState();
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
}

function findPoolQuest(questId) {
  for (const sid of Object.keys(state.questPool)) {
    const q = state.questPool[sid].find(q => q.id === questId);
    if (q) return q;
  }
  return null;
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
  state.penaltyQuest = {
    id: 'penalty_' + Date.now(),
    name: 'Penalty Quest: 150 Burpees',
    target: 150,
    unit: 'reps',
    current: 0,
  };
  addLog('penalty', 'PENALTY ZONE triggered — Daily Quest failed.');
}

function clearPenalty() {
  state.penaltyActive = false;
  state.penaltyQuest = null;
  addLog('reset', 'Penalty lifted.');
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

  // player XP
  state.xp += amount;
  let needed = xpNeededForLevel(state.level);
  while (state.xp >= needed) {
    state.xp -= needed;
    state.level += 1;
    state.statPoints += 3;
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
  const grid = el('statGrid');
  grid.innerHTML = '';
  STATS.forEach(s => {
    const data = state.stats[s.id];
    const needed = statXpNeeded(data.level);
    const pct = Math.min(100, (data.xp / needed) * 100);
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-id">${s.id}</span>
      <span class="stat-name">${s.name}</span>
      <span class="stat-level">${data.level}</span>
      <button class="stat-plus" data-stat="${s.id}" ${state.statPoints <= 0 ? 'disabled' : ''}>+</button>
      <div class="stat-mini-bar"><div class="stat-mini-fill" style="width:${pct}%"></div></div>
    `;
    grid.appendChild(row);
  });

  const banner = el('pointsBanner');
  if (state.statPoints > 0) {
    banner.classList.remove('hidden');
    el('pointsCount').textContent = state.statPoints;
  } else {
    banner.classList.add('hidden');
  }

  const title = TITLES.slice().reverse().find(t => state.level >= t.min);
  const rank = RANKS.slice().reverse().find(r => state.level >= r.min);
  el('jobTitle').textContent = title ? title.label : 'Novice';
  el('rankValue').textContent = rank ? rank.label : 'E';

  grid.querySelectorAll('.stat-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.statPoints <= 0) return;
      const sid = btn.dataset.stat;
      state.stats[sid].level += 1;
      state.statPoints -= 1;
      saveState();
      render();
      showToast(sid + ' increased to ' + state.stats[sid].level);
    });
  });
}

function renderQuests() {
  // countdown
  const reset = nextResetTime();
  updateCountdown(reset);

  // ---- mandatory: today's rolled quest, one per stat ----
  const dailyList = el('dailyQuestList');
  dailyList.innerHTML = '';

  let clearedCount = 0;
  STATS.forEach(s => {
    const qid = state.dailyRoll[s.id];
    if (!qid) return;
    const quest = findPoolQuest(qid);
    if (!quest) return;
    const prog = state.dailyProgress[qid] || { current: 0, tierIndex: 0, tiersCleared: [false, false, false, false] };
    if (prog.tiersCleared.some(Boolean)) clearedCount += 1;
    dailyList.appendChild(buildTierQuestCard(quest, prog, 'daily', true));
  });

  el('dailyProgressCount').textContent = clearedCount + ' / 5 cleared · need 3 to avoid penalty';
  el('dailyProgressCount').classList.toggle('warn', clearedCount < 3);
  el('dailyProgressCount').classList.toggle('safe', clearedCount >= 3);

  if (state.penaltyActive && state.penaltyQuest) {
    const pq = state.penaltyQuest;
    const card = buildFlatQuestCard(
      { id: pq.id, name: pq.name, target: pq.target, unit: pq.unit, isPenalty: true },
      { current: pq.current },
      'penalty'
    );
    dailyList.appendChild(card);
  }

  // ---- optional: rest of each stat's pool, not rolled today ----
  const optionalList = el('optionalQuestList');
  optionalList.innerHTML = '';
  STATS.forEach(s => {
    const pool = state.questPool[s.id] || [];
    const rolledId = state.dailyRoll[s.id];
    pool.filter(q => q.id !== rolledId).forEach(quest => {
      const prog = state.dailyProgress[quest.id] || { current: 0, tierIndex: 0, tiersCleared: [false, false, false, false] };
      optionalList.appendChild(buildTierQuestCard(quest, prog, 'daily', false));
    });
  });
  if (optionalList.children.length === 0) {
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

  const card = document.createElement('div');
  card.className = 'quest-card' + (allCleared ? ' complete' : '') + (isMandatory ? ' mandatory' : '');
  const statLabel = quest.stat ? ' · ' + quest.stat : '';
  const badge = isMandatory ? '<span class="mandatory-tag">MANDATORY</span>' : '<span class="optional-tag">optional</span>';

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
      <span class="quest-reward">+${activeTier.xp} XP${statLabel}</span>
    </div>
    <div class="quest-bar"><div class="quest-bar-fill ${fraction >= 1 ? 'full' : (fraction >= 0.75 ? 'partial' : '')}" style="width:${pct}%"></div></div>
    <div class="quest-progress-text">${prog.current || 0} / ${activeTier.target} ${quest.unit || ''} · ${activeTier.label}</div>
  `;
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

function renderPenalty() {
  // Penalty overlay visibility is handled once on init() so it only
  // interrupts the user on app open, not on every render() call.
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
      grantXP(xpAward, quest.stat);
      addLog('quest', 'Completed "' + quest.name + '" (' + tier.label + ')' + (fraction < 1 ? ' partial' : '') + ' +' + xpAward + ' XP');
      showToast('+' + xpAward + ' XP — ' + quest.name + ' (' + tier.label + ')');
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
        grantXP(xpAward, q.stat);
        addLog('quest', 'Completed "' + q.name + '" (' + tier.label + ')' + (fraction < 1 ? ' partial' : '') + ' +' + xpAward + ' XP');
        showToast('+' + xpAward + ' XP — ' + q.name + ' (' + tier.label + ')');
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
  for (let i = 0; i < 4; i++) {
    el('qTierTarget' + i).value = '';
    el('qTierXP' + i).value = '';
  }
  const sel = el('qStat');
  sel.innerHTML = STATS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  el('questModalTitle').textContent = mode === 'daily' ? 'NEW DAILY QUEST' : 'NEW QUEST';
  el('questModal').classList.remove('hidden');
}

function closeQuestModal() { el('questModal').classList.add('hidden'); }

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
    if (!state.questPool[stat]) state.questPool[stat] = [];
    state.questPool[stat].push({ id: 'p_' + stat.toLowerCase() + '_' + Date.now(), name, unit, stat, tiers });
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
          <div>${q.name}${isRolledToday ? ' <span class="rolled-today-tag">today\'s pick</span>' : ''}</div>
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
