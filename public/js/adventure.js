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
//  ADVENTURE.JS — lógica da aventura narrada
// ═══════════════════════════════════════════════════════

const CAMP_ID = new URLSearchParams(location.search).get('id');
if (!CAMP_ID) location.href = '/';

let camp    = null;
let sending = false;

const AB = { strength:'FOR', dexterity:'DES', constitution:'CON', intelligence:'INT', wisdom:'SAB', charisma:'CAR' };

// Act names and goals — mirrors campaign.js
const ACT_DATA = {
  1:  { name:'O Chamado',        goal:'Investigar os desaparecimentos no Bairro do Cais' },
  2:  { name:'A Conspiração',    goal:'Infiltrar a Guilda do Xanathar e encontrar o Tesouro do Dragão' },
  3:  { name:'O Confronto Final',goal:'Recuperar o tesouro e decidir o destino de Waterdeep' },
  4:  { name:'Ecos do Abismo',   goal:'Fechar o portal demoníaco nos esgotos da cidade' },
  5:  { name:'O Dragão Despertado',goal:'Descer a Undermountain e destruir o dracolich' },
  6:  { name:'Sombras do Norte',  goal:'Investigar a ameaça que se aproxima de Neverwinter' },
  7:  { name:'O Culto Oculto',    goal:'Desmantelar o culto de Asmodeus dentro da nobreza' },
  8:  { name:'A Teia Planar',     goal:'Viajar ao Limbo para recuperar o Orbe dos Sonhos' },
  9:  { name:'Ascensão',          goal:'Reunir os fragmentos do Escudo de Waterdeep' },
  10: { name:'O Destino da Cidade',goal:'Enfrentar a ameaça final e decidir o futuro de Faerûn' },
};

const g = id => document.getElementById(id);

// ── INIT ──────────────────────────────────────────────────
async function init() {
  const res = await fetch('/api/campaigns/' + CAMP_ID,
    {headers:{'x-session-id':SESSION_ID}}).then(r => r.json());
  if (res.error === 'Não autenticado.') { location.href = '/login.html'; return; }
  camp = res.campaign;
  if (!camp) { alert('Campanha não encontrada.'); location.href = '/'; return; }

  updateCharPanel();
  updateActIndicator();
  updateStoryProgress();
  renderLog();

  g('action-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAction(); }
  });
}

// ── UPDATE PANELS ─────────────────────────────────────────
function updateCharPanel() {
  const ch  = camp.char;
  const cls = ch.class ? (ch.class.charAt(0).toUpperCase() + ch.class.slice(1)) : '?';

  g('cp-name').textContent = ch.name || '—';
  g('cp-sub').textContent  = `${ch.race || '?'} ${cls} Nv.${ch.level || 1}`;
  g('cp-loc').textContent  = '📍�� ' + (ch.location || 'Waterdeep');
  g('cp-hp').textContent   = `${ch.currentHp || 0} / ${ch.maxHp || 0}`;
  g('cp-hp-bar').style.width = Math.max(0, Math.min(100,
    ((ch.currentHp || 0) / (ch.maxHp || 1)) * 100
  )) + '%';

  // nav stats
  const hpEl = g('stat-hp');
  hpEl.innerHTML = `HP <span id="nav-hp">${ch.currentHp || 0}/${ch.maxHp || 0}</span>`;
  if ((ch.currentHp || 0) < (ch.maxHp || 1) * 0.3) hpEl.classList.add('hp-warn');
  else hpEl.classList.remove('hp-warn');
  g('nav-ac').textContent  = ch.ac || '—';
  g('nav-day').textContent = camp.day || 1;

  // ability mods grid
  const scores = ch.scores || {};
  g('cp-stats').innerHTML = Object.entries(AB).map(([key, abbr]) => {
    const sc = scores[key] || 10;
    const m  = Math.floor((sc - 10) / 2);
    return `<div class="stat-box"><div class="sl">${abbr}</div><div class="sv">${m >= 0 ? '+' : ''}${m}</div></div>`;
  }).join('');

  // spell slots
  const max  = ch.spellSlots?.max  || [];
  const used = ch.spellSlots?.used || [];
  const hasSpells = max.some(x => x > 0);

  if (!hasSpells) {
    g('cp-slots').innerHTML = '<div style="font-size:11px;color:var(--cream4)">Sem conjuração</div>';
    g('spell-use-section').style.display = 'none';
  } else {
    g('cp-slots').innerHTML = max.map((mx, i) => {
      if (!mx) return '';
      const av   = mx - (used[i] || 0);
      const pips = Array.from({ length: mx }, (_, j) =>
        `<div class="spip ${j < av ? 'av' : ''}"></div>`
      ).join('');
      return `<div class="slot-row">
        <span class="slot-lbl">Nv${i+1}</span>
        <div class="slot-pips">${pips}</div>
        <span style="font-size:9px;color:var(--cream4);margin-left:3px">${av}/${mx}</span>
      </div>`;
    }).filter(Boolean).join('');

    g('spell-use-section').style.display = '';
    g('slot-btns').innerHTML = max.map((mx, i) => {
      if (!mx) return '';
      const av = mx - (used[i] || 0);
      return `<button class="slot-btn" onclick="useSlotAction(${i+1})" ${!av ? 'disabled' : ''}>
        [Nv${i+1}] ${av}/${mx} disponíveis
      </button>`;
    }).filter(Boolean).join('');
  }
}

function updateActIndicator() {
  const totalActs = Object.keys(ACT_DATA).length;
  g('act-indicator').innerHTML = [1, 2, 3].map(n => {
    const cls = n < camp.act ? 'done' : n === camp.act ? 'active' : '';
    return `<div class="act-pip ${cls}" title="${ACT_DATA[n]?.name || ''}">A${n}</div>`;
  }).join('');

  const act = ACT_DATA[camp.act] || ACT_DATA[1];
  g('story-act').textContent = `Ato ${camp.act}/${totalActs} — ${act.name} · ${act.goal}`;
}

function updateStoryProgress() {
  const totalActs = Object.keys(ACT_DATA).length;
  // Show first 5 acts in sidebar
  const showActs = [1, 2, 3, 4, 5];
  g('story-progress').innerHTML = showActs.map(n => {
    const act   = ACT_DATA[n];
    const state = n < camp.act ? 'done' : n === camp.act ? 'active' : 'future';
    return `<div class="prog-step">
      <div class="prog-dot ${state}"></div>
      <div class="prog-txt">
        <span class="prog-act">ATO ${n}</span>
        ${act?.name || ''}
      </div>
    </div>`;
  }).join('') + (camp.act > 5 ? `<div style="font-size:9px;color:var(--cream4);padding:4px 0">... ato ${camp.act} em andamento</div>` : '');

  const sumEl = g('sp-summary');
  if (camp.summary) sumEl.textContent = camp.summary.split('\n').slice(-5).join('\n');
  else sumEl.innerHTML = '<span class="sp-empty">Sua história ainda está começando...</span>';

  g('sp-location').textContent = camp.char?.location || 'Waterdeep';
}

// ── RENDER LOG ────────────────────────────────────────────
function renderLog() {
  const log = g('chat-log');
  log.innerHTML = '';
  (camp.log || []).forEach(entry => {
    if (entry.role === 'narrator') appendNarrator(entry.text, false);
    else if (entry.role === 'player') appendPlayer(entry.text, false);
    else if (entry.role === 'system') appendSystem(entry.text, false);
  });
  scrollDown();
}

function appendNarrator(text, animate = true) {
  const log = g('chat-log');

  // parse numbered options
  const lines = text.split('\n');
  let narrative = '';
  const opts    = [];
  lines.forEach(line => {
    const m = line.trim().match(/^(\d+)\.\s+(.+)$/);
    if (m) opts.push(m[2]);
    else   narrative += line + '\n';
  });

  const msgEl = document.createElement('div');
  msgEl.className = 'msg msg-narrator';

  const bub = document.createElement('div');
  bub.className   = 'bubble bubble-narrator';
  bub.textContent = narrative.trim();
  msgEl.appendChild(bub);

  if (opts.length) {
    const optBox = document.createElement('div');
    optBox.className = 'options-box';
    opts.forEach((opt, i) => {
      const btn       = document.createElement('button');
      btn.className   = 'opt-btn';
      btn.textContent = `${i + 1}. ${opt}`;
      btn.onclick     = () => sendAction(`${i + 1}. ${opt}`);
      optBox.appendChild(btn);
    });
    msgEl.appendChild(optBox);
  }

  log.appendChild(msgEl);
  if (animate) scrollDown();
}

function appendPlayer(text, animate = true) {
  const msgEl = document.createElement('div');
  msgEl.className = 'msg msg-player';
  const bub       = document.createElement('div');
  bub.className   = 'bubble bubble-player';
  bub.textContent = text;
  msgEl.appendChild(bub);
  g('chat-log').appendChild(msgEl);
  if (animate) scrollDown();
}

function appendSystem(text, animate = true) {
  const msgEl = document.createElement('div');
  msgEl.className = 'msg msg-system';
  const bub       = document.createElement('div');
  bub.className   = 'bubble-system';
  bub.textContent = text;
  msgEl.appendChild(bub);
  g('chat-log').appendChild(msgEl);
  if (animate) scrollDown();
}

function scrollDown() {
  const log = g('chat-log');
  setTimeout(() => log.scrollTop = log.scrollHeight, 50);
}

// ── SEND ACTION ───────────────────────────────────────────
async function sendAction(override) {
  if (sending) return;
  const input  = g('action-input');
  const action = (override || input.value).trim();
  if (!action)  return;

  sending = true;
  input.value = '';
  g('send-btn').disabled  = true;
  g('typing').textContent = '⟳ O Mestre está narrando...';

  appendPlayer(action);

  try {
    const res = await fetch(`/api/campaigns/${CAMP_ID}/action`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ action }),
    }).then(r => r.json());

    camp.char    = res.char;
    camp.act     = res.act;
    camp.day     = res.day;
    camp.summary = res.summary || camp.summary;

    appendNarrator(res.narrative);

    if (res.actAdvanced) {
      const actData = ACT_DATA[camp.act] || {};
      appendSystem(`✦ Ato ${camp.act - 1} concluído! O próximo capítulo começa: "${actData.name || ''}"`);
    }

    updateCharPanel();
    updateActIndicator();
    updateStoryProgress();

  } catch (e) {
    appendSystem('Erro ao contatar o Mestre. Tente novamente.');
    console.error(e);
  }

  sending = false;
  g('send-btn').disabled  = false;
  g('typing').textContent = '';
  g('action-input').focus();
}

// ── SPELL SLOT ACTION ─────────────────────────────────────
async function useSlotAction(level) {
  if (sending) return;
  const spell = prompt(`Nível ${level} — Qual magia você está conjurando?`);
  if (!spell) return;

  sending = true;
  g('send-btn').disabled  = true;
  g('typing').textContent = '⟳ O Mestre está narrando...';

  const action = `Conjuro ${spell} usando um espaço de magia de nível ${level}.`;
  appendPlayer(action);

  try {
    const res = await fetch(`/api/campaigns/${CAMP_ID}/action`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ action, usedSlot: level }),
    }).then(r => r.json());

    camp.char = res.char;
    camp.act  = res.act;
    camp.day  = res.day;
    appendNarrator(res.narrative);
    updateCharPanel();
    updateStoryProgress();
  } catch { appendSystem('Erro ao contatar o Mestre.'); }

  sending = false;
  g('send-btn').disabled  = false;
  g('typing').textContent = '';
}

// ── REST ──────────────────────────────────────────────────
async function sendRest(type) {
  if (sending) return;
  sending = true;
  g('send-btn').disabled  = true;
  g('typing').textContent = '⟳ Descansando...';

  const action = type === 'long'
    ? 'Faço um descanso longo para recuperar forças completamente.'
    : 'Faço um descanso curto para recuperar o fôlego.';

  appendPlayer(action);

  try {
    const res = await fetch(`/api/campaigns/${CAMP_ID}/action`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ action, rest: type }),
    }).then(r => r.json());

    camp.char = res.char;
    camp.act  = res.act;
    camp.day  = res.day;
    appendNarrator(res.narrative);
    updateCharPanel();
    updateActIndicator();
    updateStoryProgress();
  } catch { appendSystem('Erro ao descansar.'); }

  sending = false;
  g('send-btn').disabled  = false;
  g('typing').textContent = '';
}

// ── DELETE ────────────────────────────────────────────────
async function deleteCamp() {
  if (!confirm('Abandonar esta aventura permanentemente? Todos os dados serão perdidos.')) return;
  await fetch('/api/campaigns/' + CAMP_ID, { headers: {'x-session-id': SESSION_ID},  method: 'DELETE' });
  location.href = '/';
}

// ── BOOT ──────────────────────────────────────────────────
init();