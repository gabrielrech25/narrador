'use strict';
// node:sqlite requer --experimental-sqlite no Node < 23
// No Node 22, passar a flag no PM2 ou: node --experimental-sqlite server.js
const http   = require('http');
const cfg    = require('./config');
const Router = require('./router');
const db     = require('./engine/db');

const router = new Router();
router.register(require('./routes/auth'));
router.register(require('./routes/dnddata'));
router.register(require('./routes/characters'));
router.register(require('./routes/campaigns'));

http.createServer((req, res) => router.dispatch(req, res)).listen(cfg.PORT, () => {
  db.cleanSessions();
  const ai = cfg.GROQ_KEY ? `Groq → ${cfg.GROQ_MODEL}` : `Ollama → ${cfg.OL_MODEL}`;
  console.log(`\n  PORTAL RPG — D&D 5e`);
  console.log(`  http://localhost:${cfg.PORT}  |  IA: ${ai}\n`);
});
