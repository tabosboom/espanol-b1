// Progress and settings in localStorage. Everything survives storage failures:
// if localStorage throws, the app keeps running on the in-memory copy.

import { addDays, applyAnswer, applyLearning, dateString, daysBetween, LEARNED_BOX } from './srs.js';

const KEY = 'trainer-progress';
const SCHEMA = 1;
const SAVE_DELAY_MS = 300;
const MISTAKE_DAYS = 30;
const MISTAKE_CLEAR_STREAK = 2;

let saveTimer = null;
let storageWorks = true;

function blank() {
  return {
    schema: SCHEMA,
    startDate: dateString(),
    settings: { goalMinutes: 15, newWords: 8 },
    items: {},
    mistakes: {},
    days: {},
    conversationsDone: {},
    rulesSeen: {},
    checkpoints: {},
  };
}

function merge(saved) {
  const base = blank();
  return { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
}

export const state = blank();

function replaceState(next) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) replaceState(merge(JSON.parse(raw)));
  } catch {
    storageWorks = false;
  }
  pruneMistakes();
}

export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
}

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

export function isPersistent() {
  return storageWorks;
}

function dayRecord(day) {
  if (!state.days[day]) state.days[day] = { answered: 0, credit: 0, seconds: 0, newWords: 0 };
  return state.days[day];
}

export function pruneMistakes() {
  const today = dateString();
  for (const [id, mistake] of Object.entries(state.mistakes)) {
    if (daysBetween(mistake.at, today) > MISTAKE_DAYS) delete state.mistakes[id];
  }
}

function trackMistake(id, moduleId, result, addOnWrong) {
  if (result === 'wrong' && addOnWrong) {
    state.mistakes[id] = { module: moduleId, at: dateString(), streak: 0 };
  } else if (result === 'correct' && state.mistakes[id]) {
    state.mistakes[id].streak += 1;
    if (state.mistakes[id].streak >= MISTAKE_CLEAR_STREAK) delete state.mistakes[id];
  }
}

function recordDay(result) {
  const record = dayRecord(dateString());
  record.answered += 1;
  record.credit += result === 'correct' ? 1 : result === 'almost' ? 0.5 : 0;
}

// Records one answer for one item id. Returns true if this was the item's first answer.
export function recordAnswer(id, moduleId, result, given) {
  const previous = state.items[id];
  const firstTime = !previous || previous.seen === 0;
  state.items[id] = applyAnswer(previous, result, given, dateString());
  recordDay(result);
  trackMistake(id, moduleId, result, true);
  save();
  return firstTime;
}

// An answer in a learning round. Early rounds are for learning, so only a
// miss in the sentence or writing round goes on the Mistakes list.
export function recordLearning(id, moduleId, result, given, round) {
  const previous = state.items[id];
  const firstTime = !previous || previous.seen === 0;
  state.items[id] = applyLearning(previous, result, given, dateString(), round);
  recordDay(result);
  trackMistake(id, moduleId, result, round >= 2);
  save();
  return firstTime;
}

// Saves one checkpoint attempt: { date, score, total, sections: [{ name, score, total }] }.
export function saveCheckpoint(id, attempt) {
  if (!state.checkpoints[id]) state.checkpoints[id] = [];
  state.checkpoints[id].push(attempt);
  flush();
}

// Queues an item for review without counting it as answered.
export function queueItem(id) {
  if (state.items[id]) return;
  state.items[id] = { box: 0, due: dateString(), seen: 0, correct: 0, wrong: 0, lastAnswer: '', stage: 0 };
  save();
}

export function addSeconds(seconds) {
  dayRecord(dateString()).seconds += seconds;
  save();
}

export function addNewWords(count) {
  dayRecord(dateString()).newWords += count;
  save();
}

export function streak() {
  let day = dateString();
  if (!state.days[day]?.answered) day = addDays(day, -1);
  let count = 0;
  while (state.days[day]?.answered) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

export function accuracyLastDays(days) {
  let answered = 0;
  let credit = 0;
  let day = dateString();
  for (let i = 0; i < days; i += 1) {
    answered += state.days[day]?.answered || 0;
    credit += state.days[day]?.credit || 0;
    day = addDays(day, -1);
  }
  return answered ? credit / answered : null;
}

export function minutesToday() {
  return Math.round((state.days[dateString()]?.seconds || 0) / 60);
}

export function isLearned(id) {
  return (state.items[id]?.box ?? 0) >= LEARNED_BOX;
}

export function setSetting(name, value) {
  state.settings[name] = value;
  save();
}

export function exportProgress() {
  flush();
  return JSON.stringify(state);
}

// Throws an Error with a readable message if the text is not a valid backup.
export function importProgress(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That text is not valid JSON. Paste the whole export.');
  }
  if (!parsed || parsed.schema !== SCHEMA || typeof parsed.items !== 'object' || parsed.items === null) {
    throw new Error('That text is not a progress export from this app.');
  }
  replaceState(merge(parsed));
  flush();
}

export function resetProgress() {
  const { settings } = state;
  replaceState({ ...blank(), settings });
  flush();
}
