'use strict';
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const cfg  = require('./config');

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8' };

const STATIC_VIEWS = {
  '/':               'index.html',
  '/index.html':     'index.html',
  '/sheet.html':     'sheet.html',
  '/adventure.html': 'adventure.html',
  '/login.html':     'login.html',
  '/register.html':  'register.html',
  '/profile.html':   'profile.html',
};

class Router {
  constructor() { this._routes = []; }
  _add(m, p, h) { this._routes.push({ method: m.toUpperCase(), pattern: p, handler: h }); }
  get(p,h)    { this._add('GET',p,h); }
  post(p,h)   { this._add('POST',p,h); }
  put(p,h)    { this._add('PUT',p,h); }
  delete(p,h) { this._add('DELETE',p,h); }
  register(fn){ fn(this); }

  dispatch(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-session-id');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const parsed   = url.parse(req.url, true);
    const pathname = parsed.pathname;

    res.ok       = d      => { res.writeHead(200, {'Content-Type':'application/json;charset=utf-8'}); res.end(JSON.stringify(d)); };
    res.err      = (m,c=400) => { res.writeHead(c,  {'Content-Type':'application/json;charset=utf-8'}); res.end(JSON.stringify({error:m})); };
    res.notFound = m      => res.err(m || 'Não encontrado.', 404);

    // Static views
    if (req.method === 'GET' && STATIC_VIEWS[pathname]) {
      const fp = path.join(cfg.PATHS.views, STATIC_VIEWS[pathname]);
      if (fs.existsSync(fp)) { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); return res.end(fs.readFileSync(fp)); }
      return res.notFound();
    }

    // Public assets
    if (req.method === 'GET' && pathname.startsWith('/public/')) {
      const fp  = path.join(cfg.PATHS.public, pathname.replace('/public/', ''));
      const ext = path.extname(fp);
      if (fs.existsSync(fp)) { res.writeHead(200, {'Content-Type': MIME[ext]||'text/plain'}); return res.end(fs.readFileSync(fp)); }
      return res.notFound();
    }

    if (!pathname.startsWith('/api/')) { res.writeHead(404); return res.end('Not found.'); }

    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try { req.body = JSON.parse(raw); } catch { req.body = {}; }
      req.query  = parsed.query;
      req.params = {};

      for (const route of this._routes) {
        if (route.method !== req.method) continue;
        if (route.pattern === pathname) return route.handler(req, res);
        const matched = matchPattern(route.pattern, pathname);
        if (matched) { req.params = matched; return route.handler(req, res); }
      }
      res.err('Rota não encontrada: ' + req.method + ' ' + pathname, 404);
    });
  }
}

function matchPattern(pattern, pathname) {
  const pp = pattern.split('/');
  const np = pathname.split('/');
  if (pp.length !== np.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = np[i];
    else if (pp[i] !== np[i]) return null;
  }
  return params;
}

module.exports = Router;
