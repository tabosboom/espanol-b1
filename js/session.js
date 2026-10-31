// Turns content and progress into a list of session steps.
//   { kind: 'intro', ids: [id], entry }
//   { kind: 'question', ids: [...], module, question, round?, practice?, retryable? }
// `round` marks a learning round. `practice` steps are not scored against the schedule.

import { normalise, splitAnswers } from './grade.js';
import { dateString, GRADUATED, isDue, stageOf } from './srs.js';
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
const SECONDS_PER_STEP = 20;
const ROUND_NAMES = ['Recognise', 'Recall', 'In a sentence', 'Write it'];

export const roundLabel = (round) => `Round ${round + 1} of 4 · ${ROUND_NAMES[round]}`;

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
  for (const text of content.reading) {
    text.questions.forEach((question, questionIndex) => {
      index.byId.set(readingId(text, questionIndex), {
        kind: 'reading', text, questionIndex, module: 'reading',
      });
    });
  }
  return index;
}

function exchangeId(conv, turnIndex) {
  return `${conv.id}#${turnIndex}`;
}

function readingId(text, questionIndex) {
  return `${text.id}#${questionIndex}`;
}

// ---------- Vocabulary exercises ----------

function pickDistractors(record, count) {
  const { entry, pack, theme } = record;
  const samePack = pack.entries.filter((e) => e.pos === entry.pos);
  const sameTheme = theme.packs.flatMap((p) => p.entries).filter((e) => e.pos === entry.pos);
  const anyInTheme = theme.packs.flatMap((p) => p.entries);
  const picked = [];
  const clashes = (e) =>
    e.id === entry.id
    || normalise(e.en) === normalise(entry.en)
    || normalise(e.es) === normalise(entry.es)
    || picked.some((p) => normalise(p.en) === normalise(e.en) || normalise(p.es) === normalise(e.es));
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
  const noArticle = clean.replace(/^(el\/la|el|la|los|las)\s+/i, '');
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

const footer = (entry) => ({
  ex: entry.note || undefined,
  meaning: `${entry.es} = ${entry.en}`,
  completed: entry.ex,
  sentenceEn: entry.exEn,
});

function vocabMc(record, direction) {
  const { entry } = record;
  const distractors = pickDistractors(record, 3);
  if (distractors.length < 2) return vocabType(record);
  const toEnglish = direction === 'es-en';
  return {
    type: 'mc',
    instruction: toEnglish ? 'What does this mean?' : 'How do you say this in Spanish?',
    prompt: toEnglish ? entry.es : entry.en,
    promptLang: toEnglish ? 'es' : 'en',
    optsLang: toEnglish ? 'en' : 'es',
    opts: [entry, ...distractors].map((e) => (toEnglish ? e.en : e.es)),
    c: 0,
    ...footer(entry),
    completed: undefined,
    sentenceEn: undefined,
  };
}

function vocabType(record) {
  const { entry } = record;
  return {
    type: 'type',
    instruction: 'Write this in Spanish',
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
    instruction: `Write the missing Spanish: "${entry.en}"`,
    sentence: blank.sentence,
    accepted: [blank.cloze, ...acceptedFor(record)],
    display: blank.cloze,
    pos: entry.pos,
    ...footer(entry),
  };
}

function vocabGapBank(record) {
  const { entry } = record;
  const blank = exampleWithBlank(entry);
  if (!blank) return vocabType(record);
  const target = normalise(blank.cloze);
  const distractors = pickDistractors(record, 5)
    .map(clozeOf)
    .filter((text) => text && normalise(text) !== target);
  const bank = [...new Set(distractors)].slice(0, 3);
  if (bank.length < 2) return vocabType(record);
  return {
    type: 'gapBank',
    instruction: `Tap the missing Spanish: "${entry.en}"`,
    sentence: blank.sentence,
    bank: [blank.cloze, ...bank],
    answers: [blank.cloze],
    ...footer(entry),
  };
}

// Reviews test recall: the sentence with a word bank first, then writing.
function reviewQuestion(record) {
  const box = state.items[record.entry.id]?.box ?? 1;
  const coin = Math.random() < 0.5;
  if (box <= 1) return vocabGapBank(record);
  if (box <= 3) return coin ? vocabType(record) : vocabGapBank(record);
  return coin ? vocabType(record) : vocabGap(record);
}

function roundQuestion(record, round) {
  if (round === 0) return vocabMc(record, 'es-en');
  if (round === 1) return vocabMc(record, 'en-es');
  if (round === 2) return vocabGapBank(record);
  return vocabType(record);
}

function matchStep(records) {
  return {
    kind: 'question',
    ids: records.map((r) => r.entry.id),
    module: records[0].module,
    practice: true,
    question: {
      type: 'match',
      instruction: 'Match the pairs',
      pairs: records.map((r) => ({ id: r.entry.id, es: r.entry.es, en: r.entry.en })),
    },
  };
}

// ---------- Grammar, conversation and reading exercises ----------

// The whole correct sentence, shown with its translation after answering.
function completedSentence(item) {
  const first = (text) => splitAnswers(text)[0];
  switch (item.type) {
    case 'gap':
      return item.q.replace('___', first(item.a)).replace(/\s*\([^)]*\)\s*$/, '');
    case 'mc':
      return item.q.includes('___') ? item.q.replace('___', item.opts[item.c]).replace(/\s*\([^)]*\)\s*$/, '') : undefined;
    case 'gapBank': {
      let out = item.q;
      for (const answer of item.a) out = out.replace('___', answer);
      return out;
    }
    case 'spot':
      return item.full;
    case 'tf':
      return item.a ? item.q : item.full;
    case 'tiles':
    case 'type':
      return first(item.a);
    default:
      return undefined;
  }
}

export function grammarQuestion(item) {
  const common = {
    ex: item.ex,
    tag: item.fromMistake ? 'Your mistake' : undefined,
    completed: completedSentence(item),
    sentenceEn: item.en,
  };
  switch (item.type) {
    case 'mc':
      return { type: 'mc', prompt: item.q, opts: item.opts, c: item.c, instruction: item.instruction || 'Choose the correct option', ...common };
    case 'tf':
      return { type: 'tf', prompt: item.q, a: item.a, instruction: item.instruction || 'Is this correct Spanish?', ...common };
    case 'type':
      return { type: 'type', prompt: item.q, promptLang: 'en', accepted: splitAnswers(item.a), instruction: 'Write this in Spanish', ...common };
    case 'gap':
      return { type: 'gap', sentence: item.q, accepted: splitAnswers(item.a), instruction: item.instruction || 'Fill the gap', ...common };
    case 'gapBank':
      return { type: 'gapBank', sentence: item.q, bank: item.bank, answers: item.a, instruction: item.a.length > 1 ? 'Tap the missing words' : 'Tap the missing word', ...common };
    case 'tiles':
      return { type: 'tiles', prompt: item.q, promptLang: 'en', a: item.a, distractors: item.distractors, instruction: 'Build the sentence in Spanish', ...common };
    case 'spot':
      return { type: 'spot', sentence: item.q, wrong: item.wrong, a: item.a, opts: item.opts, instruction: 'Tap the wrong word', ...common };
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
    meaning: turn.en,
  };
}

function readingQuestion(text, questionIndex) {
  const question = text.questions[questionIndex];
  return {
    type: 'read',
    title: text.title,
    text: text.text,
    index: questionIndex,
    total: text.questions.length,
    question: {
      type: question.type,
      prompt: question.q,
      opts: question.opts,
      c: question.c,
      a: question.a,
    },
    ex: question.ex,
  };
}

function stepFor(index, id) {
  const record = index.byId.get(id);
  if (!record) return null;
  const base = { kind: 'question', ids: [id], module: record.module, retryable: true };
  if (record.kind === 'vocab') return { ...base, question: reviewQuestion(record) };
  if (record.kind === 'grammar') return { ...base, question: grammarQuestion(record.item) };
  if (record.kind === 'reading') return { ...base, question: readingQuestion(record.text, record.questionIndex) };
  return { ...base, question: exchangeQuestion(record.conv, record.turnIndex, false) };
}

// ---------- Selection ----------

const isReviewable = (id, record) =>
  (record.kind === 'grammar' || (record.kind === 'vocab' && stageOf(state.items[id]) >= GRADUATED));

function dueIds(index) {
  const today = dateString();
  const due = [];
  for (const [id, record] of index.byId) {
    if (isReviewable(id, record) && isDue(state.items[id], today)) due.push(id);
  }
  return shuffle(due).sort((a, b) => state.items[a].due.localeCompare(state.items[b].due));
}

export function countDueWords(index) {
  return dueIds(index).filter((id) => index.byId.get(id).kind === 'vocab').length;
}

const orderedThemes = (index) => [...index.themes].sort((a, b) => a.priority - b.priority);

// Words part-way through their rounds come first, then the next unseen words.
function nextLearningWords(index, count, entries = null) {
  const pool = entries || orderedThemes(index).flatMap((t) => t.packs.flatMap((p) => p.entries));
  const open = pool.filter((entry) => stageOf(state.items[entry.id]) < GRADUATED);
  const started = open.filter((entry) => stageOf(state.items[entry.id]) > 0);
  const rest = open.filter((entry) => stageOf(state.items[entry.id]) === 0);
  return [...started, ...rest].slice(0, count).map((entry) => entry.id);
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
    .filter(([id, r]) => isReviewable(id, r) && state.items[id]?.seen && !used.has(id))
    .map(([id]) => id);
  return shuffle(seen).sort((a, b) => state.items[a].box - state.items[b].box).slice(0, count);
}

// ---------- Learning rounds ----------

// Returns one list of steps per round. In round 1 each word's card comes just
// before the question on the previous word, so an answer never follows its own card.
function learningRounds(index, ids) {
  const records = ids.map((id) => index.byId.get(id));
  const inRound = (round) => shuffle(records.filter((r) => stageOf(state.items[r.entry.id]) <= round));
  const rounds = [];
  for (let round = 0; round < 4; round += 1) {
    const steps = [];
    let held = null;
    for (const record of inRound(round)) {
      const step = {
        kind: 'question',
        ids: [record.entry.id],
        module: record.module,
        round,
        question: { ...roundQuestion(record, round), round: roundLabel(round) },
      };
      if (round === 0) {
        steps.push({ kind: 'intro', ids: [record.entry.id], entry: record.entry, round, total: records.length });
        if (held) steps.push(held);
        held = step;
      } else {
        steps.push(step);
      }
    }
    if (held) steps.push(held);
    rounds.push(steps);
  }
  return rounds;
}

function matchFor(index, ids) {
  const records = [];
  for (const id of shuffle(ids)) {
    const record = index.byId.get(id);
    if (records.length < MATCH_MAX && !records.some((r) => normalise(r.entry.en) === normalise(record.entry.en))) {
      records.push(record);
    }
  }
  return records.length >= MATCH_MIN ? [matchStep(records)] : [];
}

function learningSteps(index, ids) {
  const [first, second, third, fourth] = learningRounds(index, ids);
  return [...first, ...second, ...matchFor(index, ids), ...third, ...fourth];
}

// ---------- Session builders ----------

const toSteps = (index, ids) => ids.map((id) => stepFor(index, id)).filter(Boolean);

function avoidRepeats(steps) {
  const queue = shuffle(steps);
  const out = [];
  while (queue.length) {
    const step = queue.shift();
    const previous = out[out.length - 1];
    if (previous && previous.ids.some((id) => step.ids.includes(id)) && queue.length) {
      queue.splice(1, 0, step);
    } else {
      out.push(step);
    }
  }
  return out;
}

// Spaces grammar and other items between the rounds rather than running one block.
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

  const reviews = take(dueIds(index).slice(0, Math.round(BASE_REVIEWS * Math.min(scale, 1.3))));
  const wordCount = scale < 1 ? Math.min(newWords, Math.max(2, Math.round(newWords * scale * 0.7))) : newWords;
  const words = take(nextLearningWords(index, wordCount));
  const grammar = take(pickGrammar(index, Math.max(2, Math.round(BASE_GRAMMAR * scale)), used));
  const exchange = scale >= 0.6 ? take([nextExchange(index)].filter(Boolean)) : [];
  const mistakes = take(mistakeIds(scale < 1 ? 1 : 2, used));

  const counted = reviews.length + words.length * 4 + grammar.length + exchange.length + mistakes.length;
  if (counted < target) grammar.push(...take(pickGrammar(index, target - counted, used)));
  const counted2 = reviews.length + words.length * 4 + grammar.length + exchange.length + mistakes.length;
  const extra = counted2 < target ? take(practiceIds(index, target - counted2, used)) : [];

  const [first, second, third, fourth] = learningRounds(index, words);
  const fill = avoidRepeats(toSteps(index, [...grammar, ...extra]));
  const part = Math.ceil(fill.length / 3);
  return [
    ...avoidRepeats(toSteps(index, reviews)),
    ...first,
    ...fill.slice(0, part),
    ...second,
    ...toSteps(index, mistakes),
    ...matchFor(index, words),
    ...fill.slice(part, part * 2),
    ...third,
    ...toSteps(index, exchange),
    ...fill.slice(part * 2),
    ...fourth,
  ];
}

export function estimateMinutes(steps) {
  return Math.max(1, Math.round((steps.length * SECONDS_PER_STEP) / 60));
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
  return avoidRepeats(toSteps(index, ids));
}

export function buildMistakes(index) {
  return avoidRepeats(toSteps(index, Object.keys(state.mistakes).filter((id) => index.byId.has(id))));
}

// The next words of this pack through all rounds; once all are learned, a review of the pack.
export function buildPack(index, pack) {
  const words = nextLearningWords(index, state.settings.newWords, pack.entries);
  if (words.length) return learningSteps(index, words);
  return avoidRepeats(toSteps(index, pack.entries.map((entry) => entry.id)));
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

export function buildReading(text) {
  return text.questions.map((_, questionIndex) => ({
    kind: 'question',
    ids: [readingId(text, questionIndex)],
    module: 'reading',
    question: readingQuestion(text, questionIndex),
  }));
}

export function exchangeIds(conv) {
  return conv.turns
    .map((turn, turnIndex) => (turn.speaker === 'me' ? exchangeId(conv, turnIndex) : null))
    .filter(Boolean);
}

export function readingIds(text) {
  return text.questions.map((_, questionIndex) => readingId(text, questionIndex));
}

// ---------- Checkpoints ----------

// Exam steps carry their section. Vocabulary comes from words already studied,
// falling back to the first words of the course.
export function buildCheckpoint(index, checkpoint) {
  const steps = [];
  for (const section of checkpoint.sections) {
    if (section.items) {
      for (const item of section.items) {
        steps.push({ kind: 'question', ids: [item.id], section: section.name, exam: true, question: grammarQuestion(item) });
      }
    } else if (section.vocab) {
      const all = orderedThemes(index).flatMap((t) => t.packs.flatMap((p) => p.entries));
      const studied = shuffle(all.filter((e) => stageOf(state.items[e.id]) >= 2));
      const pool = [...studied, ...all.filter((e) => !studied.includes(e))].slice(0, section.vocab);
      for (const entry of pool) {
        steps.push({
          kind: 'question', ids: [entry.id], section: section.name, exam: true, question: vocabType(index.byId.get(entry.id)),
        });
      }
    } else if (section.reading) {
      const text = index.reading.find((t) => t.id === section.reading);
      text.questions.forEach((_, questionIndex) => {
        steps.push({
          kind: 'question', ids: [readingId(text, questionIndex)], section: section.name, exam: true, question: readingQuestion(text, questionIndex),
        });
      });
    }
  }
  return steps.map((step) => ({ ...step, question: { ...step.question, exam: true } }));
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
  if (record.kind === 'reading') {
    const question = record.text.questions[record.questionIndex];
    return { title: question.q, detail: question.type === 'mc' ? question.opts[question.c] : (question.a ? 'Verdadero' : 'Falso'), module: `Reading: ${record.text.title}` };
  }
  const turn = record.conv.turns[record.turnIndex];
  return { title: turn.es, detail: turn.en, module: `Conversation: ${record.conv.title}` };
}

