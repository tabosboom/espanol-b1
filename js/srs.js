// Scheduling: a word first goes through four learning rounds, then Leitner boxes.
// Pure functions, no DOM.

export const INTERVALS = [0, 1, 2, 4, 8, 16];
export const LEARNED_BOX = 3;
export const GRADUATED = 4; // learning rounds: 0 recognise, 1 recall, 2 sentence, 3 write
const TOP_BOX = INTERVALS.length - 1;

export function dateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(day, count) {
  const [y, m, d] = day.split('-').map(Number);
  return dateString(new Date(y, m - 1, d + count));
}

export function daysBetween(from, to) {
  const toDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toDate(to) - toDate(from)) / 86400000);
}

export function newItem(day) {
  return { box: 0, due: day, seen: 0, correct: 0, wrong: 0, lastAnswer: '' };
}

export function isDue(item, day) {
  return Boolean(item) && item.due <= day;
}

// The next learning round a word needs. Words answered before rounds existed
// keep their place: box 2 and up has graduated, the rest continue at round 1.
export function stageOf(item) {
  if (!item) return 0;
  if (item.stage !== undefined) return item.stage;
  if (item.box >= 2) return GRADUATED;
  return item.seen > 0 ? 1 : 0;
}

function count(item, result, given) {
  item.seen += 1;
  item.lastAnswer = String(given ?? '').slice(0, 80);
  if (result === 'correct') item.correct += 1;
  else if (result === 'almost') item.correct += 0.5;
  else item.wrong += 1;
}

// One answer in a learning round. Passing the writing round moves the word
// into the boxes, due tomorrow.
export function applyLearning(previous, result, given, day, round) {
  const item = { ...(previous || newItem(day)) };
  item.stage = stageOf(previous);
  count(item, result, given);
  if (result === 'correct') {
    item.stage = Math.max(item.stage, round + 1);
    if (item.stage >= GRADUATED) {
      item.box = Math.max(item.box, 1);
      item.due = addDays(day, INTERVALS[1]);
    }
  }
  return item;
}

// A correct answer on an item that is not due yet is recorded but does not
// promote it, so extra practice cannot skip the spacing.
export function applyAnswer(previous, result, given, day) {
  const item = { ...(previous || newItem(day)) };
  const wasDue = item.due <= day;
  count(item, result, given);

  if (result === 'correct') {
    if (wasDue) {
      item.box = Math.min(item.box + 1, TOP_BOX);
      item.due = addDays(day, INTERVALS[item.box]);
    }
  } else if (result === 'almost') {
    if (wasDue) item.due = addDays(day, Math.max(INTERVALS[item.box], 1));
  } else {
    item.box = 1;
    item.due = addDays(day, INTERVALS[1]);
  }
  return item;
}
