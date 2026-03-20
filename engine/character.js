'use strict';
const DND = require('../data/dnd5e');

// ── uid ───────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── blank character template ──────────────────────────────
function createBlank() {
  return {
    id:    uid(),
    // identity
    name:       'Novo Personagem',
    player:     '',
    race:       '',
    class:      '',
    background: '',
    alignment:  '',
    // progression
    level: 1,
    xp:    0,
    // ability scores
    scores: { strength:10, dexterity:10, constitution:10, intelligence:10, wisdom:10, charisma:10 },
    // computed (recalculated server-side on save)
    profBonus:            2,
    maxHp:                0,
    currentHp:            0,
    tempHp:               0,
    ac:                   10,
    initiative:           0,
    speed:                30,
    hitDie:               'd8',
    hitDiceUsed:          0,
    spellSaveDC:          0,
    spellAtkBonus:        0,
    spellcastingAbility:  '',
    // proficiencies
    savingThrows:   [],
    skillProfs:     [],
    skillExpertise: [],
    armorProfs:     [],
    weaponProfs:    [],
    languages:      [],
    // spells
    spellSlots: { max: [0,0,0,0,0,0,0,0,0], used: [0,0,0,0,0,0,0,0,0] },
    spells:     { known: [], prepared: [] },
    // condition tracking
    conditions:  [],
    exhaustion:  0,
    inspiration: false,
    deathSaves:  { success: 0, failure: 0 },
    // inventory
    inventory: [],
    gold:   0,
    silver: 0,
    copper: 0,
    // personality
    personalityTraits: '',
    ideals:            '',
    bonds:             '',
    flaws:             '',
    backstory:         '',
    age:               '',
    height:            '',
    weight:            '',
    eyes:              '',
    hair:              '',
    notes:             '',
    // meta
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── recalculate derived stats ─────────────────────────────
function recalc(char) {
  const level    = char.level || 1;
  const pb       = DND.PROF_BONUS[level] || 2;
  char.profBonus = pb;

  const cls  = DND.CLASSES.find(c => c.id === char.class);
  const race = DND.RACES.find(r => r.id === char.race);

  // speed from race
  if (race) char.speed = race.speed;

  // hit die and max HP
  if (cls) {
    char.hitDie = 'd' + cls.hitDie;
    const conMod = DND.mod(char.scores.constitution);
    const avgPerLevel = Math.floor(cls.hitDie / 2) + 1;
    char.maxHp = cls.hitDie + conMod + (level - 1) * (avgPerLevel + conMod);
    // Dwarf Hill: +1 HP per level
    if (char.race === 'dwarf_hill') char.maxHp += level;
    // Initialize currentHp if 0
    if (char.currentHp <= 0 && char.maxHp > 0) char.currentHp = char.maxHp;
  }

  // AC (unarmored)
  const dex = DND.mod(char.scores.dexterity);
  if (char.class === 'barbarian') char.ac = 10 + dex + DND.mod(char.scores.constitution);
  else if (char.class === 'monk') char.ac = 10 + dex + DND.mod(char.scores.wisdom);
  else char.ac = 10 + dex;

  char.initiative = dex;

  // spell slots
  const slots = DND.getSpellSlots(char.class, level);
  if (slots) {
    char.spellSlots.max = [...slots];
  } else {
    char.spellSlots.max = [0,0,0,0,0,0,0,0,0];
  }

  // spellcasting stats
  if (cls && cls.spellcasting) {
    const sa = cls.spellcasting.ability;
    char.spellcastingAbility = sa;
    char.spellSaveDC    = 8 + pb + DND.mod(char.scores[sa] || 10);
    char.spellAtkBonus  = pb + DND.mod(char.scores[sa] || 10);
  } else {
    char.spellcastingAbility = '';
    char.spellSaveDC   = 0;
    char.spellAtkBonus = 0;
  }

  return char;
}

// ── apply race (sets bonus, speed, languages) ─────────────
function applyRace(char, raceId) {
  const race = DND.RACES.find(r => r.id === raceId);
  if (!race) return char;
  char.race      = raceId;
  char.speed     = race.speed;
  char.languages = [...(race.languages || [])];
  return recalc(char);
}

// ── apply class (sets proficiencies, hit die) ─────────────
function applyClass(char, classId) {
  const cls = DND.CLASSES.find(c => c.id === classId);
  if (!cls) return char;
  char.class        = classId;
  char.savingThrows = [...cls.savingThrows];
  char.armorProfs   = [...cls.armorProfs];
  char.weaponProfs  = [...cls.weaponProfs];
  char.hitDie       = 'd' + cls.hitDie;
  if (cls.spellcasting) char.spellcastingAbility = cls.spellcasting.ability;
  return recalc(char);
}

// ── apply background (adds skill profs) ───────────────────
function applyBackground(char, bgId) {
  const bg = DND.BACKGROUNDS.find(b => b.id === bgId);
  if (!bg) return char;
  char.background = bgId;
  bg.skills.forEach(s => {
    if (!char.skillProfs.includes(s)) char.skillProfs.push(s);
  });
  return char;
}

// ── use a spell slot ──────────────────────────────────────
function useSpellSlot(char, level) {
  const idx  = level - 1;
  const max  = char.spellSlots.max[idx]  || 0;
  const used = char.spellSlots.used[idx] || 0;
  if (used >= max) return { ok: false, message: `Sem espaços de nível ${level} disponíveis.` };
  char.spellSlots.used[idx]++;
  return { ok: true };
}

function restoreSpellSlot(char, level) {
  const idx  = level - 1;
  const used = char.spellSlots.used[idx] || 0;
  if (used <= 0) return { ok: false, message: 'Nenhum espaço usado nesse nível.' };
  char.spellSlots.used[idx]--;
  return { ok: true };
}

// ── rest recovery ─────────────────────────────────────────
function shortRest(char) {
  // Warlock: recover all spell slots
  if (char.class === 'warlock') {
    char.spellSlots.used = [0,0,0,0,0,0,0,0,0];
  }
  // Wizard: Arcane Recovery — recover 1 lowest used slot (simplified)
  if (char.class === 'wizard') {
    for (let i = 0; i < 5; i++) {
      if (char.spellSlots.used[i] > 0) { char.spellSlots.used[i]--; break; }
    }
  }
  return char;
}

function longRest(char) {
  char.spellSlots.used = [0,0,0,0,0,0,0,0,0];
  char.currentHp       = char.maxHp;
  char.hitDiceUsed     = 0;
  char.exhaustion      = Math.max(0, (char.exhaustion || 0) - 1);
  char.deathSaves      = { success: 0, failure: 0 };
  return char;
}

// ── level up ─────────────────────────────────────────────
function levelUp(char) {
  if (char.level >= 20) return { char, newFeatures: [] };
  char.level++;
  recalc(char);
  const cls  = DND.CLASSES.find(c => c.id === char.class);
  const newF = cls?.features?.[char.level] || [];
  return { char, newFeatures: newF };
}

module.exports = {
  createBlank, recalc,
  applyRace, applyClass, applyBackground,
  useSpellSlot, restoreSpellSlot,
  shortRest, longRest,
  levelUp,
};
