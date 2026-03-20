// ── AUTH GUARD ────────────────────────────────────────
const SESSION_ID = localStorage.getItem('rpg_session');
if (!SESSION_ID) { location.href = '/login.html'; throw new Error('not authed'); }

const CURRENT_USER = JSON.parse(localStorage.getItem('rpg_user') || 'null');

function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-session-id': SESSION_ID };
}

async function checkAuth() {
  const res = await fetch('/api/auth/me', { headers: { 'x-session-id': SESSION_ID } }).then(r=>r.json()).catch(()=>({}));
  if (res.error) { location.href = '/login.html'; throw new Error('session expired'); }
  return res.user;
}

function logout() {
  fetch('/api/auth/logout', { method:'POST', headers: authHeaders() });
  localStorage.removeItem('rpg_session');
  localStorage.removeItem('rpg_user');
  location.href = '/login.html';
}
// ─────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════
//  SHEET.JS — lógica da ficha de personagem D&D 5e
// ═══════════════════════════════════════════════════════

const CHAR_ID = new URLSearchParams(location.search).get('id');
if (!CHAR_ID) location.href = '/';

// ── state ─────────────────────────────────────────────────
let char      = null;
let allClasses = [], allRaces = [], allBgs = [], allSpells = [];
let saveTimer  = null;
let curSpell   = null;

// ── constants ─────────────────────────────────────────────
const ABILITIES = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];
const AB_SH = { strength:'FOR', dexterity:'DES', constitution:'CON', intelligence:'INT', wisdom:'SAB', charisma:'CAR' };
const AB_NM = { strength:'Força', dexterity:'Destreza', constitution:'Constituição', intelligence:'Inteligência', wisdom:'Sabedoria', charisma:'Carisma' };

const SKILLS_DEF = [
  {id:'acrobatics',   name:'Acrobacia',        ab:'dexterity'},
  {id:'animal',       name:'Lidar c/Animais',  ab:'wisdom'},
  {id:'arcana',       name:'Arcanismo',         ab:'intelligence'},
  {id:'athletics',    name:'Atletismo',         ab:'strength'},
  {id:'deception',    name:'Enganação',         ab:'charisma'},
  {id:'history',      name:'História',          ab:'intelligence'},
  {id:'insight',      name:'Intuição',          ab:'wisdom'},
  {id:'intimidation', name:'Intimidação',       ab:'charisma'},
  {id:'investigation',name:'Investigação',      ab:'intelligence'},
  {id:'medicine',     name:'Medicina',          ab:'wisdom'},
  {id:'nature',       name:'Natureza',          ab:'intelligence'},
  {id:'perception',   name:'Percepção',         ab:'wisdom'},
  {id:'performance',  name:'Atuação',           ab:'charisma'},
  {id:'persuasion',   name:'Persuasão',         ab:'charisma'},
  {id:'religion',     name:'Religião',          ab:'intelligence'},
  {id:'sleight',      name:'Prestidigitação',   ab:'dexterity'},
  {id:'stealth',      name:'Furtividade',       ab:'dexterity'},
  {id:'survival',     name:'Sobrevivência',     ab:'wisdom'},
];

const CONDITIONS = [
  'Amedrontado','Atordoado','Cego','Dominado','Envenenado','Exaurido',
  'Imobilizado','Incapacitado','Invisível','Paralisado','Petrificado','Surdo',
];

const PROF_BONUS = [0, 2,2,2,2, 3,3,3,3, 4,4,4,4, 5,5,5,5, 6,6,6,6];
const XP_THRESH  = [0, 0,300,900,2700,6500,14000,23000,34000,48000,64000,
  85000,100000,120000,140000,165000,195000,225000,265000,305000,355000];

const g    = id => document.getElementById(id);
const mod  = s  => Math.floor(((s || 10) - 10) / 2);
const mstr = s  => { const m = mod(s); return (m >= 0 ? '+' : '') + m; };

// ── INIT ──────────────────────────────────────────────────
async function init() {
  [allClasses, allRaces, allBgs, allSpells, char] = await Promise.all([
    fetch('/api/data/classes', {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()).then(d => d.classes || []),
    fetch('/api/data/races', {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()).then(d => d.races || []),
    fetch('/api/data/backgrounds', {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()).then(d => d.backgrounds || []),
    fetch('/api/data/spells', {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()).then(d => d.spells || []),
    fetch('/api/characters/' + CHAR_ID, {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()).then(d => d.character),
  ]);

  buildRaceGrid();
  buildClassGrid();
  buildAbilGrid();
  buildSkillGrid();
  buildCondGrid();
  buildDeathSaves();
  buildSavesGrid();
  buildBgSelect();
  populate();
}

// ── POPULATE all fields ───────────────────────────────────
function populate() {
  g('f-name').value    = char.name || '';
  g('f-player').value  = char.player || '';
  g('f-align').value   = char.alignment || '';
  g('f-bg').value      = char.background || '';
  g('f-level').value   = char.level || 1;
  g('f-xp').value      = char.xp || 0;
  g('f-age').value     = char.age || '';
  g('f-height').value  = char.height || '';
  g('f-eyes').value    = char.eyes || '';
  g('f-traits').value  = char.personalityTraits || '';
  g('f-ideals').value  = char.ideals || '';
  g('f-bonds').value   = char.bonds || '';
  g('f-flaws').value   = char.flaws || '';
  g('f-backstory').value = char.backstory || '';
  g('f-notes').value   = char.notes || '';
  g('hp-max').value    = char.maxHp || 0;
  g('hp-cur').value    = char.currentHp || 0;
  g('hp-tmp').value    = char.tempHp || 0;
  g('hd-used').value   = char.hitDiceUsed || 0;
  g('gold').value      = char.gold || 0;
  g('silver').value    = char.silver || 0;
  g('copper').value    = char.copper || 0;
  g('nav-name').textContent = char.name || 'Personagem';

  // highlight selected race/class
  if (char.race)  { document.querySelectorAll('[data-race]').forEach(c  => c.classList.toggle('sel', c.dataset.race  === char.race));  showRaceInfo(char.race); }
  if (char.class) { document.querySelectorAll('[data-class]').forEach(c => c.classList.toggle('sel', c.dataset.class === char.class)); showClassInfo(char.class); }

  recalcDisplay();
  updateAbils();
  updateSkills();
  updateSaves();
  updateHpBar();
  updateSlots();
  updateConditions();
  updateInsp();
  g('exh-val').textContent = char.exhaustion || 0;
  buildInventory();
  buildFeatures();
  buildSpells();
  buildProfDisplay();
}

// ── RECALC display fields ─────────────────────────────────
function recalcDisplay() {
  const level = char.level || 1;
  const pb    = PROF_BONUS[level] || 2;
  char.profBonus = pb;

  // XP bar
  const xpNxt = XP_THRESH[Math.min(level + 1, 20)] || 355000;
  const xpPrv = XP_THRESH[level] || 0;
  const xpCur = char.xp || 0;
  g('f-xpnext').value = xpNxt;
  g('xp-bar').style.width = Math.min(100, ((xpCur - xpPrv) / Math.max(1, xpNxt - xpPrv)) * 100) + '%';
  g('prof-disp').textContent = `Bônus de Proficiência: +${pb} · Nível ${level}`;

  // Combat
  g('c-init').textContent  = mstr(char.scores?.dexterity || 10);
  g('c-prof').textContent  = '+' + pb;
  g('c-ac').value          = char.ac || 10;
  g('c-speed').value       = char.speed || 30;
  g('hitdie-disp').textContent = `${level}${char.hitDie || 'd8'}`;

  // Spell stats
  const cls = allClasses.find(c => c.id === char.class);
  if (cls && cls.spellcasting) {
    const sa  = cls.spellcasting.ability;
    const sm  = mod(char.scores?.[sa] || 10);
    g('sp-abl').textContent = AB_SH[sa] || '';
    g('sp-dc').textContent  = 8 + pb + sm;
    g('sp-atk').textContent = '+' + (pb + sm);
    g('spell-content').style.display = '';
    g('no-spell-msg').style.display  = 'none';
  } else {
    g('spell-content').style.display = 'none';
    g('no-spell-msg').style.display  = '';
  }

  // Passive perception
  const pp = (char.skillProfs || []).includes('perception');
  const pe = (char.skillExpertise || []).includes('perception');
  g('pass-perc').textContent = 10 + mod(char.scores?.wisdom || 10) + (pe ? pb * 2 : pp ? pb : 0);

  // Carry weight
  const tw  = (char.inventory || []).reduce((a, i) => a + (i.weight || 0), 0);
  const cap = (char.scores?.strength || 10) * 7.5;
  g('carry-weight').textContent = tw.toFixed(1) + ' kg';
  g('carry-cap').textContent    = cap.toFixed(1);
}

// ── ABILITY GRID ──────────────────────────────────────────
function buildAbilGrid() {
  g('abil-grid').innerHTML = ABILITIES.map(a => `
    <div class="abil-box">
      <div class="abil-short">${AB_SH[a]}</div>
      <div class="abil-name">${AB_NM[a]}</div>
      <input class="abil-inp" type="number" min="1" max="30" id="sc-${a}"
        value="${(char.scores || {})[a] || 10}" oninput="setScore('${a}',+this.value)">
      <div class="abil-mod" id="mod-${a}">${mstr((char.scores || {})[a] || 10)}</div>
      <div class="abil-save" id="sv-${a}" onclick="toggleSave('${a}')">— SAL</div>
    </div>`).join('');
}

function updateAbils() {
  ABILITIES.forEach(a => {
    const sc  = (char.scores || {})[a] || 10;
    const inp = g('sc-' + a);  if (inp) inp.value = sc;
    const md  = g('mod-' + a); if (md)  md.textContent = mstr(sc);
  });
  updateSaves();
}

function setScore(ab, val) {
  if (!char.scores) char.scores = {};
  char.scores[ab] = Math.max(1, Math.min(30, val));
  g('mod-' + ab).textContent = mstr(char.scores[ab]);
  recalcDisplay();
  updateSkills();
  updateSaves();
  sched();
}

// ── SAVING THROWS ─────────────────────────────────────────
function buildSavesGrid() {
  g('saves-grid').innerHTML = ABILITIES.map(a => `
    <div class="stat-box" style="cursor:pointer" onclick="toggleSave('${a}')">
      <label>${AB_SH[a]}</label>
      <div class="stat-val" id="sv-val-${a}" style="font-size:17px">+0</div>
      <div id="sv-lbl-${a}" style="font-size:9px;color:var(--cream4)">—</div>
    </div>`).join('');
}

function updateSaves() {
  const pb = char.profBonus || 2;
  ABILITIES.forEach(a => {
    const isP = (char.savingThrows || []).includes(a);
    const m   = mod((char.scores || {})[a] || 10);
    const tot = m + (isP ? pb : 0);
    const ve  = g('sv-val-' + a);
    const le  = g('sv-lbl-' + a);
    if (ve) { ve.textContent = (tot >= 0 ? '+' : '') + tot; ve.style.color = isP ? 'var(--gold)' : 'var(--text)'; }
    if (le) le.textContent = isP ? '● Prof' : '—';
    // inline label on ability box
    const se = g('sv-' + a);
    if (se) { se.textContent = (isP ? '● ' : '— ') + 'SAL ' + (tot >= 0 ? '+' : '') + tot; se.className = 'abil-save' + (isP ? ' prof' : ''); }
  });
}

function toggleSave(ab) {
  if (!char.savingThrows) char.savingThrows = [];
  char.savingThrows = char.savingThrows.includes(ab)
    ? char.savingThrows.filter(x => x !== ab)
    : [...char.savingThrows, ab];
  updateSaves();
  sched();
}

// ── SKILLS ────────────────────────────────────────────────
function buildSkillGrid() {
  g('skill-grid').innerHTML = SKILLS_DEF.map(s => `
    <div class="sk-row" id="sk-${s.id}" onclick="toggleSkill('${s.id}')">
      <div class="sk-dot" id="skd-${s.id}"></div>
      <span class="sk-name">${s.name}</span>
      <span class="sk-abl">${AB_SH[s.ab]}</span>
      <span class="sk-bon" id="skb-${s.id}">+0</span>
    </div>`).join('');
}

function updateSkills() {
  const pb = char.profBonus || 2;
  SKILLS_DEF.forEach(s => {
    const isP = (char.skillProfs     || []).includes(s.id);
    const isE = (char.skillExpertise || []).includes(s.id);
    const m   = mod((char.scores || {})[s.ab] || 10);
    const bon = m + (isE ? pb * 2 : isP ? pb : 0);
    const row = g('sk-' + s.id);  if (row) row.className = 'sk-row' + (isE ? ' exp' : isP ? ' prof' : '');
    const dot = g('skd-' + s.id); if (dot) { dot.className = 'sk-dot' + (isE ? ' exp' : isP ? ' on' : ''); dot.textContent = isE ? '◆' : isP ? '●' : ''; }
    const bn  = g('skb-' + s.id); if (bn)  bn.textContent = (bon >= 0 ? '+' : '') + bon;
  });
  recalcDisplay();
}

function toggleSkill(id) {
  if (!char.skillProfs)     char.skillProfs     = [];
  if (!char.skillExpertise) char.skillExpertise = [];
  if (char.skillExpertise.includes(id)) {
    char.skillExpertise = char.skillExpertise.filter(x => x !== id);
    char.skillProfs     = char.skillProfs.filter(x => x !== id);
  } else if (char.skillProfs.includes(id)) {
    char.skillExpertise.push(id);
  } else {
    char.skillProfs.push(id);
  }
  updateSkills();
  sched();
}

// ── CONDITIONS ────────────────────────────────────────────
function buildCondGrid() {
  g('cond-grid').innerHTML = CONDITIONS.map(c =>
    `<div class="cond-tag" id="cond-${c}" onclick="toggleCond('${c}')">${c}</div>`
  ).join('');
}

function updateConditions() {
  CONDITIONS.forEach(c => {
    const el = g('cond-' + c);
    if (el) el.classList.toggle('on', (char.conditions || []).includes(c));
  });
}

function toggleCond(c) {
  char.conditions = char.conditions || [];
  char.conditions = char.conditions.includes(c)
    ? char.conditions.filter(x => x !== c)
    : [...char.conditions, c];
  updateConditions();
  sched();
}

function chgExh(d) {
  char.exhaustion = Math.max(0, Math.min(6, (char.exhaustion || 0) + d));
  g('exh-val').textContent = char.exhaustion;
  sched();
}

// ── DEATH SAVES ───────────────────────────────────────────
function buildDeathSaves() {
  ['succ', 'fail'].forEach(t => {
    g('ds-' + t).innerHTML = [0, 1, 2].map(i =>
      `<div class="ds-pip ${t === 'succ' ? 'succ' : 'fail'}" id="dsp-${t}-${i}" onclick="togDS('${t}',${i})"></div>`
    ).join('');
  });
}

function togDS(type, idx) {
  const k = type === 'succ' ? 'success' : 'failure';
  if (!char.deathSaves) char.deathSaves = { success: 0, failure: 0 };
  char.deathSaves[k] = char.deathSaves[k] === idx + 1 ? idx : idx + 1;
  for (let i = 0; i < 3; i++) {
    const el = g(`dsp-${type}-${i}`);
    if (el) el.classList.toggle('on', i < char.deathSaves[k]);
  }
  sched();
}

// ── INSPIRATION ───────────────────────────────────────────
function updateInsp() {
  g('insp-box').classList.toggle('on', !!char.inspiration);
  g('insp-star').textContent = char.inspiration ? '★' : '☆';
}
function toggleInsp() { char.inspiration = !char.inspiration; updateInsp(); sched(); }

// ── HP ────────────────────────────────────────────────────
function updateHpBar() {
  const max = char.maxHp || 1;
  const cur = char.currentHp || 0;
  g('hp-bar').style.width = Math.max(0, Math.min(100, cur / max * 100)) + '%';
}

// ── RACE ──────────────────────────────────────────────────
function buildRaceGrid() {
  g('race-grid').innerHTML = allRaces.map(r => `
    <div class="pick-card" data-race="${r.id}" onclick="selectRace('${r.id}')">
      <div class="pick-name">${r.name}</div>
      <div class="pick-sub">${Object.entries(r.abilityBonus || {}).map(([a, v]) => AB_SH[a] + '+' + v).join(' ')}</div>
    </div>`).join('');
}

async function selectRace(id) {
  char.race = id;
  document.querySelectorAll('[data-race]').forEach(c => c.classList.toggle('sel', c.dataset.race === id));
  const res = await fetch(`/api/characters/${CHAR_ID}/race`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ race: id }),
  }).then(r => r.json());
  char = { ...char, ...res.character };
  showRaceInfo(id);
  updateAbils();
  recalcDisplay();
  updateSlots();
  buildSpells();
  buildFeatures();
  // Update combat fields
  g('c-ac').value   = char.ac    || 10;
  g('c-speed').value= char.speed || 30;
  g('hp-max').value = char.maxHp || 0;
  g('hp-cur').value = char.currentHp || 0;
  updateHpBar();
  g('save-st').textContent = '';
}

function showRaceInfo(id) {
  const race = allRaces.find(r => r.id === id);
  if (!race) return;
  const bonuses = Object.entries(race.abilityBonus || {}).map(([a, v]) => `${AB_NM[a]} +${v}`).join(', ');
  const html = `
    <div style="font-size:11px;color:var(--cream3);margin-bottom:8px">${race.desc || ''}</div>
    <div style="margin-bottom:8px">
      <span class="badge">Velocidade ${race.speed}m</span>
      <span class="badge">Tamanho ${race.size}</span>
      ${bonuses ? `<span class="badge">Bônus: ${bonuses}</span>` : ''}
    </div>
    ${(race.traits || []).map(t => `
      <div class="trait-item">
        <div class="trait-name">${t.name}</div>
        <div class="trait-desc">${t.desc}</div>
      </div>`).join('')}
    <div style="margin-top:6px;font-size:11px;color:var(--cream3)">
      <b style="color:var(--gold)">Idiomas:</b> ${(race.languages || []).join(', ')}
    </div>`;
  g('race-info').innerHTML = html;
  g('race-traits-feat').innerHTML = html;
}

// ── CLASS ─────────────────────────────────────────────────
function buildClassGrid() {
  g('class-grid').innerHTML = allClasses.map(c => `
    <div class="pick-card" data-class="${c.id}" onclick="selectClass('${c.id}')">
      <div style="font-size:22px">${c.icon}</div>
      <div class="pick-name">${c.name}</div>
      <div class="pick-sub">d${c.hitDie} · ${c.spellcasting ? 'Conjurador' : 'Marcial'}</div>
    </div>`).join('');
}

async function selectClass(id) {
  char.class = id;
  document.querySelectorAll('[data-class]').forEach(c => c.classList.toggle('sel', c.dataset.class === id));
  const res = await fetch(`/api/characters/${CHAR_ID}/class`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ class: id }),
  }).then(r => r.json());
  char = { ...char, ...res.character };
  showClassInfo(id);
  recalcDisplay();
  updateAbils();
  updateSaves();
  updateSlots();
  buildSpells();
  buildFeatures();
  buildProfDisplay();
  // Update combat fields
  g('c-ac').value    = char.ac    || 10;
  g('c-speed').value = char.speed || 30;
  g('hp-max').value  = char.maxHp || 0;
  g('hp-cur').value  = char.currentHp || 0;
  g('hitdie-disp').textContent = `${char.level||1}${char.hitDie||'d8'}`;
  updateHpBar();
  g('save-st').textContent = '';
}

function showClassInfo(id) {
  const cls = allClasses.find(c => c.id === id);
  if (!cls) return;
  g('class-info').innerHTML = `
    <div style="font-size:11px;color:var(--cream3);margin-bottom:8px">${cls.desc || ''}</div>
    <div>
      ${(cls.savingThrows || []).map(s => `<span class="badge">${AB_SH[s]} Save</span>`).join('')}
      ${cls.spellcasting ? `<span class="badge">${AB_SH[cls.spellcasting.ability]} Conjuração</span>` : ''}
      <span class="badge">d${cls.hitDie} HP</span>
    </div>`;
}

// ── BACKGROUNDS ───────────────────────────────────────────
function buildBgSelect() {
  const sel = g('f-bg');
  sel.innerHTML = '<option value="">— Escolha —</option>';
  allBgs.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id; o.textContent = b.name;
    sel.appendChild(o);
  });
  if (char.background) sel.value = char.background;
}

async function selectBg(id) {
  char.background = id;
  await fetch(`/api/characters/${CHAR_ID}/background`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ background: id }),
  });
  sched();
}

// ── PROF DISPLAY ──────────────────────────────────────────
function buildProfDisplay() {
  const render = (id, items) => {
    const el = g(id);
    if (!el) return;
    el.innerHTML = (items || []).length
      ? items.map(p => `<span class="small-badge">${p}</span>`).join('')
      : '<span style="color:var(--cream4);font-size:11px">Nenhuma</span>';
  };
  render('armor-profs',  char.armorProfs);
  render('weapon-profs', char.weaponProfs);
  render('lang-profs',   char.languages);
}

// ── SPELL SLOTS ───────────────────────────────────────────
function updateSlots() {
  const sg  = g('slots-grid');
  if (!sg)  return;
  const max  = char.spellSlots?.max  || [0,0,0,0,0,0,0,0,0];
  const used = char.spellSlots?.used || [0,0,0,0,0,0,0,0,0];

  sg.innerHTML = max.map((mx, i) => {
    if (!mx) return `<div class="slot-col"><div class="slot-lbl">Nv${i+1}</div><div style="font-size:9px;color:var(--cream4)">—</div></div>`;
    const av   = mx - (used[i] || 0);
    const pips = Array.from({ length: mx }, (_, j) =>
      `<div class="pip ${j < av ? 'avail' : 'used'}" onclick="toggleSlotPip(${i},${j})"
        title="Nível ${i+1}: ${j < av ? 'disponível' : 'usado'}"></div>`
    ).join('');
    return `<div class="slot-col"><div class="slot-lbl">Nv${i+1}</div><div class="slot-count">${av}/${mx}</div><div class="slot-pips">${pips}</div></div>`;
  }).join('');
}

async function toggleSlotPip(levelIdx, pipIdx) {
  const max  = char.spellSlots?.max?.[levelIdx]  || 0;
  const used = char.spellSlots?.used?.[levelIdx] || 0;
  const action = pipIdx < (max - used) ? 'use' : 'restore';
  const res = await fetch(`/api/characters/${CHAR_ID}/slot`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ level: levelIdx + 1, action }),
  }).then(r => r.json());
  if (res.ok) { char.spellSlots = res.character.spellSlots; updateSlots(); }
  else toast(res.message || 'Sem espaços disponíveis.');
}

// ── SPELL LIST ────────────────────────────────────────────
function buildSpells() {
  const sl  = g('spell-list');
  if (!sl)  return;
  const cls = allClasses.find(c => c.id === char.class);
  if (!cls || !cls.spellcasting) { sl.innerHTML = ''; return; }

  // highest available spell level
  const max = char.spellSlots?.max || [0,0,0,0,0,0,0,0,0];
  let maxLv = 0;
  for (let i = 8; i >= 0; i--) if (max[i] > 0) { maxLv = i + 1; break; }

  const available = allSpells.filter(s => (s.classes || []).includes(char.class) && s.level <= maxLv);
  const known     = char.spells?.known    || [];
  const prepared  = char.spells?.prepared || [];

  // group by level
  const byLv = {};
  available.forEach(s => { (byLv[s.level] = byLv[s.level] || []).push(s); });

  sl.innerHTML = Object.entries(byLv).sort(([a], [b]) => +a - +b).map(([lv, spells]) => {
    const lvi     = parseInt(lv);
    const slotMax = lvi > 0 ? (char.spellSlots?.max?.[lvi - 1]  || 0) : null;
    const slotUsed= lvi > 0 ? (char.spellSlots?.used?.[lvi - 1] || 0) : null;
    const slotInfo= slotMax !== null
      ? `<span class="spell-slot-info">${slotMax - (slotUsed || 0)}/${slotMax} espaços</span>`
      : '';

    return `
      <div class="spell-group">
        <div class="spell-lvl-hdr">
          ${lvi === 0 ? 'Truques (Nível 0 — Ilimitados)' : `Nível ${lvi}`}
          ${slotInfo}
        </div>
        ${spells.map(s => {
          const isK = known.includes(s.id);
          const isP = prepared.includes(s.id);
          const tag = isP
            ? '<span style="color:var(--gold);font-size:9px;margin-left:5px">★ Preparada</span>'
            : isK ? '<span style="color:var(--cream4);font-size:9px;margin-left:5px">◇ Conhecida</span>' : '';
          return `
            <div class="spell-row${isP || isK ? ' sel' : ''}" data-id="${s.id}" data-level="${lvi}">
              <div class="spell-chk${isP || isK ? ' on' : ''}" onclick="toggleSpell('${s.id}')"></div>
              <div>
                <div class="spell-sname">${s.name}${tag}</div>
                <div class="spell-meta">${s.school} · ${s.castTime} · ${s.range} · ${s.duration}</div>
              </div>
              <button class="spell-info-btn" onclick="showSpell('${s.id}')">Info</button>
              ${lvi > 0
                ? `<button class="spell-use-btn" onclick="useSpell(${lvi},'${s.id}')">Usar</button>`
                : '<span style="font-size:10px;color:var(--cream4);padding:0 6px">∞</span>'}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function filterSpells() {
  const search = (document.getElementById('spell-search')?.value || '').toLowerCase();
  const lvlF   = document.getElementById('spell-lvl-filter')?.value;
  const stateF = document.getElementById('spell-state-filter')?.value;
  const known    = char.spells?.known    || [];
  const prepared = char.spells?.prepared || [];

  document.querySelectorAll('.spell-row').forEach(row => {
    const name  = (row.querySelector('.spell-sname')?.textContent || '').toLowerCase();
    const meta  = (row.querySelector('.spell-meta')?.textContent  || '').toLowerCase();
    const lvl   = row.dataset.level || '';
    const id    = row.dataset.id    || '';
    const isP   = prepared.includes(id);
    const isK   = known.includes(id);

    const matchSearch = !search || name.includes(search) || meta.includes(search);
    const matchLvl    = !lvlF   || lvl === lvlF;
    const matchState  = !stateF
      || (stateF === 'prepared' && isP)
      || (stateF === 'known'    && isK && !isP)
      || (stateF === 'none'     && !isK && !isP);

    row.style.display = (matchSearch && matchLvl && matchState) ? '' : 'none';
  });

  // Hide empty groups
  document.querySelectorAll('.spell-group').forEach(group => {
    const visible = [...group.querySelectorAll('.spell-row')].some(r => r.style.display !== 'none');
    group.style.display = visible ? '' : 'none';
  });
}

function toggleSpell(id) {
  if (!char.spells) char.spells = { known: [], prepared: [] };
  if (char.spells.prepared.includes(id)) {
    char.spells.prepared = char.spells.prepared.filter(x => x !== id);
    char.spells.known    = char.spells.known.filter(x => x !== id);
  } else if (char.spells.known.includes(id)) {
    char.spells.prepared.push(id);
  } else {
    char.spells.known.push(id);
  }
  buildSpells();
  sched();
}

function useSpell(lvl, id) {
  // fire-and-forget: toggle lowest available pip
  const idx = lvl - 1;
  const av  = (char.spellSlots?.max?.[idx] || 0) - (char.spellSlots?.used?.[idx] || 0);
  if (av > 0) toggleSlotPip(idx, char.spellSlots.max[idx] - av);
  const s = allSpells.find(x => x.id === id);
  toast(`✨ ${s?.name || 'Magia'} lançada — espaço nv${lvl} usado.`);
}

function showSpell(id) {
  const s = allSpells.find(x => x.id === id);
  if (!s) return;
  curSpell = s;
  g('sm-title').textContent = s.name;
  g('sm-meta').innerHTML = `
    <b>${s.school}</b> · Nível ${s.level === 0 ? '0 (Truque)' : s.level}<br>
    Tempo: ${s.castTime} · Alcance: ${s.range} · Duração: ${s.duration}<br>
    Componentes: ${s.components}<br>
    <i>Classes: ${(s.classes || []).join(', ')}</i>`;
  g('sm-desc').textContent   = s.desc || '';
  g('sm-use').style.display  = s.level > 0 ? '' : 'none';
  g('spell-modal').classList.add('show');
}

function useSMSpell() {
  if (curSpell && curSpell.level > 0) useSpell(curSpell.level, curSpell.id);
  closeSM();
}
function closeSM() { g('spell-modal').classList.remove('show'); curSpell = null; }

// ── FEATURES ──────────────────────────────────────────────
async function buildFeatures() {
  const fl = g('feat-list');
  if (!fl || !char.class) return;

  const res = await fetch(`/api/data/features?class=${char.class}&level=${char.level || 1}`, {headers:{'x-session-id':SESSION_ID}}).then(r => r.json());
  fl.innerHTML = (res.features || []).map(f => `
    <div class="feat-item">
      <span class="feat-lvl">Nv. ${f.atLevel}</span>
      <div class="feat-name">${f.name}</div>
      <div class="feat-desc">${f.desc}</div>
    </div>`).join('') || '<div style="color:var(--cream4);font-size:12px">Sem habilidades para este nível.</div>';

  // class table
  const clsRes = await fetch(`/api/data/classes/${char.class}`, {headers:{'x-session-id':SESSION_ID}}).then(r => r.json());
  const cls    = clsRes.cls;
  if (cls?.classTable) {
    const PB = [0,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6];
    const cols = Object.keys(cls.classTable[0]).filter(k => k !== 'level' && k !== 'features');
    const hdr  = { profBonus:'Prof', rages:'Fúrias', rageDmg:'Dano', slots:'Espaços' };
    g('cls-table-wrap').innerHTML = `
      <table class="cls-table">
        <thead>
          <tr>
            <th>Nv</th>
            ${cols.map(c => `<th>${hdr[c] || c}</th>`).join('')}
            <th>Habilidades</th>
          </tr>
        </thead>
        <tbody>
          ${cls.classTable.map(row => `
            <tr class="${row.level === char.level ? 'cur' : ''}">
              <td>${row.level}</td>
              ${cols.map(c => `<td>${row[c] || '—'}</td>`).join('')}
              <td style="color:var(--cream3)">${row.features || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } else {
    // Generic table from features
    const PB = [0,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6];
    g('cls-table-wrap').innerHTML = `
      <table class="cls-table">
        <thead><tr><th>Nv</th><th>Prof</th><th>Habilidades</th></tr></thead>
        <tbody>
          ${Array.from({length:20},(_,i)=>i+1).map(l => {
            const feats = cls?.features?.[l] || [];
            return `<tr class="${l === char.level ? 'cur' : ''}">
              <td>${l}</td><td>+${PB[l]}</td>
              <td style="color:var(--cream3)">${feats.map(f => f.name).join(', ') || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
}

// ── REST ──────────────────────────────────────────────────
async function doRest(type) {
  const res = await fetch(`/api/characters/${CHAR_ID}/rest`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ type }),
  }).then(r => r.json());
  char = { ...char, ...res.character };
  populate();
  toast(res.message || 'Descansado!');
}

// ── LEVEL UP ──────────────────────────────────────────────
async function levelUp() {
  if ((char.level || 1) >= 20) { toast('Nível máximo (20) atingido!'); return; }
  const res = await fetch(`/api/characters/${CHAR_ID}/levelup`, {
    method: 'POST', headers: authHeaders(), body: '{}',
  }).then(r => r.json());
  char = { ...char, ...res.character };
  populate();
  const nf = res.newFeatures || [];
  toast(`⬆ Nível ${char.level}!${nf.length ? ' Novas: ' + nf.map(f => f.name).join(', ') : ''}`, 5000);
}

// ── INVENTORY ─────────────────────────────────────────────
function buildInventory() {
  const tb = g('inv-body');
  if (!tb) return;
  const items = char.inventory || [];
  tb.innerHTML = items.length
    ? items.map((it, i) => `
        <tr>
          <td>${it.name || ''}</td>
          <td style="color:var(--cream4)">${it.type || ''}</td>
          <td style="color:var(--cream4)">${it.weight || 0}kg</td>
          <td style="color:var(--cream3)">${it.notes || ''}</td>
          <td><button class="del-btn" onclick="delItem(${i})">✕</button></td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="color:var(--cream4);font-style:italic;padding:10px">Inventário vazio.</td></tr>`;
}

function addItem() {
  const name = g('ai-name').value.trim();
  if (!name) return;
  if (!char.inventory) char.inventory = [];
  char.inventory.push({
    name,
    type:   g('ai-type').value || 'item',
    weight: parseFloat(g('ai-wt').value) || 0,
    notes:  g('ai-note').value || '',
  });
  g('ai-name').value = ''; g('ai-type').value = ''; g('ai-wt').value = ''; g('ai-note').value = '';
  buildInventory();
  recalcDisplay();
  sched();
}

function delItem(idx) {
  char.inventory.splice(idx, 1);
  buildInventory();
  recalcDisplay();
  sched();
}

// ── TABS ──────────────────────────────────────────────────
function showTab(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t  => t.classList.remove('active'));
  g('page-' + name).classList.add('active');
  el.classList.add('active');
  if (name === 'features')  buildFeatures();
  if (name === 'skills')    { buildProfDisplay(); updateSkills(); }
  if (name === 'spells')    { buildSpells(); updateSlots(); }
  if (name === 'inventory') { buildInventory(); recalcDisplay(); }
  if (name === 'combat')    { updateHpBar(); updateConditions(); }
  if (name === 'notes')     buildQuickRef();
}

// ── SAVE ──────────────────────────────────────────────────
function setF(key, val) { char[key] = val; sched(); }
function setLevel(val)  { char.level = Math.max(1, Math.min(20, val)); recalcDisplay(); updateSlots(); buildClassFeatures(); sched(); }
function updateXpBar()  { recalcDisplay(); }

function buildClassFeatures() {
  if (char.class) buildFeatures();
}

function sched() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1800);
  g('save-st').textContent = 'Não salvo...';
}

async function save() {
  if (!char) return;
  clearTimeout(saveTimer);
  await fetch('/api/characters/' + CHAR_ID, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(char),
  });
  g('save-st').textContent = '✓ Salvo';
  setTimeout(() => g('save-st').textContent = '', 2500);
}

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, dur = 3000) {
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

// ── QUICK HP ADJUST ──────────────────────────────────────
function adjustHP(direction) {
  const amt = parseInt(document.getElementById('hp-adj')?.value) || 0;
  if (!amt) return;
  const max  = char.maxHp || 0;
  let   cur  = char.currentHp || 0;
  const temp = char.tempHp || 0;

  if (direction < 0) {
    // Damage: absorb temp HP first
    let dmg = amt;
    if (temp > 0) {
      const absorbed = Math.min(temp, dmg);
      char.tempHp    = temp - absorbed;
      dmg            -= absorbed;
      g('hp-tmp').value = char.tempHp;
    }
    cur = Math.max(0, cur - dmg);
  } else {
    // Heal: cannot exceed max
    cur = Math.min(max, cur + amt);
  }

  char.currentHp = cur;
  g('hp-cur').value = cur;
  updateHpBar();

  // Flash feedback
  const el = g('hp-cur');
  el.style.color = direction < 0 ? 'var(--scarlet3)' : 'var(--moss3)';
  setTimeout(() => el.style.color = '', 600);
  sched();
}

// ── DICE ROLLER ───────────────────────────────────────────
function rollDie(sides) {
  const result = Math.floor(Math.random() * sides) + 1;
  const el = g('dice-result');
  if (!el) return;
  el.textContent = result;
  el.style.transform = 'scale(1.4)';
  setTimeout(() => el.style.transform = 'scale(1)', 150);
  // Color: 1 = red, max = gold, rest = normal
  if (result === 1)     el.style.color = 'var(--scarlet3)';
  else if (result === sides) el.style.color = 'var(--amber3)';
  else                  el.style.color = 'var(--amber2)';
}

// ── QUICK REFERENCE ──────────────────────────────────────
function buildQuickRef() {
  const el = g('quick-ref');
  if (!el || !char.class) return;
  const pb  = char.profBonus || 2;
  const cls = allClasses.find(c => c.id === char.class);
  const rows = [
    ['Proficiência',   '+' + pb],
    ['Iniciativa',     mstr(char.scores?.dexterity || 10)],
    ['Percepção Pas.', String(10 + mod(char.scores?.wisdom || 10) + ((char.skillProfs||[]).includes('perception') ? pb : 0))],
    ['Vel. Movimento', (char.speed || 30) + 'm'],
    ['Dado de Vida',   `${char.level||1}${char.hitDie||'d8'}`],
  ];
  if (cls?.spellcasting) {
    rows.push(['CD de Magia',    String(char.spellSaveDC  || 0)]);
    rows.push(['Bônus Ataque ✦', '+' + (char.spellAtkBonus || 0)]);
  }
  // Saving throw proficiencies
  const saves = (char.savingThrows || []).map(s => AB_SH[s]).join(', ');
  if (saves) rows.push(['Saves proficientes', saves]);

  el.innerHTML = rows.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--stone-700);padding:3px 0">
       <span style="color:var(--cream4);font-family:'Cinzel',serif;font-size:10px">${k}</span>
       <span style="color:var(--amber2);font-family:'Cinzel',serif;font-weight:700">${v}</span>
     </div>`
  ).join('');
}

function addSessionEntry() {
  const area = g('f-notes');
  if (!area) return;
  const now  = new Date().toLocaleDateString('pt-BR');
  const sep  = `\n\n─── Sessão ${now} ───\n`;
  area.value = (area.value || '') + sep;
  char.notes  = area.value;
  area.scrollTop = area.scrollHeight;
  area.focus();
  sched();
}

// ── BOOT ──────────────────────────────────────────────────
init();
