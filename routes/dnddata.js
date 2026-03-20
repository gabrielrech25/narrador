'use strict';
const DND = require('../data/dnd5e');

module.exports = function dndDataRoutes(router) {

  // GET /api/data/classes — list summary
  router.get('/api/data/classes', (req, res) => {
    res.ok({
      classes: DND.CLASSES.map(c => ({
        id:             c.id,
        name:           c.name,
        icon:           c.icon,
        hitDie:         c.hitDie,
        desc:           c.desc,
        primaryAbility: c.primaryAbility,
        spellcasting:   c.spellcasting,
        savingThrows:   c.savingThrows,
        skillCount:     c.skillCount,
        skillOptions:   c.skillOptions,
      })),
    });
  });

  // GET /api/data/classes/:id — full class data
  router.get('/api/data/classes/:id', (req, res) => {
    const cls = DND.CLASSES.find(c => c.id === req.params.id);
    if (!cls) return res.notFound('Classe não encontrada.');
    res.ok({ cls });
  });

  // GET /api/data/races
  router.get('/api/data/races', (req, res) => {
    res.ok({ races: DND.RACES });
  });

  // GET /api/data/backgrounds
  router.get('/api/data/backgrounds', (req, res) => {
    res.ok({ backgrounds: DND.BACKGROUNDS });
  });

  // GET /api/data/spells?class=wizard&maxLevel=5
  router.get('/api/data/spells', (req, res) => {
    let spells = DND.SPELLS;
    if (req.query.class)    spells = spells.filter(s => s.classes.includes(req.query.class));
    if (req.query.maxLevel) spells = spells.filter(s => s.level <= parseInt(req.query.maxLevel));
    res.ok({ spells });
  });

  // GET /api/data/features?class=wizard&level=5
  router.get('/api/data/features', (req, res) => {
    const { class: classId, level } = req.query;
    if (!classId) return res.err('Parâmetro "class" é obrigatório.');
    const lv       = parseInt(level) || 1;
    const features = DND.getFeaturesUpToLevel(classId, lv);
    const maxSL    = DND.getMaxSpellLevel(classId, lv);
    const spells   = DND.getSpellsForClass(classId).filter(s => s.level <= maxSL);
    res.ok({ features, availableSpells: spells });
  });

};
