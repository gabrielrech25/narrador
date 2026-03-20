'use strict';
const http  = require('http');
const https = require('https');
const cfg   = require('../config');

// ── public interface ─────────────────────────────────────
function callAI(messages, systemPrompt, callback) {
  if (cfg.GROQ_KEY) callGroq(messages, systemPrompt, callback);
  else callOllama(messages, systemPrompt, callback);
}

// ── Groq ─────────────────────────────────────────────────
function callGroq(messages, system, cb) {
  const payload = JSON.stringify({
    model:       cfg.GROQ_MODEL,
    max_tokens:  450,
    temperature: 0.85,
    messages:    [{ role: 'system', content: system }, ...messages],
  });

  let done = false;
  const respond = t => { if (!done) { done = true; cb(t); } };

  const req = https.request({
    hostname: 'api.groq.com',
    port:     443,
    path:     '/openai/v1/chat/completions',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  'Bearer ' + cfg.GROQ_KEY,
      'Content-Length': Buffer.byteLength(payload),
    },
  }, res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      try {
        const p = JSON.parse(raw);
        if (p.error) { console.error('[groq]', p.error.message); respond('O Mestre está em silêncio...'); }
        else respond(p.choices[0].message.content);
      } catch { respond('O oráculo não respondeu.'); }
    });
  });

  req.on('error', e => respond('Erro de conexão: ' + e.message));
  req.setTimeout(30000, () => { req.destroy(); respond('Timeout — o Mestre demorou demais.'); });
  req.write(payload);
  req.end();
}

// ── Ollama ───────────────────────────────────────────────
function callOllama(messages, system, cb) {
  const payload = JSON.stringify({
    model:   cfg.OL_MODEL,
    stream:  false,
    messages: [{ role: 'system', content: system }, ...messages],
    options: { temperature: 0.85, num_predict: 450 },
  });

  let done = false;
  const respond = t => { if (!done) { done = true; cb(t); } };

  const req = http.request({
    hostname: cfg.OL_HOST,
    port:     cfg.OL_PORT,
    path:     '/api/chat',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      try { respond(JSON.parse(raw).message?.content || 'O Mestre está em silêncio...'); }
      catch { respond('O oráculo não respondeu.'); }
    });
  });

  req.on('error', () => respond('Ollama não encontrado. Inicie com: ollama serve'));
  req.setTimeout(120000, () => { req.destroy(); respond('Timeout — Ollama demorou demais.'); });
  req.write(payload);
  req.end();
}

module.exports = { callAI };
