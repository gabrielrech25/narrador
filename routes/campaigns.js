'use strict';
const db      = require('../engine/db');
const campEng = require('../engine/campaign');

function auth(req, res) {
  const s = db.validateSession(req.headers['x-session-id']);
  if (!s.ok) { res.err('Não autenticado.', 401); return null; }
  return s.user;
}

module.exports = function(router) {
  router.get('/api/campaigns', (req, res) => {
    const u = auth(req, res); if (!u) return;
    res.ok({ campaigns: db.listCampaigns(u.id) });
  });

  router.post('/api/campaigns', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const char = db.loadCharacter(req.body.charId, u.id);
    if (!char) return res.notFound('Personagem não encontrado.');
    const camp = campEng.createCampaign(char);
    campEng.generateOpening(camp, (err, narrative) => {
      if (err) return res.err('Falha ao gerar abertura.');
      db.saveCampaign(camp, u.id);
      res.ok({ campaign: camp, narrative });
    });
  });

  router.get('/api/campaigns/:id', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const camp = db.loadCampaign(req.params.id, u.id);
    if (!camp) return res.notFound();
    res.ok({ campaign: camp });
  });

  router.delete('/api/campaigns/:id', (req, res) => {
    const u = auth(req, res); if (!u) return;
    db.deleteCampaign(req.params.id, u.id);
    res.ok({ ok: true });
  });

  router.post('/api/campaigns/:id/action', (req, res) => {
    const u = auth(req, res); if (!u) return;
    const camp = db.loadCampaign(req.params.id, u.id);
    if (!camp) return res.notFound();
    const action = (req.body.action || '').trim();
    if (!action) return res.err('action é obrigatório.');
    campEng.processAction(camp, req.body, (err, result) => {
      if (err) return res.err('Falha na narrativa.');
      db.saveCampaign(camp, u.id);
      res.ok({ narrative: result.narrative, char: camp.char, act: camp.act, day: camp.day, summary: camp.summary, actAdvanced: result.actAdvanced });
    });
  });
};
