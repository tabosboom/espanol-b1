// Turns content and progress into a list of session steps.
//   { kind: 'intro', entry }
//   { kind: 'question', ids: [...], module, question }

import { normalise, splitAnswers } from './grade.js';
import { dateString, isDue } from './srs.js';
import { shuffle } from './questions.js';
import { state } from './storage.js';

const BASE_MINUTES = 15;
const BASE_ITEMS = 25;
const BASE_REVIEWS = 10;
const BASE_GRAMMAR = 6;
const MATCH_MIN = 4;
const MATCH_MAX = 5;
const MODULE_PRACTICE_SIZE = 12;
const QUICK_ITEMS = 8;

// ---------- Content index ----------

export function buildIndex(content) {
  const index = { ...content, byId: new Map() };
  for (const theme of content.themes) {
    for (const pack of theme.packs) {
      for (const entry of pack.entries) {
        index.byId.set(entry.id, { kind: 'vocab', entry, pack, theme, module: theme.id });
      }
    }
  }
  for (const mod of content.grammar) {
    for (const item of mod.items) {
      index.byId.set(item.id, { kind: 'grammar', item, mod, module: mod.id });
    }
  }
  for (const conv of content.conversations) {
    conv.turns.forEach((turn, turnIndex) => {
      if (turn.speaker === 'me') {
        index.byId.set(exchangeId(conv, turnIndex), {
          kind: 'exchange', conv, turnIndex, module: 'conversations',
        });
      }
    });
  }
  return index;
}

function exchangeId(conv, turnIndex) {
  return `${conv.id}#${turnIndex}`;
}

// ---------- Vocabulary exercises ----------

function bareSpanish(entry) {
  return normalise(entry.es);
}

function pickDistractors(index, record, count) {
  const { entry, pack, theme } = record;
  const samePack = pack.entries.filter((e) => e.pos === entry.pos);
  const sameTheme = theme.packs.flatMap((p) => p.entries).filter((e) => e.pos === entry.pos);
  const anyInTheme = theme.packs.flatMap((p) => p.entries);
  const picked = [];
  const clashes = (e) =>
    e.id === entry.id
    || normalise(e.en) === normalise(entry.en)
    || bareSpanish(e) === bareSpanish(entry)
    || picked.some((p) => normalise(p.en) === normalise(e.en) || bareSpanish(p) === bareSpanish(e));
  for (const pool of [samePack, sameTheme, anyInTheme]) {
    for (const candidate of shuffle(pool)) {
      if (picked.length >= count) return picked;
      if (!clashes(candidate)) picked.push(candidate);
    }
  }
  return picked;
}

// Every Spanish entry in the theme with the same English also counts as right.
function acceptedFor(record) {
  const { entry, theme } = record;
  const answers = [entry.es, ...splitAnswers(entry.accept)];
  const sameMeaning = theme.packs
    .flatMap((p) => p.entries)
    .filter((e) => e.id !== entry.id && normalise(e.en) === normalise(entry.en));
  for (const other of sameMeaning) answers.push(other.es, ...splitAnswers(other.accept));
  return answers;
}

function explain(entry) {
  return entry.note ? `${entry.en}. ${entry.note}` : entry.en;
}

function clozeOf(entry) {
  return entry.cloze || locateInExample(entry);
}

// The part of the example sentence to blank out: the entry itself, without
// its article if the sentence uses a different determiner.
function locateInExample(entry) {
  const clean = entry.es.replace(/[¿?¡!…]/g, '').trim();
  const lower = entry.ex.toLowerCase();
  const at = lower.indexOf(clean.toLowerCase());
  if (at >= 0) return entry.ex.slice(at, at + clean.length);
  const noArticle = clean.replace(/^(el|la|los|las)\s+/i, '');
  const noArticleAt = lower.indexOf(noArticle.toLowerCase());
  return noArticleAt >= 0 ? entry.ex.slice(noArticleAt, noArticleAt + noArticle.length) : null;
}

function exampleWithBlank(entry) {
  const cloze = clozeOf(entry);
  if (!cloze) return null;
  const at = entry.ex.indexOf(cloze);
  if (at < 0) return null;
  return { cloze, sentence: `${entry.ex.slice(0, at)}___${entry.ex.slice(at + cloze.length)}` };
}

const footer = (entry) => ({ ex: explain(entry), example: entry.ex });

function vocabMc(index, record, direction) {
  const { entry } = record;
  const distractors = pickDistractors(index, record, 3);
  if (distractors.length < 2) return vocabType(record);
  const toEnglish = direction === 'es-en';
  const opts = [entry, ...distractors].map((e) => (toEnglish ? e.en : e.es));
  return {
    type: 'mc',
    instruction: toEnglish ? 'What does this mean?' : 'How do you say this in Spanish?',
    prompt: toEnglish ? entry.es : entry.en,
    promptLang: toEnglish ? 'es' : 'en',
    optsLang: toEnglish ? 'en' : 'es',
    opts,
    c: 0,
    ...footer(entry),
    answerDisplay: entry.es,
  };
}

function vocabType(record) {
  const { entry } = record;
  return {
    type: 'type',
    instruction: 'Type this in Spanish',
    prompt: entry.en,
    promptLang: 'en',
    accepted: acceptedFor(record),
    display: entry.es,
    pos: entry.pos,
    ...footer(entry),
  };
}

function vocabGap(record) {
  const { entry } = record;
  const blank = exampleWithBlank(entry);
  if (!blank || blank.cloze.split(/\s+/).length > 3) return vocabType(record);
  return {
    type: 'gap',
    instruction: `Fill the gap: "${entry.en}"`,
    sentence: blank.sentence,
    accepted: [blank.cloze, ...acceptedFor(record)],
    display: blank.cloze,
    pos: entry.pos,
    ...footer(entry),
  };
}

function vocabGapBank(index, record) {
  const { entry } = record;
  const blank = exampleWithBlank(entry);
  const distractors = pickDistractors(index, record, 3)
    .map((e) => clozeOf(e))
    .filter(Boolean)
    .filter((text) => normalise(text) !== normalise(blank?.cloze));
  if (!blank || distractors.length < 2) return vocabType(record);
  return {
    type: 'gapBank',
    instruction: `Choose the missing words: "${entry.en}"`,
    sentence: blank.sentence,
    bank: [blank.cloze, ...new Set(distractors)],
    answers: [blank.cloze],
    ...footer(entry),
  };
}

function vocabQuestion(index, record) {
  const box = state.items[record.entry.id]?.box ?? 0;
  const coin = Math.random() < 0.5;
  if (box <= 1) return vocabMc(index, record, coin ? 'es-en' : 'en-es');
  if (box <= 3) return coin ? vocabType(record) : vocabGapBank(index, record);
  return coin ? vocabType(record) : vocabGap(record);
}

function matchStep(records) {
  return {
    kind: 'question',
    ids: records.map((r) => r.entry.id),
    module: records[0].module,
    question: {
      type: 'match',
      instruction: 'Match the pairs',
      pairs: records.map((r) => ({ id: r.entry.id, es: r.entry.es, en: r.entry.en })),
    },
  };
}

// ---------- Grammar and conversation exercises ----------

function grammarQuestion(item) {
  const tag = item.fromMistake ? 'Your mistake' : undefined;
  const ex = { ex: item.ex, tag };
  switch (item.type) {
    case 'mc':
      return { type: 'mc', prompt: item.q, opts: item.opts, c: item.c, instruction: item.instruction || 'Choose the correct option', ...ex };
    case 'tf':
      return { type: 'tf', prompt: item.q, a: item.a, instruction: item.instruction || 'Is this correct Spanish?', ...ex };
    case 'type':
      return { type: 'type', prompt: item.q, promptLang: 'en', accepted: splitAnswers(item.a), instruction: 'Type this in Spanish', ...ex };
    case 'gap':
      return { type: 'gap', sentence: item.q, accepted: splitAnswers(item.a), instruction: item.instruction || 'Fill the gap', ...ex };
    case 'gapBank':
      return { type: 'gapBank', sentence: item.q, bank: item.bank, answers: item.a, instruction: 'Choose the missing word', ...ex };
    case 'tiles':
      return { type: 'tiles', prompt: item.q, promptLang: 'en', a: item.a, distractors: item.distractors, instruction: 'Build the sentence in Spanish', ...ex };
    case 'spot':
      return { type: 'spot', sentence: item.q, wrong: item.wrong, a: item.a, opts: item.opts, instruction: 'Tap the wrong word', ...ex };
    default:
      throw new Error(`Unknown grammar type: ${item.type}`);
  }
}

function exchangeQuestion(conv, turnIndex, fullContext) {
  const turn = conv.turns[turnIndex];
  let start = turnIndex;
  if (fullContext) {
    start = 0;
  } else {
    while (start > 0 && conv.turns[start - 1].speaker === 'them') start -= 1;
  }
  return {
    type: 'dialogue',
    setting: conv.setting,
    context: conv.turns.slice(start, turnIndex),
    turn,
    ex: turn.en,
  };
}

function stepFor(index, id) {
  const record = index.byId.get(id);
  if (!record) return null;
  if (record.kind === 'vocab') {
    return { kind: 'question', ids: [id], module: record.module, question: vocabQuestion(index, record) };
  }
  if (record.kind === 'grammar') {
    return { kind: 'question', ids: [id], module: record.module, question: grammarQuestion(record.item) };
  }
  return {
    kind: 'question',
    ids: [id],
    module: record.module,
    question: exchangeQuestion(record.conv, record.turnIndex, false),
  };
}

// ---------- Selection ----------

function dueIds(index) {
  const today = dateString();
  const due = [];
  for (const [id, record] of index.byId) {
    if (record.kind !== 'exchange' && isDue(state.items[id], today)) due.push(id);
  }
  return shuffle(due).sort((a, b) => state.items[a].due.localeCompare(state.items[b].due));
}

export function countDueWords(index) {
  return dueIds(index).filter((id) => index.byId.get(id).kind === 'vocab').length;
}

function nextNewWords(index, count) {
  const out = [];
  const themes = [...index.themes].sort((a, b) => a.priority - b.priority);
  for (const theme of themes) {
    for (const pack of theme.packs) {
      for (const entry of pack.entries) {
        if (out.length >= count) return out;
        if (!state.items[entry.id]) out.push(entry.id);
      }
    }
  }
  return out;
}

export function moduleAccuracy(ids) {
  let seen = 0;
  let credit = 0;
  for (const id of ids) {
    seen += state.items[id]?.seen || 0;
    credit += state.items[id]?.correct || 0;
  }
  return seen ? credit / seen : null;
}

// Weighted draw without replacement: weaker modules and real mistakes come first.
function pickGrammar(index, count, used) {
  const candidates = [];
  for (const mod of index.grammar) {
    const accuracy = moduleAccuracy(mod.items.map((item) => item.id));
    const moduleWeight = 1.2 - (accuracy ?? 0.5);
    for (const item of mod.items) {
      if (!state.items[item.id] && !used.has(item.id)) {
        candidates.push({ id: item.id, weight: moduleWeight * (item.fromMistake ? 3 : 1) });
      }
    }
  }
  const picked = [];
  while (picked.length < count && candidates.length) {
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * total;
    let at = 0;
    for (; at < candidates.length - 1; at += 1) {
      roll -= candidates[at].weight;
      if (roll <= 0) break;
    }
    picked.push(candidates[at].id);
    candidates.splice(at, 1);
  }
  return picked;
}

function nextExchange(index) {
  const exchanges = [...index.byId.entries()].filter(([, r]) => r.kind === 'exchange').map(([id]) => id);
  return exchanges.find((id) => !state.items[id]) || shuffle(exchanges)[0] || null;
}

function mistakeIds(count, used) {
  const open = Object.keys(state.mistakes).filter((id) => !used.has(id));
  return shuffle(open).slice(0, count);
}

// Seen items that are not due, weakest first, to top up a short session.
function practiceIds(index, count, used) {
  const seen = [...index.byId.entries()]
    .filter(([id, r]) => r.kind !== 'exchange' && state.items[id]?.seen && !used.has(id))
    .map(([id]) => id);
  return shuffle(seen).sort((a, b) => state.items[a].box - state.items[b].box).slice(0, count);
}

// ---------- Ordering ----------

function needsIntro(id, index) {
  const record = index.byId.get(id);
  return record?.kind === 'vocab' && !state.items[id]?.seen;
}

// Shuffles, inserts a "new word" card a little before each word's first
// question, and avoids testing the same word in consecutive steps.
function sequence(steps, index) {
  const queue = shuffle(steps);
  const out = [];
  const introduced = new Set();
  while (queue.length) {
    const step = queue.shift();
    const pending = step.ids.filter((id) => needsIntro(id, index) && !introduced.has(id));
    if (pending.length) {
      for (const id of pending) {
        introduced.add(id);
        out.push({ kind: 'intro', ids: [id], entry: index.byId.get(id).entry });
      }
      queue.splice(Math.min(2, queue.length), 0, step);
      continue;
    }
    const previous = out[out.length - 1];
    if (previous?.kind === 'question' && previous.ids.some((id) => step.ids.includes(id)) && queue.length) {
      queue.splice(1, 0, step);
      continue;
    }
    out.push(step);
  }
  return out;
}

// ---------- Session builders ----------

function stepsFromIds(index, ids) {
  const lowBox = [];
  const others = [];
  for (const id of ids) {
    const record = index.byId.get(id);
    if (record?.kind === 'vocab' && (state.items[id]?.box ?? 0) <= 1) lowBox.push(id);
    else others.push(id);
  }
  const steps = [];
  const shuffled = shuffle(lowBox);
  if (shuffled.length >= MATCH_MIN) {
    const size = Math.min(MATCH_MAX, shuffled.length);
    const records = [];
    for (const id of shuffled) {
      const record = index.byId.get(id);
      const clash = records.some((r) => normalise(r.entry.en) === normalise(record.entry.en));
      if (records.length < size && !clash) records.push(record);
    }
    if (records.length >= MATCH_MIN) {
      steps.push(matchStep(records));
      const taken = new Set(records.map((r) => r.entry.id));
      others.push(...shuffled.filter((id) => !taken.has(id)));
    } else {
      others.push(...shuffled);
    }
  } else {
    others.push(...shuffled);
  }
  for (const id of others) {
    const step = stepFor(index, id);
    if (step) steps.push(step);
  }
  return steps;
}

export function buildDailySession(index) {
  const { goalMinutes, newWords } = state.settings;
  const scale = goalMinutes / BASE_MINUTES;
  const target = Math.round(BASE_ITEMS * scale);
  const used = new Set();
  const take = (ids) => {
    const fresh = ids.filter((id) => !used.has(id));
    fresh.forEach((id) => used.add(id));
    return fresh;
  };

  const reviews = take(dueIds(index).slice(0, Math.round(BASE_REVIEWS * scale)));
  const newCount = scale < 1 ? Math.min(newWords, Math.ceil(target * 0.32)) : newWords;
  const fresh = take(nextNewWords(index, newCount));
  const grammar = take(pickGrammar(index, Math.max(2, Math.round(BASE_GRAMMAR * scale)), used));
  const exchange = scale >= 1 || target >= 12 ? take([nextExchange(index)].filter(Boolean)) : [];
  const mistakes = take(mistakeIds(scale < 1 ? 1 : 2, used));

  const ids = [...reviews, ...fresh, ...grammar, ...exchange, ...mistakes];
  if (ids.length < target) ids.push(...take(pickGrammar(index, target - ids.length, used)));
  if (ids.length < target) ids.push(...take(practiceIds(index, target - ids.length, used)));
  return sequence(stepsFromIds(index, ids), index);
}

export function buildQuickReview(index) {
  const used = new Set();
  const take = (ids) => {
    const fresh = ids.filter((id) => !used.has(id));
    fresh.forEach((id) => used.add(id));
    return fresh;
  };
  const ids = take(dueIds(index).slice(0, QUICK_ITEMS));
  ids.push(...take(mistakeIds(QUICK_ITEMS - ids.length, used)));
  ids.push(...take(practiceIds(index, QUICK_ITEMS - ids.length, used)));
  ids.push(...take(pickGrammar(index, QUICK_ITEMS - ids.length, used)));
  return sequence(ids.map((id) => stepFor(index, id)).filter(Boolean), index);
}

export function buildMistakes(index) {
  const ids = Object.keys(state.mistakes).filter((id) => index.byId.has(id));
  return sequence(ids.map((id) => stepFor(index, id)), index);
}

export function buildPack(index, pack) {
  const ids = pack.entries.map((entry) => entry.id);
  return sequence(stepsFromIds(index, ids), index);
}

export function buildGrammarPractice(index, mod) {
  const unseen = mod.items.filter((item) => !state.items[item.id]);
  const seen = shuffle(mod.items.filter((item) => state.items[item.id]))
    .sort((a, b) => state.items[a.id].box - state.items[b.id].box);
  const chosen = [...shuffle(unseen), ...seen].slice(0, MODULE_PRACTICE_SIZE);
  return shuffle(chosen.map((item) => stepFor(index, item.id)));
}

export function buildConversation(conv) {
  const steps = [];
  conv.turns.forEach((turn, turnIndex) => {
    if (turn.speaker === 'me') {
      steps.push({
        kind: 'question',
        ids: [exchangeId(conv, turnIndex)],
        module: 'conversations',
        question: exchangeQuestion(conv, turnIndex, true),
      });
    }
  });
  return steps;
}

export function exchangeIds(conv) {
  return conv.turns
    .map((turn, turnIndex) => (turn.speaker === 'me' ? exchangeId(conv, turnIndex) : null))
    .filter(Boolean);
}

// A text label for an item id, used on the Mistakes list.
export function describeItem(index, id) {
  const record = index.byId.get(id);
  if (!record) return null;
  if (record.kind === 'vocab') {
    return { title: record.entry.es, detail: record.entry.en, module: record.theme.title };
  }
  if (record.kind === 'grammar') {
    const { item } = record;
    const answer = item.type === 'mc' ? item.opts[item.c]
      : item.type === 'tf' ? (item.a ? 'Verdadero' : 'Falso')
      : item.type === 'gapBank' ? item.a.join(' … ')
      : splitAnswers(item.a)[0];
    return { title: item.q, detail: answer, module: record.mod.title };
  }
  const turn = record.conv.turns[record.turnIndex];
  return { title: turn.es, detail: turn.en, module: `Conversation: ${record.conv.title}` };
}
