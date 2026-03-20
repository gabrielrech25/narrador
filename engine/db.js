'use strict';
// ═══════════════════════════════════════════════════════════
//  db.js — Banco de dados JSON com escrita atômica
//  Funciona em qualquer versão do Node, sem dependências externas.
//  Escrita atômica: write temp → fsync → rename (POSIX atomic)
// ═══════════════════════════════════════════════════════════
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const cfg    = require('../config');

// ── Diretórios ────────────────────────────────────────────
const DB_DIR  = path.join(cfg.PATHS.data, 'db');
const DIRS    = {
  users:      path.join(DB_DIR, 'users'),
  sessions:   path.join(DB_DIR, 'sessions'),
  characters: path.join(DB_DIR, 'characters'),
  campaigns:  path.join(DB_DIR, 'campaigns'),
};
Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Utilitários ───────────────────────────────────────────
const uid   = () => crypto.randomBytes(16).toString('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const now   = () => Math.floor(Date.now() / 1000); // unix seconds

// Escrita atômica: write → rename (atômica no POSIX)
function atomicWrite(fp, data) {
  const tmp = fp + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

function readJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return null; }
}

function listDir(dir, filterFn) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp.' + process.pid))
      .map(f => readJSON(path.join(dir, f)))
      .filter(d => d && (!filterFn || filterFn(d)));
  } catch { return []; }
}

// ── Senhas ────────────────────────────────────────────────
const PBKDF2_ITER = 100_000;

function hashPw(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 64, 'sha512').toString('hex');
  return { hash, salt };
}
function verifyPw(password, hash, salt) {
  return hashPw(password, salt).hash === hash;
}

// ── TTL de sessão: 7 dias ─────────────────────────────────
const SESSION_TTL = 7 * 24 * 3600;

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════

function register(username, password, displayName) {
  username = (username || '').trim().toLowerCase();
  if (!username || username.length < 3)   return { ok:false, error:'Usuário deve ter ≥ 3 caracteres.' };
  if (!/^[a-z0-9_]+$/.test(username))    return { ok:false, error:'Apenas letras, números e _.' };
  if (!password || password.length < 6)  return { ok:false, error:'Senha deve ter ≥ 6 caracteres.' };

  const fp = path.join(DIRS.users, username + '.json');
  if (fs.existsSync(fp)) return { ok:false, error:'Usuário já existe.' };

  const { hash, salt } = hashPw(password);
  const user = {
    id:          uid(),
    username,
    display_name: (displayName || username).trim(),
    hash, salt,
    created_at:  now(),
    updated_at:  now(),
  };
  atomicWrite(fp, user);
  return { ok:true, user: toPublic(user) };
}

function login(username, password) {
  username = (username || '').trim().toLowerCase();
  const user = readJSON(path.join(DIRS.users, username + '.json'));
  if (!user)                                return { ok:false, error:'Usuário não encontrado.' };
  if (!verifyPw(password, user.hash, user.salt))
                                            return { ok:false, error:'Senha incorreta.' };

  const sid = token();
  const sess = {
    id: sid, user_id: user.id, username: user.username,
    expires_at: now() + SESSION_TTL, created_at: now(),
  };
  atomicWrite(path.join(DIRS.sessions, sid + '.json'), sess);
  return { ok:true, sessionId: sid, user: toPublic(user) };
}

function validateSession(sid) {
  if (!sid) return { ok:false };
  const sess = readJSON(path.join(DIRS.sessions, sid + '.json'));
  if (!sess)                return { ok:false };
  if (now() > sess.expires_at) {
    try { fs.unlinkSync(path.join(DIRS.sessions, sid + '.json')); } catch {}
    return { ok:false };
  }
  // Renew session
  sess.expires_at = now() + SESSION_TTL;
  atomicWrite(path.join(DIRS.sessions, sid + '.json'), sess);

  const user = readJSON(path.join(DIRS.users, sess.username + '.json'));
  if (!user) return { ok:false };
  return { ok:true, user: toPublic(user) };
}

function logout(sid) {
  try { fs.unlinkSync(path.join(DIRS.sessions, sid + '.json')); } catch {}
}

function changePassword(userId, oldPw, newPw) {
  const all = listDir(DIRS.users, u => u.id === userId);
  const user = all[0];
  if (!user)                              return { ok:false, error:'Usuário não encontrado.' };
  if (!verifyPw(oldPw, user.hash, user.salt)) return { ok:false, error:'Senha atual incorreta.' };
  if (!newPw || newPw.length < 6)         return { ok:false, error:'Nova senha deve ter ≥ 6 caracteres.' };
  const { hash, salt } = hashPw(newPw);
  user.hash = hash; user.salt = salt; user.updated_at = now();
  atomicWrite(path.join(DIRS.users, user.username + '.json'), user);
  return { ok:true };
}

function updateDisplayName(userId, displayName) {
  const all = listDir(DIRS.users, u => u.id === userId);
  const user = all[0];
  if (!user) return;
  user.display_name = displayName; user.updated_at = now();
  atomicWrite(path.join(DIRS.users, user.username + '.json'), user);
}

function toPublic(user) {
  return {
    id:          user.id,
    username:    user.username,
    displayName: user.display_name,
    createdAt:   user.created_at,
  };
}

function cleanSessions() {
  const files = fs.readdirSync(DIRS.sessions).filter(f => f.endsWith('.json'));
  let cleaned = 0;
  for (const f of files) {
    const s = readJSON(path.join(DIRS.sessions, f));
    if (!s || now() > s.expires_at) {
      try { fs.unlinkSync(path.join(DIRS.sessions, f)); cleaned++; } catch {}
    }
  }
  if (cleaned) console.log(`[db] ${cleaned} sessões expiradas removidas.`);
}

// ══════════════════════════════════════════════════════════
//  CHARACTERS
// ══════════════════════════════════════════════════════════

function charDir(userId) {
  const d = path.join(DIRS.characters, userId);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function listCharacters(userId) {
  return listDir(charDir(userId))
    .map(c => ({ id:c.id, name:c.name||'', race:c.race||'', class:c.class||'', level:c.level||1, updatedAt:c.updatedAt||0 }))
    .sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
}

function saveCharacter(char, userId) {
  char.updatedAt = Date.now();
  atomicWrite(path.join(charDir(userId), char.id + '.json'), char);
  return char;
}

function loadCharacter(id, userId) {
  return readJSON(path.join(charDir(userId), id + '.json'));
}

function deleteCharacter(id, userId) {
  try { fs.unlinkSync(path.join(charDir(userId), id + '.json')); } catch {}
}

// ══════════════════════════════════════════════════════════
//  CAMPAIGNS
// ══════════════════════════════════════════════════════════

function campDir(userId) {
  const d = path.join(DIRS.campaigns, userId);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function listCampaigns(userId) {
  return listDir(campDir(userId))
    .map(c => ({ id:c.id, title:c.title||'', charName:c.charName||'', act:c.act||1, savedAt:c.savedAt||0 }))
    .sort((a,b) => (b.savedAt||0) - (a.savedAt||0));
}

function saveCampaign(camp, userId) {
  camp.savedAt = Date.now();
  atomicWrite(path.join(campDir(userId), camp.id + '.json'), camp);
  return camp;
}

function loadCampaign(id, userId) {
  return readJSON(path.join(campDir(userId), id + '.json'));
}

function deleteCampaign(id, userId) {
  try { fs.unlinkSync(path.join(campDir(userId), id + '.json')); } catch {}
}

// ══════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  register, login, validateSession, logout,
  changePassword, updateDisplayName, cleanSessions,
  listCharacters, saveCharacter, loadCharacter, deleteCharacter,
  listCampaigns,  saveCampaign,  loadCampaign,  deleteCampaign,
};
