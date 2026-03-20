'use strict';
const db = require('../engine/db');

module.exports = function authRoutes(router) {

  router.post('/api/auth/register', (req, res) => {
    const { username, password, displayName } = req.body;
    const reg = db.register(username, password, displayName);
    if (!reg.ok) return res.err(reg.error);
    const log = db.login(username, password);
    res.ok({ user: log.user, sessionId: log.sessionId });
  });

  router.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const result = db.login(username, password);
    if (!result.ok) return res.err(result.error, 401);
    res.ok({ user: result.user, sessionId: result.sessionId });
  });

  router.post('/api/auth/logout', (req, res) => {
    const sid = req.headers['x-session-id'] || req.body.sessionId;
    if (sid) db.logout(sid);
    res.ok({ ok: true });
  });

  router.get('/api/auth/me', (req, res) => {
    const result = db.validateSession(req.headers['x-session-id']);
    if (!result.ok) return res.err('Sessão inválida.', 401);
    res.ok({ user: result.user });
  });

  router.post('/api/auth/change-password', (req, res) => {
    const sess = db.validateSession(req.headers['x-session-id']);
    if (!sess.ok) return res.err('Não autenticado.', 401);
    const result = db.changePassword(sess.user.id, req.body.oldPassword, req.body.newPassword);
    if (!result.ok) return res.err(result.error);
    res.ok({ ok: true });
  });


  // POST /api/auth/display-name
  router.post('/api/auth/display-name', (req, res) => {
    const sess = db.validateSession(req.headers['x-session-id']);
    if (!sess.ok) return res.err('Não autenticado.', 401);
    const { displayName } = req.body;
    if (!displayName || displayName.trim().length < 2)
      return res.err('Nome deve ter ao menos 2 caracteres.');
    db.updateDisplayName(sess.user.id, displayName.trim());
    res.ok({ ok: true });
  });

};
