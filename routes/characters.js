'use strict';
const db  = require('../engine/db');
const ch  = require('../engine/character');
const DND = require('../data/dnd5e');

function auth(req, res) {
  const s = db.validateSession(req.headers['x-session-id']);
  if (!s.ok) { res.err('Não autenticado.', 401); return null; }
  return s.user;
}

module.exports = function(router) {
  router.get('/api/characters', (req, res) => {
    const u = auth(req, res); if (!u) return;
    res.ok({ characters: db.listCharacters(u.id) });
  });

  router.post('/api/characters', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = ch.createBlank();
    if (req.body.name) c.name = req.body.name;
    db.saveCharacter(c, u.id);
    res.ok({ character: c });
  });

  router.get('/api/characters/:id', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound('Personagem não encontrado.');
    res.ok({ character: c });
  });

  router.put('/api/characters/:id', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = { ...req.body, id: req.params.id };
    ch.recalc(c);
    db.saveCharacter(c, u.id);
    res.ok({ character: c });
  });

  router.delete('/api/characters/:id', (req, res) => {
    const u = auth(req, res); if (!u) return;
    db.deleteCharacter(req.params.id, u.id);
    res.ok({ ok: true });
  });

  router.post('/api/characters/:id/race', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound();
    ch.applyRace(c, req.body.race);
    db.saveCharacter(c, u.id);
    res.ok({ character: c, raceData: DND.RACES.find(r => r.id === req.body.race) });
  });

  router.post('/api/characters/:id/class', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound();
    ch.applyClass(c, req.body.class);
    db.saveCharacter(c, u.id);
    const lv = c.level || 1;
    res.ok({ character: c,
      classData: DND.CLASSES.find(x => x.id === req.body.class),
      features: DND.getFeaturesUpToLevel(req.body.class, lv),
      spells: DND.getSpellsForClass(req.body.class).filter(s => s.level <= DND.getMaxSpellLevel(req.body.class, lv)),
    });
  });

  router.post('/api/characters/:id/background', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound();
    ch.applyBackground(c, req.body.background);
    db.saveCharacter(c, u.id);
    res.ok({ character: c });
  });

  router.post('/api/characters/:id/levelup', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound();
    const { char, newFeatures } = ch.levelUp(c);
    db.saveCharacter(char, u.id);
    res.ok({ character: char, newFeatures });
  });

  router.post('/api/characters/:id/slot', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound();
    const r = req.body.action === 'use' ? ch.useSpellSlot(c, req.body.level) : ch.restoreSpellSlot(c, req.body.level);
    if (!r.ok) return res.ok({ ok: false, message: r.message });
    db.saveCharacter(c, u.id);
    res.ok({ ok: true, character: c });
  });

  router.post('/api/characters/:id/rest', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const c = db.loadCharacter(req.params.id, u.id);
    if (!c) return res.notFound();
    req.body.type === 'long' ? ch.longRest(c) : ch.shortRest(c);
    db.saveCharacter(c, u.id);
    res.ok({ character: c, message: req.body.type === 'long' ? 'Descanso longo restaurado!' : 'Descanso curto concluído.' });
  });
};
