'use strict';
const DND = require('../data/dnd5e');
const AI  = require('./ai');

// ── Waterdeep open-world story data ──────────────────────
const STORY = {
  title:   'Sombras sobre Waterdeep',
  setting: 'Waterdeep — a Cidade dos Esplendores, capital de Faerûn',
  acts: {
    1: {
      name:  'O Chamado',
      desc:  'O personagem chega a Waterdeep e é envolto em uma conspiração que começa com uma simples nota e termina em sangue.',
      goal:  'Descobrir quem está por trás dos desaparecimentos no Bairro do Cais e obter acesso à Guilda do Xanathar.',
      hook:  'Uma criança entrega-lhe uma nota selada: "Seja no Yawning Portal ao entardecer. Há ouro — e urgência." Sem assinatura.',
      locations: ['Porto de Waterdeep', 'Yawning Portal', 'Bairro do Cais', 'Beco dos Sussurros'],
      npcs: [
        'Durnan — taverneiro impassível do Yawning Portal, sabe mais do que diz',
        'Yagra Stonefist — meio-orc mercenária, pode ser aliada ou rival',
        'Um guarda da Cidade corrompido que te persegue',
        'Renaer Neverember — filho do ex-Senhor Aberto, próximo desaparecer',
      ],
    },
    2: {
      name:  'A Conspiração',
      desc:  'Com os fios nas mãos, o herói mergulha nas entranhas políticas de Waterdeep: guildas, facções e 500.000 peças de ouro desaparecidas.',
      goal:  'Infiltrar a Guilda do Xanathar e descobrir onde está o Tesouro do Dragão — ouro roubado da própria cidade.',
      hook:  'Três facções disputam o tesouro: o Xanathar (beholder paranoico), a Força das Sombras (elfos de Skullport) e Lord Neverember (exilado ambicioso). Você está no meio.',
      locations: ['Tesouro da Cidade (Castelo Waterdeep)', 'Covil do Xanathar (Subsolo)', 'Sede da Força das Sombras', 'Mansão Cassalanter'],
      npcs: [
        'Xanathar — beholder paranóico, mata por prazer, tem um peixinho de estimação chamado Sylgar',
        'Davil Starsong — elfo do sol, recruta para a Força das Sombras',
        'Vajra Safahr — Maga Negra de Waterdeep, desconfia de todos',
        'Jarlaxle Baenre — drow carismático com agenda própria, nem aliado nem inimigo',
      ],
    },
    3: {
      name:  'O Confronto Final',
      desc:  'O herói chega ao coração do mistério e deve fazer uma escolha que definirá o futuro de Waterdeep.',
      goal:  'Recuperar o Tesouro do Dragão e decidir seu destino: devolver à cidade, entregar a uma facção, ou ficar com ele.',
      hook:  'A verdade é mais sombria: o ouro financiaria um ritual dos Cassalanter para vender as almas dos habitantes à Asmodeus. Tempo esgotando.',
      locations: ['Subsolo de Waterdeep', 'Palácio dos Cassalanter', 'Câmara dos Senhores Mascarados', 'Praça do Castelo'],
      npcs: [
        'Lord e Lady Cassalanter — nobres cultistas de Asmodeus, amam os filhos mais que o diabo',
        'Os Senhores Mascarados — governo secreto da cidade, querem o tesouro de volta',
        'Laeral Silverhand — Senhor Aberto, a última linha de defesa',
        'Um aliado que vai trair você no pior momento',
      ],
    },
    // Atos 4-10: open world after main arc
    4: {
      name:  'Ecos do Abismo',
      desc:  'Com Waterdeep salva (ou destruída), novos problemas emergem: um portal para o Abismo foi aberto nos esgotos da cidade.',
      goal:  'Fechar o portal antes que demônios tomem a cidade por baixo.',
      hook:  'Cultistas de Orcus ressuscitam mortos nos cemitérios; os Señores pedem ajuda discreta.',
      locations: ['Esgotos de Waterdeep', 'Cemitério da Cidade Norte', 'Templo de Kelemvor'],
      npcs: ['Padre Sepulcroso — clérigo de Kelemvor sabe do portal', 'Líder cultista mascará'],
    },
    5: {
      name:  'O Dragão Despertado',
      desc:  'Um dracolich antigo reivindica as ruínas de Undermountain como seu território e ameaça toda a cidade.',
      goal:  'Descer a Undermountain, encontrar o dracolich Halaster Enlouquecido e destruir sua pedra-alma.',
      hook:  'Halaster Blackcloak, o mago louco de Undermountain, foi corrompido e transformado — e quer a superfície.',
      locations: ['Poço do Yawning Portal (entrada)', 'Undermountain — Nível 1: O Salão Perdido', 'Câmara da Pedra-Alma'],
      npcs: ['Halaster — dracolich caótico e imprevisível', 'Sobreviventes presos em Undermountain'],
    },
  },
};

// ── build the AI system prompt ────────────────────────────
function buildSystemPrompt(camp) {
  const ch  = camp.char;
  const act = STORY.acts[camp.act] || STORY.acts[1];
  const pb  = [0,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6][ch.level || 1] || 2;

  const lines = [
    `Você é o Mestre de D&D 5e. Narre sempre em português brasileiro. Seja cinematográfico e imersivo.`,
    ``,
    `CAMPANHA: ${STORY.title} — ${STORY.setting}`,
    ``,
    `PERSONAGEM:`,
    `  Nome: ${ch.name} | ${ch.race} ${ch.class} Nível ${ch.level}`,
    `  HP: ${ch.currentHp}/${ch.maxHp} | CA: ${ch.ac} | Prof: +${pb}`,
    `  Local atual: ${ch.location || 'Waterdeep'} | Dia da campanha: ${camp.day}`,
    ``,
    `ATO ATUAL: ${camp.act} — "${act.name}"`,
    `OBJETIVO: ${act.goal}`,
    `LOCAIS RELEVANTES: ${act.locations.join(', ')}`,
    `NPCs IMPORTANTES: ${act.npcs.join(' | ')}`,
  ];

  if (camp.summary) {
    lines.push(``, `HISTÓRICO (resumo do que já aconteceu):`, camp.summary);
  }

  lines.push(
    ``,
    `REGRAS DE NARRAÇÃO — OBRIGATÓRIAS:`,
    `1. Narre em 90 a 140 palavras. Cinematográfico, sensorial (cheiros, sons, luz).`,
    `2. SEMPRE termine com exatamente 3 opções numeradas (1. 2. 3.) — nenhuma a mais, nenhuma a menos.`,
    `3. Referencie escolhas anteriores quando relevante — o Mestre tem memória.`,
    `4. Avance gradualmente em direção ao objetivo do ato. Não deixe a história estagnada.`,
    `5. Waterdeep é viva: barulho de docas, cheiro de especiarias, corrupção política, pickpockets.`,
    `6. Em combate: role d20 + modificador vs CA e narre o resultado com drama.`,
    `7. Cada ato tem um arco emocional: tensão → desenvolvimento → clímax. Siga-o.`,
    `8. Quando o objetivo do ato for concluído, inclua exatamente: [ATO ${camp.act} CONCLUÍDO]`,
    `9. Esta é uma campanha longa (10+ sessões). Construa lentamente, crie suspense, não resolva rápido.`,
  );

  return lines.join('\n');
}

// ── update rolling summary ────────────────────────────────
function updateSummary(camp, playerAction, narratorText) {
  const entry = `[Ato ${camp.act}, Dia ${camp.day}, ${camp.char.location || '?'}] ` +
                `Jogador: "${playerAction.slice(0, 70)}" → ` +
                `Narrador: "${narratorText.slice(0, 120)}"`;

  let s = camp.summary ? camp.summary + '\n' + entry : entry;

  // Rolling window: ~1200 chars
  if (s.length > 1200) {
    const lines = s.split('\n');
    while (s.length > 1200 && lines.length > 2) { lines.shift(); s = lines.join('\n'); }
  }
  camp.summary = s;
}

// ── check for act advancement ─────────────────────────────
function checkActAdvance(camp, narratorText) {
  const match = narratorText.match(/\[ATO (\d+) CONCLUÍDO\]/);
  if (match && parseInt(match[1]) === camp.act) {
    const maxAct = Object.keys(STORY.acts).length;
    if (camp.act < maxAct) {
      camp.act++;
      camp.day++;
      return true;
    }
  }
  return false;
}

// ── create a new campaign ─────────────────────────────────
function createCampaign(char) {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    id:       uid(),
    title:    STORY.title,
    charName: char.name,
    charId:   char.id,
    char: {
      name:                char.name,
      race:                char.race,
      class:               char.class,
      level:               char.level,
      maxHp:               char.maxHp,
      currentHp:           char.currentHp,
      ac:                  char.ac,
      scores:              { ...char.scores },
      profBonus:           char.profBonus,
      spellSlots:          JSON.parse(JSON.stringify(char.spellSlots)),
      spellcastingAbility: char.spellcastingAbility,
      spellSaveDC:         char.spellSaveDC,
      spellAtkBonus:       char.spellAtkBonus,
      spells:              { known: [...char.spells.known], prepared: [...char.spells.prepared] },
      location:            'Porto de Waterdeep',
    },
    act:     1,
    day:     1,
    summary: '',
    log:     [],
    savedAt: Date.now(),
  };
}

// ── process a player action (async via callback) ──────────
function processAction(camp, actionData, callback) {
  const { action, rest, usedSlot, hpChange, location } = actionData;

  // mechanical updates before narrative
  if (hpChange)   camp.char.currentHp = Math.max(0, Math.min(camp.char.maxHp, camp.char.currentHp + hpChange));
  if (location)   camp.char.location  = location;
  if (usedSlot) {
    const idx = usedSlot - 1;
    if (camp.char.spellSlots.used[idx] < camp.char.spellSlots.max[idx])
      camp.char.spellSlots.used[idx]++;
  }
  if (rest === 'long') {
    camp.char.currentHp            = camp.char.maxHp;
    camp.char.spellSlots.used      = [0,0,0,0,0,0,0,0,0];
    camp.day++;
  }
  if (rest === 'short') {
    // Warlock: all slots back
    if (camp.char.class === 'warlock') camp.char.spellSlots.used = [0,0,0,0,0,0,0,0,0];
  }

  // Build minimal message history (last narrator + current action only)
  const lastNarrator = [...camp.log].reverse().find(e => e.role === 'narrator');
  const messages = [];
  if (lastNarrator) messages.push({ role: 'assistant', content: lastNarrator.text.slice(0, 400) });
  messages.push({ role: 'user', content: action.slice(0, 250) });

  const system = buildSystemPrompt(camp);

  AI.callAI(messages, system, narrative => {
    // update log (max 80 entries = 40 exchanges)
    camp.log.push({ role: 'player',   text: action,    at: Date.now() });
    camp.log.push({ role: 'narrator', text: narrative,  at: Date.now() });
    if (camp.log.length > 80) camp.log = camp.log.slice(-80);

    updateSummary(camp, action, narrative);
    const actAdvanced = checkActAdvance(camp, narrative);

    callback(null, { narrative, actAdvanced });
  });
}

// ── generate opening narrative ────────────────────────────
function generateOpening(camp, callback) {
  const act   = STORY.acts[1];
  const system = buildSystemPrompt(camp);
  const msg   = `Abra a aventura. Descreva a chegada de ${camp.char.name} ao porto de Waterdeep com riqueza sensorial. Então apresente o gancho: ${act.hook}`;
  AI.callAI([{ role: 'user', content: msg }], system, narrative => {
    camp.log.push({ role: 'narrator', text: narrative, at: Date.now() });
    callback(null, narrative);
  });
}

module.exports = {
  STORY,
  createCampaign,
  generateOpening,
  processAction,
  buildSystemPrompt,
};
