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
//  PORTAL.JS — lógica da página principal
// ═══════════════════════════════════════════════════════

const RACE_NAMES = {
  human:'Humano', elf_high:'Elfo Alto', elf_wood:'Elfo Silvestre',
  dwarf_hill:'Anão Colina', dwarf_mountain:'Anão Montanha', halfling:'Halfling',
  half_elf:'Meio-Elfo', half_orc:'Meio-Orc', tiefling:'Tiefling',
  dragonborn:'Draconato', gnome:'Gnomo',
};
const CLASS_NAMES = {
  barbarian:'Bárbaro', bard:'Bardo', cleric:'Clérigo', druid:'Druida',
  fighter:'Guerreiro', monk:'Monge', paladin:'Paladino', ranger:'Patrulheiro',
  rogue:'Ladino', sorcerer:'Feiticeiro', warlock:'Bruxo', wizard:'Mago',
};
const CLASS_ICONS = {
  barbarian:'⚔️', bard:'🎶��', cleric:'✝️', druid:'🌿��', fighter:'🛡��️',
  monk:'👊��', paladin:'⚜️', ranger:'🏹��', rogue:'🗡��️', sorcerer:'✨', warlock:'🔱��', wizard:'🔮��',
};

// ── Load data ─────────────────────────────────────────────
async function loadAll() {
  try {
    const [cr, ar] = await Promise.all([
      fetch('/api/characters', {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()),
      fetch('/api/campaigns',  {headers:{'x-session-id':SESSION_ID}}).then(r => r.json()),
    ]);
    if (cr.error === 'Não autenticado.' || ar.error === 'Não autenticado.') {
      location.href = '/login.html'; return;
    }
    renderChars(cr.characters || []);
    renderCamps(ar.campaigns  || []);
  } catch (e) { console.error(e); }
}

function renderChars(chars) {
  const grid = document.getElementById('chars-grid');
  const cards = chars.map(c => `
    <div class="char-card" onclick="goChar('${c.id}')">
      <button class="cc-del" onclick="event.stopPropagation();delChar('${c.id}')">✕</button>
      <div class="cc-name">${c.name || 'Sem nome'}</div>
      <div class="cc-sub">${CLASS_ICONS[c.class] || ''} ${CLASS_NAMES[c.class] || '?'} · ${RACE_NAMES[c.race] || '?'}</div>
      <div class="cc-level">Nível ${c.level || 1} · ${new Date(c.updatedAt || 0).toLocaleDateString('pt-BR')}</div>
    </div>`).join('');
  grid.innerHTML = cards + `
    <div class="char-card new-card" onclick="newChar()">
      <span class="new-plus">+</span>Nova Ficha
    </div>`;
}

function renderCamps(camps) {
  const el = document.getElementById('camps-list');
  if (!camps.length) {
    el.innerHTML = '<div class="empty-msg">Nenhuma aventura salva. Crie uma ficha e inicie uma aventura!</div>';
    return;
  }
  el.innerHTML = camps.map(c => `
    <div class="camp-card" onclick="goCamp('${c.id}')">
      <div class="camp-act-badge">ATO<span>${c.act || 1}</span>/10</div>
      <div class="camp-info">
        <div class="ci-title">${c.title || 'Aventura'}</div>
        <div class="ci-char">Herói: ${c.charName || '?'}</div>
        <div class="ci-date">Salvo em ${new Date(c.savedAt || 0).toLocaleString('pt-BR')}</div>
      </div>
      <div class="camp-arrow">›</div>
    </div>`).join('');
}

// ── Actions ───────────────────────────────────────────────
async function newChar() {
  const res = await fetch('/api/characters', {
    method: 'POST', headers: authHeaders(), body: '{}',
  }).then(r => r.json());
  location.href = '/sheet.html?id=' + res.character.id;
}

function goChar(id)  { location.href = '/sheet.html?id=' + id; }
function goCamp(id)  { location.href = '/adventure.html?id=' + id; }

async function delChar(id) {
  if (!confirm('Excluir esta ficha permanentemente?')) return;
  await fetch('/api/characters/' + id, { headers: {'x-session-id': SESSION_ID},  method: 'DELETE' });
  loadAll();
}

async function newCampaign() {
  const res   = await fetch('/api/characters', {headers:{'x-session-id':SESSION_ID}}).then(r => r.json());
  const chars = res.characters || [];
  if (!chars.length) {
    alert('Crie pelo menos uma ficha de personagem antes de iniciar uma aventura!');
    location.href = '/sheet.html';
    return;
  }
  const opts = chars.map(c =>
    `<option value="${c.id}">${c.name} — ${CLASS_NAMES[c.class] || '?'} Nv.${c.level || 1}</option>`
  ).join('');

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-title">⚔ Sombras sobre Waterdeep</div>
    <p class="modal-p">Uma campanha longa na Cidade dos Esplendores. Guildas, conspirações, tesouros perdidos e escolhas impossíveis. O Mestre lembra de tudo.</p>
    <label class="modal-label">Escolha o personagem</label>
    <select class="modal-select" id="sel-char">${opts}</select>
    <div class="btn-row">
      <button class="btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" id="start-btn" onclick="startCamp()">Começar Aventura →</button>
    </div>`;
  document.getElementById('modal').classList.add('show');
}

async function startCamp() {
  const charId = document.getElementById('sel-char').value;
  const btn    = document.getElementById('start-btn');
  btn.textContent = 'Gerando abertura...';
  btn.disabled    = true;
  try {
    const res = await fetch('/api/campaigns', {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ charId }),
    }).then(r => r.json());
    closeModal();
    location.href = '/adventure.html?id=' + res.campaign.id;
  } catch {
    btn.textContent = 'Erro — tente novamente';
    btn.disabled    = false;
  }
}

function closeModal() { document.getElementById('modal').classList.remove('show'); }

// ── Dice ──────────────────────────────────────────────────
function roll(sides) {
  const r = Math.floor(Math.random() * sides) + 1;
  document.getElementById('roll-result').textContent = r;
  document.getElementById('roll-sub').textContent    = `d${sides} → ${r}`;
  pulse();
}

function rollAdv() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  document.getElementById('roll-result').textContent = `${Math.max(a, b)} (vantagem)`;
  document.getElementById('roll-sub').textContent    = `Rolou ${a} e ${b} — usa o maior`;
  pulse();
}

function rollDisadv() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  document.getElementById('roll-result').textContent = `${Math.min(a, b)} (desvantagem)`;
  document.getElementById('roll-sub').textContent    = `Rolou ${a} e ${b} — usa o menor`;
  pulse();
}

function rollStats() {
  const stats = [];
  for (let i = 0; i < 6; i++) {
    const ds = [...Array(4)].map(() => Math.floor(Math.random() * 6) + 1);
    ds.sort((a, b) => a - b);
    ds.shift();
    stats.push({ total: ds.reduce((a, b) => a + b, 0), rolls: ds });
  }
  document.getElementById('roll-result').textContent = stats.map(s => s.total).join('  |  ');
  document.getElementById('roll-sub').textContent    = stats.map(s => `[${s.rolls.join(',')}]=${s.total}`).join('  ');
  pulse();
}

function pulse() {
  const el = document.getElementById('roll-result');
  el.style.transform = 'scale(1.15)';
  setTimeout(() => el.style.transform = 'scale(1)', 120);
}

// ── Boot ──────────────────────────────────────────────────
loadAll();

// ── User display in header ─────────────────────────────
checkAuth().then(user => {
  if (!user) return;
  const el = document.getElementById('user-nav');
  if (el) el.dataset.user = user.displayName;
}).catch(() 