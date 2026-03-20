'use strict';
const fs   = require('fs');
const path = require('path');
const cfg  = require('./config');
const auth = require('./engine/auth');

// ── Legacy global dirs (kept for migration) ──────────
const DATA    = path.join(__dirname, 'storage');
const CHARS   = path.join(DATA, 'characters');
const CAMPS   = path.join(DATA, 'campaigns');
[DATA, CHARS, CAMPS].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Primitives ────────────────────────────────────────
function saveJSON(fp, d) {
  try { fs.writeFileSync(fp, JSON.stringify(d, null, 2)); return true; }
  catch (e) { console.error('saveJSON:', e.message); return false; }
}
function readJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp)); } catch { return null; }
}
function listJSON(dir) {
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')); }
  catch { return []; }
}

// ── User-scoped helpers ───────────────────────────────
function charsDir(userId) {
  if (!userId) return CHARS;
  const p = auth.userPaths(userId);
  auth.ensureUserDirs(userId);
  return p.characters;
}
function campsDir(userId) {
  if (!userId) return CAMPS;
  const p = auth.userPaths(userId);
  auth.ensureUserDirs(userId);
  return p.campaigns;
}

// ── Character CRUD ────────────────────────────────────
function listCharacters(userId) {
  return listJSON(charsDir(userId)).map(f => {
    const c = readJSON(path.join(charsDir(userId), f));
    return c ? { id:c.id, name:c.name, race:c.race, class:c.class, level:c.level, updatedAt:c.updatedAt } : null;
  }).filter(Boolean).sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0));
}
function saveCharacter(char, userId) {
  char.updatedAt = Date.now();
  return saveJSON(path.join(charsDir(userId), char.id + '.json'), char);
}
function loadCharacter(id, userId) {
  return readJSON(path.join(charsDir(userId), id + '.json'));
}
function deleteCharacter(id, userId) {
  try { fs.unlinkSync(path.join(charsDir(userId), id + '.json')); } catch {}
}

// ── Campaign CRUD ─────────────────────────────────────
function listCampaigns(userId) {
  return listJSON(campsDir(userId)).map(f => {
    const c = readJSON(path.join(campsDir(userId), f));
    return c ? { id:c.id, title:c.title, charName:c.charName, act:c.act, savedAt:c.savedAt } : null;
  }).filter(Boolean).sort((a,b) => (b.savedAt||0)-(a.savedAt||0));
}
function saveCampaign(camp, userId) {
  camp.savedAt = Date.now();
  return saveJSON(path.join(campsDir(userId), camp.id + '.json'), camp);
}
function loadCampaign(id, userId) {
  return readJSON(path.join(campsDir(userId), id + '.json'));
}
function deleteCampaign(id, userId) {
  try { fs.unlinkSync(path.join(campsDir(userId), id + '.json')); } catch {}
}

module.exports = {
  saveCharacter, loadCharacter, deleteCharacter, listCharacters,
  saveCampaign,  loadCampaign,  deleteCampaign,  listCampaigns,
};
