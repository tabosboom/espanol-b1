// Leitner scheduling with 6 boxes. Pure functions, no DOM.

export const INTERVALS = [0, 1, 2, 4, 8, 16];
export const LEARNED_BOX = 3;
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

// A correct answer on an item that is not due yet is recorded but does not
// promote it, so extra practice cannot skip the spacing.
export function applyAnswer(previous, result, given, day) {
  const item = { ...(previous || newItem(day)) };
  const wasDue = item.due <= day;
  item.seen += 1;
  item.lastAnswer = String(given ?? '').slice(0, 80);

  if (result === 'correct') {
    item.correct += 1;
    if (wasDue) {
      item.box = Math.min(item.box + 1, TOP_BOX);
      item.due = addDays(day, INTERVALS[item.box]);
    }
  } else if (result === 'almost') {
    item.correct += 0.5;
    if (wasDue) item.due = addDays(day, Math.max(INTERVALS[item.box], 1));
  } else {
    item.wrong += 1;
    item.box = 1;
    item.due = addDays(day, INTERVALS[1]);
  }
  return item;
}
