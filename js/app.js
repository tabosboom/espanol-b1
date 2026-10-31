// Router, tabs and screens.

import { el, es, renderQuestion } from './questions.js';
import {
  buildCheckpoint, buildConversation, buildDailySession, buildGrammarPractice, buildIndex, buildMistakes,
  buildPack, buildQuickReview, buildReading, countDueWords, countMistakes, describeItem, estimateMinutes,
  exchangeIds, moduleAccuracy, nextGrammarModule, readingIds, roundLabel, SENTENCE_ROUND, sentenceStepFor,
} from './session.js';
import {
  accuracyLastDays, addNewWords, addSeconds, exportProgress, flush, importProgress, isLearned,
  isPersistent, load, minutesToday, queueItem, recordAnswer, recordLearning, resetProgress, save,
  saveCheckpoint, setSetting, state, streak,
} from './storage.js';
import { daysBetween, dateString, GRADUATED, stageOf } from './srs.js';

const app = document.getElementById('app');
const MAX_ROUND_RETRIES = 2;
let index = null;
let activeSession = null;

const ICONS = {
  today: 'M12 4v2m0 12v2M4 12h2m12 0h2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  book: 'M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5V5.5ZM12 6v13.5',
  alert: 'M12 4 3 20h18L12 4Zm0 6v5m0 2.5v.5',
  sliders: 'M5 7h9m4 0h1M5 17h1m4 0h9M16 5v4M8 15v4',
  chat: 'M4 5h16v11H9l-5 4V5Zm4 5h8',
  sign: 'M12 3v18M6 6h10l3 2.5L16 11H6V6Zm12 7H8l-3 2.5L8 18h10v-5Z',
  train: 'M7 3h10a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm-2 8h14M8 21l2-3m6 3-2-3M8.5 14.5h.01m7 0h.01',
  bed: 'M3 19v-7m0 3h18v4m0-4v-2a3 3 0 0 0-3-3h-7v5M7 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  fork: 'M7 3v7a2 2 0 0 0 2 2v9M5 3v6m4-6v7M11 3v7a2 2 0 0 1-2 2M17 21v-8m0 0c-2 0-3-2-3-5s1.500-5 3-5v10Z',
  bag: 'M5 8h14l1 13H4L5 8Zm4 3V6a3 3 0 0 1 6 0v5',
  calendar: 'M4 6h16v14H4V6Zm0 5h16M8 3v5m8-5v5',
  home: 'M3 11.500 12 4l9 7.500M6 10v10h12V10M10 20v-6h4v6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v6m0 3v.5',
  work: 'M4 8h16v12H4V8Zm5 0V5h6v3m-11 5h16',
  key: 'M14.500 10a4.500 4.500 0 1 0-3.300 4.300L13 16h2v2h2v2h3v-3l-5.800-5.800c.200-.400.300-.800.300-1.200Z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12.500c-.700-1-1.800-1.500-3-1.500-1.700 0-3 1-3 2.500S10.300 12 12 12s3 1 3 2.500S13.700 17 12 17c-1.200 0-2.300-.5-3-1.500M12 5v14',
  heart: 'M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11Z',
  run: 'M14 5a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3ZM7 11l4-3 3 2 2 3h3M11 8l1 6-3 3-2 4m5-7 3 3v4',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14c1 1.500 2.400 2.200 4 2.200s3-.7 4-2.200M9 9.500v.5m6-.5v.5',
  leaf: 'M5 20c0-9 6-15 15-15 0 9-6 15-15 15Zm0 0 8-8',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3.500 15h1',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  quote: 'M5 7h5v5c0 3-1.500 5-4 5m8-10h5v5c0 3-1.500 5-4 5',
  swap: 'M4 8h13l-3-3m6 11H7l3 3',
  link: 'M9 15l6-6m-5-3 2-2a4 4 0 0 1 6 6l-2 2m-4 4-2 2a4 4 0 0 1-6-6l2-2',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h12l-3-3m4 10v2a3 3 0 0 1-3 3H5l3 3',
  pen: 'M4 20l1-4L16 5l3 3L8 19l-4 1Zm10-13 3 3',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 5-6',
  flame: 'M12 3c1 4 5 5.500 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 1-3-.5-6 1-9.500Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  sprig: 'M4 20C8 14 12 10 20 4M8 15c-2-.2-3.500-1.300-4-3 2-.3 3.500.700 4 3Zm4-4c-2-.2-3.500-1.300-4-3 2-.3 3.500.700 4 3Zm4-3.500c-1.700-.300-3-1.300-3.500-3 2-.2 3.200.800 3.500 3Zm-6 5.500c.3 2 1.500 3.300 3.300 3.800.2-2-.800-3.300-3.300-3.800Zm4-4c.3 2 1.500 3.300 3.300 3.800.2-2-.800-3.300-3.300-3.800Z',
};

const THEME_ICONS = {
  smalltalk: 'chat', directions: 'sign', transport: 'train', accommodation: 'bed', restaurants: 'fork',
  shops: 'bag', plans: 'calendar', everyday: 'home', problems: 'help', work: 'work', housing: 'key',
  money: 'coin', personality: 'heart', health: 'run', feelings: 'smile', nature: 'leaf', technology: 'phone',
  verbs: 'bolt', expressions: 'quote', falsefriends: 'swap', connectors: 'link', repaso: 'repeat',
};

const TABS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'mistakes', label: 'Mistakes', icon: 'alert' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

function icon(name, cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`.trim());
  const shape = document.createElementNS(ns, 'path');
  shape.setAttribute('d', ICONS[name] || ICONS.book);
  svg.append(shape);
  return svg;
}

const iconCircle = (name, tone = 'wine') => el('span', { class: `icon-circle ${tone}` }, icon(name));

function percent(ratio) {
  return ratio === null ? '–' : `${Math.round(ratio * 100)}%`;
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

// ---------- Layout ----------

function page(tab, ...children) {
  const nav = el('nav', { class: 'tabbar', 'aria-label': 'Main' });
  for (const item of TABS) {
    nav.append(
      el(
        'a',
        { href: `#/${item.id}`, class: item.id === tab ? 'tab active' : 'tab', 'aria-current': item.id === tab ? 'page' : null },
        icon(item.icon),
        el('span', {}, item.label)
      )
    );
  }
  app.replaceChildren(el('main', { class: 'page' }, children), nav);
  window.scrollTo(0, 0);
}

function backLink(href, label) {
  return el('a', { class: 'back', href }, `‹ ${label}`);
}

// A card with a coloured title band, as on the layout example.
function panel(title, tone, ...children) {
  return el('section', { class: `panel ${tone}` }, el('h2', { class: 'panel-head' }, title), el('div', { class: 'panel-body' }, children));
}

function statTile(iconName, value, label, tone) {
  return el(
    'div',
    { class: 'stat' },
    iconCircle(iconName, tone),
    el('div', {}, el('strong', {}, String(value)), el('span', {}, label))
  );
}

function goalRing(minutes, goal) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');
  const circle = (cls, dash) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '18');
    c.setAttribute('cy', '18');
    c.setAttribute('r', '15.9');
    c.setAttribute('class', cls);
    if (dash !== undefined) c.setAttribute('stroke-dasharray', `${dash} 100`);
    return c;
  };
  svg.append(circle('ring-bg'));
  if (minutes > 0) svg.append(circle('ring-fg', Math.min(100, (minutes / goal) * 100)));
  return svg;
}

// ---------- Today ----------

function allWordIds() {
  return index.themes.flatMap((t) => t.packs.flatMap((p) => p.entries.map((e) => e.id)));
}

function planText() {
  const day = daysBetween(state.startDate, dateString()) + 1;
  if (day > 14) return 'Two-week plan finished. Keep up with your reviews.';
  const focus = day <= 7
    ? 'Focus: priority vocabulary themes and grammar G1–G4, then Checkpoint 1.'
    : 'Focus: core B1 themes and grammar G5–G8, then Checkpoint 2.';
  return `Day ${day} of 14. Suggested: 30–60 minutes in 2–4 sessions. ${focus}`;
}

// A phrase from the words studied so far; the same one all day.
function phraseOfDay() {
  const started = allWordIds().filter((id) => state.items[id]?.seen);
  const pool = started.length ? started : allWordIds().slice(0, 20);
  const seed = [...dateString()].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7) >>> 0;
  return index.byId.get(pool[seed % pool.length])?.entry;
}

function renderToday() {
  const learned = allWordIds().filter(isLearned).length;
  const minutes = minutesToday();
  const goal = state.settings.goalMinutes;
  const phrase = phraseOfDay();
  const estimate = estimateMinutes(buildDailySession(index));
  const grammarMod = nextGrammarModule(index);
  page(
    'today',
    el(
      'header',
      { class: 'hero' },
      el('div', {}, el('p', { class: 'hero-small' }, 'Tu'), el('p', { class: 'hero-script', lang: 'es' }, 'español'), el('p', { class: 'hero-sub' }, 'From A2 to B1')),
      phrase ? el('div', { class: 'bubble-note' }, es(phrase.es), el('span', {}, phrase.en)) : null,
      icon('sprig', 'sprig')
    ),
    el('button', { class: 'btn primary big', type: 'button', onclick: () => startSession(buildDailySession(index), 'Vocabulary') }, `Vocabulary session · about ${estimate} min`),
    el('button', { class: 'btn accent', type: 'button', onclick: () => startSession(buildGrammarPractice(index, grammarMod), grammarMod.title) }, `Grammar: ${grammarMod.title}`),
    el('button', { class: 'btn', type: 'button', onclick: () => startSession(buildQuickReview(index), 'Quick review') }, '5-minute word review'),
    el(
      'div',
      { class: 'goal' },
      goalRing(minutes, goal),
      el('p', {}, `${minutes} of ${goal} minutes today`)
    ),
    el(
      'div',
      { class: 'stats' },
      statTile('flame', streak(), 'day streak', 'gold'),
      statTile('clock', countDueWords(index), 'words due', 'wine'),
      statTile('check', learned, 'words learned', 'wine'),
      statTile('target', percent(accuracyLastDays(7)), 'accuracy this week', 'gold')
    ),
    panel('Your two weeks', 'gold', el('p', {}, planText())),
    isPersistent() ? null : el('p', { class: 'warning' }, 'This browser is blocking storage, so progress will be lost when the app closes.')
  );
}

// ---------- Learn ----------

function moduleCard(number, iconName, title, subtitle, done, total, target) {
  const body = [
    el('span', { class: 'card-top' }, el('span', { class: 'badge' }, String(number)), iconCircle(iconName, number % 2 ? 'wine' : 'gold')),
    el('span', { class: 'card-title' }, title),
    el('span', { class: 'dotted' }),
    el('span', { class: 'row-sub' }, subtitle),
    el('span', { class: 'bar' }, el('span', { style: `width:${total ? (done / total) * 100 : 0}%` })),
  ];
  return typeof target === 'string'
    ? el('a', { class: 'module-card', href: target }, body)
    : el('button', { class: 'module-card', type: 'button', onclick: target }, body);
}

function themeStats(ids) {
  const seen = ids.filter((id) => state.items[id]?.seen).length;
  const learned = ids.filter(isLearned).length;
  return { seen, learned, accuracy: moduleAccuracy(ids) };
}

const grid = (...cards) => el('div', { class: 'card-grid' }, cards);

function renderLearn() {
  const themes = [...index.themes].sort((a, b) => a.priority - b.priority);
  const lastAttempt = (id) => (state.checkpoints[id] || []).slice(-1)[0];
  page(
    'learn',
    el('h1', {}, 'Learn'),
    panel('Vocabulary', 'wine', grid(themes.map((theme, i) => {
      const ids = theme.packs.flatMap((p) => p.entries.map((e) => e.id));
      const s = themeStats(ids);
      return moduleCard(i + 1, THEME_ICONS[theme.id], theme.title, `${s.learned} of ${ids.length} learned`, s.seen, ids.length, `#/learn/theme/${theme.id}`);
    }))),
    panel('Grammar', 'gold', grid(index.grammar.map((mod, i) => {
      const ids = mod.items.map((item) => item.id);
      const s = themeStats(ids);
      return moduleCard(i + 1, mod.id === 'fix' ? 'pen' : 'book', mod.title, `${s.seen} of ${ids.length} · ${percent(s.accuracy)}`, s.seen, ids.length, `#/learn/grammar/${mod.id}`);
    }))),
    panel('Conversations', 'wine', grid(index.conversations.map((conv, i) => {
      const ids = exchangeIds(conv);
      const seen = ids.filter((id) => state.items[id]?.seen).length;
      return moduleCard(i + 1, 'chat', conv.title, state.conversationsDone[conv.id] ? `Done · ${percent(moduleAccuracy(ids))}` : 'Not finished', seen, ids.length, () => startConversation(conv));
    }))),
    panel('Reading', 'gold', index.reading.length
      ? grid(index.reading.map((text, i) => {
          const ids = readingIds(text);
          const seen = ids.filter((id) => state.items[id]?.seen).length;
          return moduleCard(i + 1, 'book', text.title, seen ? `${seen} of ${ids.length} · ${percent(moduleAccuracy(ids))}` : `${ids.length} questions`, seen, ids.length, () => startSession(buildReading(text), text.title));
        }))
      : el('p', { class: 'muted' }, 'No texts yet.')),
    panel('Checkpoints', 'wine', index.checkpoints.length
      ? grid(index.checkpoints.map((cp, i) => {
          const last = lastAttempt(cp.id);
          return moduleCard(i + 1, 'target', cp.title, last ? `Last: ${percent(last.score / last.total)}` : cp.when, last ? 1 : 0, 1, `#/learn/checkpoint/${cp.id}`);
        }))
      : el('p', { class: 'muted' }, 'No tests yet.'))
  );
}

function renderTheme(themeId) {
  const theme = index.themes.find((t) => t.id === themeId);
  if (!theme) return navigate('#/learn');
  const ids = theme.packs.flatMap((p) => p.entries.map((e) => e.id));
  const s = themeStats(ids);
  page(
    'learn',
    backLink('#/learn', 'Learn'),
    el('h1', {}, theme.title),
    el('p', { class: 'subtitle' }, es(theme.es), ` · ${s.learned} of ${ids.length} learned`),
    el('p', { class: 'muted' }, 'Each word takes three rounds: recognise it, recall it, write it. Words you miss also get a sentence round.'),
    grid(theme.packs.map((pack, i) => {
      const packIds = pack.entries.map((e) => e.id);
      const finished = packIds.filter((id) => stageOf(state.items[id]) >= GRADUATED).length;
      return moduleCard(i + 1, THEME_ICONS[theme.id], pack.title, finished === packIds.length ? 'All done · review' : `${finished} of ${packIds.length} words`, finished, packIds.length, () => startSession(buildPack(index, pack), pack.title));
    }))
  );
}

function ruleCard(mod) {
  const { rule } = mod;
  return el(
    'div',
    { class: 'rule' },
    el('p', {}, rule.intro),
    (rule.points || []).map((point, i) =>
      el(
        'div',
        { class: 'rule-point' },
        el('div', { class: 'rule-title' }, el('span', { class: 'badge' }, String(i + 1)), el('strong', { lang: 'es' }, point.title)),
        el('span', { class: 'dotted' }),
        point.examples.map((e) => el('p', { class: 'rule-ex' }, es(e[0]), el('span', { class: 'rule-en' }, e[1])))
      )
    ),
    rule.watch ? el('p', { class: 'watch' }, el('strong', {}, 'Watch out: '), rule.watch) : null
  );
}

function renderGrammar(modId) {
  const mod = index.grammar.find((m) => m.id === modId);
  if (!mod) return navigate('#/learn');
  const ids = mod.items.map((i) => i.id);
  const s = themeStats(ids);
  page(
    'learn',
    backLink('#/learn', 'Learn'),
    el('h1', {}, mod.title),
    el('p', { class: 'subtitle' }, `${s.seen} of ${ids.length} items done · accuracy ${percent(s.accuracy)}`),
    el('button', { class: 'btn primary', type: 'button', onclick: () => startSession(buildGrammarPractice(index, mod), mod.title) }, 'Practise 12 items'),
    panel('The rule', 'gold', ruleCard(mod))
  );
  state.rulesSeen[mod.id] = true;
  save();
}

function renderCheckpoint(id) {
  const cp = index.checkpoints.find((c) => c.id === id);
  if (!cp) return navigate('#/learn');
  const attempts = state.checkpoints[cp.id] || [];
  const steps = buildCheckpoint(index, cp);
  page(
    'learn',
    backLink('#/learn', 'Learn'),
    el('h1', {}, cp.title),
    el('p', { class: 'subtitle' }, `${steps.length} questions · about 25 minutes · ${cp.when}`),
    el('p', { class: 'muted' }, 'No feedback until the end. This test does not change your review schedule.'),
    el('button', { class: 'btn primary', type: 'button', onclick: () => startSession(buildCheckpoint(index, cp), cp.title, { checkpoint: cp }) }, attempts.length ? 'Take it again' : 'Start the test'),
    attempts.length
      ? panel('Your results', 'wine', attempts.map((a, i) => attemptCard(a, attempts[i - 1])))
      : null
  );
}

function attemptCard(attempt, previous) {
  const before = (name) => previous?.sections.find((s) => s.name === name);
  return el(
    'div',
    { class: 'attempt' },
    el('p', { class: 'attempt-head' }, el('strong', {}, percent(attempt.score / attempt.total)), ` · ${attempt.date}`),
    attempt.sections.map((section) => {
      const old = before(section.name);
      return el(
        'div',
        { class: 'section-score' },
        el('span', {}, section.name),
        el('span', {}, `${section.score}/${section.total}${old ? ` (was ${old.score})` : ''}`)
      );
    })
  );
}

// ---------- Mistakes ----------

function renderMistakes() {
  const groups = new Map();
  for (const id of Object.keys(state.mistakes)) {
    const info = describeItem(index, id);
    if (!info) continue;
    if (!groups.has(info.module)) groups.set(info.module, []);
    groups.get(info.module).push(info);
  }
  const count = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
  page(
    'mistakes',
    el('h1', {}, 'Mistakes'),
    count
      ? [
          el('p', { class: 'subtitle' }, `${plural(count, 'item')} from the last 30 days. An item leaves this list after 2 correct answers in a row.`),
          [['vocab', 'Practise word mistakes'], ['grammar', 'Practise grammar mistakes'], ['other', 'Practise conversation and reading mistakes']]
            .filter(([kind]) => countMistakes(index, kind) > 0)
            .map(([kind, label]) => el('button', { class: 'btn primary', type: 'button', onclick: () => startSession(buildMistakes(index, kind), 'Mistakes') }, `${label} (${countMistakes(index, kind)})`)),
          [...groups.entries()].map(([module, list]) =>
            panel(module, 'wine', list.map((info) => el('div', { class: 'list-row' }, es(info.title), el('span', { class: 'row-sub' }, info.detail))))
          ),
        ]
      : el('p', { class: 'muted' }, 'No mistakes in the last 30 days.')
  );
}

// ---------- Settings ----------

function segmented(values, current, onChange, format = String) {
  const group = el('div', { class: 'segmented' });
  for (const value of values) {
    group.append(
      el(
        'button',
        {
          type: 'button',
          class: value === current ? 'seg active' : 'seg',
          'aria-pressed': value === current ? 'true' : 'false',
          onclick: () => {
            onChange(value);
            renderSettings();
          },
        },
        format(value)
      )
    );
  }
  return group;
}

function renderSettings() {
  const status = el('p', { class: 'status', role: 'status' });
  const exportBox = el('textarea', { class: 'backup', rows: 4, readonly: true, hidden: true, 'aria-label': 'Exported progress' });
  const importBox = el('textarea', { class: 'backup', rows: 4, placeholder: 'Paste an export here', 'aria-label': 'Progress to import', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });

  const doExport = async () => {
    const text = exportProgress();
    exportBox.value = text;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Progress copied to the clipboard.';
    } catch {
      exportBox.hidden = false;
      exportBox.select();
      status.textContent = 'Could not reach the clipboard. Copy the text below instead.';
    }
    if (navigator.share) shareButton.hidden = false;
  };
  const shareButton = el('button', {
    class: 'btn',
    type: 'button',
    hidden: true,
    onclick: () => navigator.share({ title: 'Español B1 progress', text: exportBox.value }).catch(() => {}),
  }, 'Share export');

  const doImport = () => {
    if (!importBox.value.trim()) {
      status.textContent = 'Paste an export first.';
      return;
    }
    try {
      importProgress(importBox.value.trim());
      renderSettings();
      document.querySelector('.status').textContent = 'Progress imported.';
    } catch (error) {
      status.textContent = error.message;
    }
  };

  let resetArmed = false;
  const resetButton = el('button', {
    class: 'btn danger',
    type: 'button',
    onclick: () => {
      if (!resetArmed) {
        resetArmed = true;
        resetButton.textContent = 'Tap again to erase all progress';
        return;
      }
      resetProgress();
      renderSettings();
      document.querySelector('.status').textContent = 'Progress erased.';
    },
  }, 'Reset progress');

  page(
    'settings',
    el('h1', {}, 'Settings'),
    panel('Daily goal', 'wine', segmented([5, 10, 15, 20], state.settings.goalMinutes, (v) => setSetting('goalMinutes', v), (v) => `${v} min`)),
    panel('New words per session', 'gold', segmented([5, 8, 10, 12, 15], state.settings.newWords, (v) => setSetting('newWords', v)), el('p', { class: 'muted hint' }, 'Each new word takes three rounds, so 8 words is about 24 questions.')),
    panel(
      'Sentence round',
      'wine',
      segmented(['missed', 'off'], state.settings.sentenceRound, (v) => setSetting('sentenceRound', v), (v) => (v === 'missed' ? 'Missed words' : 'Off')),
      el('p', { class: 'muted hint' }, 'Tap a word into a sentence as extra practice, only for words you got wrong.')
    ),
    panel(
      'Backup',
      'wine',
      el('p', { class: 'muted' }, 'Progress is stored only on this phone. Export it now and then in case iOS clears the data.'),
      el('button', { class: 'btn', type: 'button', onclick: doExport }, 'Export progress'),
      shareButton,
      exportBox,
      importBox,
      el('button', { class: 'btn', type: 'button', onclick: doImport }, 'Import progress'),
      status
    ),
    panel('Reset', 'gold', resetButton),
    el('p', { class: 'muted version' }, `Content version ${index.version}`)
  );
}

// ---------- Session runner ----------

function startConversation(conv) {
  startSession(buildConversation(conv), conv.title, { conversation: conv });
}

function startSession(steps, title, extra = {}) {
  if (!steps.length) {
    showNothingToDo();
    return;
  }
  activeSession = {
    steps, title, conversation: null, checkpoint: null, ...extra, at: 0, startedAt: Date.now(), answered: 0, credit: 0, newWords: 0, missed: [], examResults: [], counted: false,
  };
  showStep();
}

function showNothingToDo() {
  page(
    'today',
    el('h1', {}, 'Nothing to practise'),
    el('p', { class: 'muted' }, 'There are no items for this right now.'),
    el('a', { class: 'btn primary', href: '#/today' }, 'Back to Today')
  );
}

function countTime(session) {
  if (session.counted) return 0;
  session.counted = true;
  const seconds = Math.round((Date.now() - session.startedAt) / 1000);
  addSeconds(seconds);
  addNewWords(session.newWords);
  return seconds;
}

function closeSession() {
  countTime(activeSession);
  activeSession = null;
  flush();
  location.hash = '#/today';
  route();
}

function sessionHeader(session) {
  return el(
    'header',
    { class: 'session-head' },
    el('button', { class: 'close', type: 'button', 'aria-label': 'Save and exit', onclick: closeSession }, '×'),
    el(
      'div',
      { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(session.steps.length), 'aria-valuenow': String(session.at) },
      el('div', { style: `width:${(session.at / session.steps.length) * 100}%` })
    ),
    el('span', { class: 'progress-count' }, `${session.at + 1}/${session.steps.length}`)
  );
}

function showStep() {
  const session = activeSession;
  if (session.at >= session.steps.length) {
    showEnd();
    return;
  }
  const step = session.steps[session.at];
  const card = el('section', { class: 'card' });
  app.replaceChildren(el('div', { class: 'session' }, sessionHeader(session), card));
  window.scrollTo(0, 0);
  if (step.kind === 'intro') {
    showIntro(step, card);
    return;
  }
  renderQuestion(step.question, card, (outcome) => onAnswered(step, outcome));
}

function nextStep() {
  activeSession.at += 1;
  showStep();
}

function showIntro(step, card) {
  const { entry } = step;
  card.append(
    el(
      'div',
      { class: 'word-card' },
      el('p', { class: 'tag round' }, `New word · ${roundLabel(0)}`),
      el('p', { class: 'intro-es' }, es(entry.es)),
      el('span', { class: 'dotted' }),
      el('p', { class: 'intro-en' }, entry.en),
      el('p', { class: 'intro-example' }, es(entry.ex), entry.exEn ? el('span', { class: 'sentence-en' }, entry.exEn) : null),
      entry.note ? el('p', { class: 'muted' }, entry.note) : null
    ),
    el('button', { class: 'btn primary', type: 'button', onclick: nextStep }, 'Continue')
  );
}

function record(step, id, result, given, session) {
  const first = step.round !== undefined
    ? recordLearning(id, step.module, result, given, step.round)
    : recordAnswer(id, step.module, result, given);
  if (first && index.byId.get(id)?.kind === 'vocab') session.newWords += 1;
}

// A missed word comes back at the end of its round. Other missed items come back
// once at the end of the session, without counting a second time.
function scheduleRetry(session, step) {
  if (step.round !== undefined) {
    const retries = step.retries || 0;
    if (retries >= MAX_ROUND_RETRIES) return;
    let last = session.at;
    for (let i = session.at + 1; i < session.steps.length; i += 1) {
      if (session.steps[i].round === step.round) last = i;
    }
    session.steps.splice(last + 1, 0, { ...step, retries: retries + 1, question: { ...step.question, tag: 'Once more' } });
    addSentenceStep(session, step, last + 1);
  } else if (step.retryable) {
    session.steps.push({ ...step, retryable: false, again: true, question: { ...step.question, tag: 'Try again' } });
  }
}

// Before the writing round, or just before the retry when writing was the miss.
function addSentenceStep(session, step, retryAt) {
  const id = step.ids[0];
  if (step.round === SENTENCE_ROUND || session.steps.some((s) => s.round === SENTENCE_ROUND && s.ids[0] === id)) return;
  const sentence = sentenceStepFor(index, id);
  if (!sentence) return;
  const firstWriting = session.steps.findIndex((s, i) => i > session.at && s.round > SENTENCE_ROUND);
  const at = step.round > SENTENCE_ROUND ? retryAt : (firstWriting >= 0 ? firstWriting : session.steps.length);
  session.steps.splice(at, 0, sentence);
}

function onAnswered(step, outcome) {
  const session = activeSession;
  if (step.exam) {
    session.examResults.push({ section: step.section, result: outcome.result, prompt: promptOf(step.question), answer: outcome.answer, given: outcome.given });
    session.answered += 1;
    nextStep();
    return;
  }
  if (!step.again && !step.practice) {
    const perId = outcome.results || Object.fromEntries(step.ids.map((id) => [id, outcome.result]));
    for (const [id, result] of Object.entries(perId)) record(step, id, result, outcome.given, session);
  } else if (step.round !== undefined) {
    record(step, step.ids[0], outcome.result, outcome.given, session);
  }
  if (!step.again && step.retries === undefined && !step.practice) {
    session.answered += 1;
    session.credit += outcome.result === 'correct' ? 1 : outcome.result === 'almost' ? 0.5 : 0;
    if (outcome.result !== 'correct') {
      session.missed.push({ prompt: promptOf(step.question), answer: outcome.answer });
    }
  }
  if (outcome.result !== 'correct') scheduleRetry(session, step);
  showFeedback(step, outcome);
}

function promptOf(q) {
  if (q.type === 'match') return 'Match the pairs';
  if (q.type === 'dialogue') return q.context[q.context.length - 1]?.es || q.setting;
  if (q.type === 'read') return q.question.prompt;
  return q.sentence || q.prompt || '';
}

const FEEDBACK_LABEL = {
  correct: 'Correct',
  almost: 'Almost: wrong article',
  wrong: 'Not quite',
};

function showFeedback(step, outcome) {
  const q = step.question;
  const answerLines = String(outcome.answer).split('\n');
  const showAnswer = outcome.result !== 'correct' && !q.completed && (!q.meaning || q.type === 'dialogue');
  const mod = index.grammar.find((m) => m.id === step.module);
  const ruleBox = mod ? el('div', { class: 'feedback-rule', hidden: true }, ruleCard(mod)) : null;
  const label = outcome.spelled ? `Correct — spelled: ${outcome.spelled}`
    : outcome.withArticle ? `Correct — with article: ${outcome.withArticle}`
    : FEEDBACK_LABEL[outcome.result];
  const go = el('button', { class: 'btn continue', type: 'button', onclick: nextStep }, 'Continue');
  const panelNode = el(
    'div',
    { class: `feedback ${outcome.result}`, role: 'status' },
    el('p', { class: 'feedback-label' }, label),
    outcome.why && outcome.result !== 'correct' ? el('p', { class: 'feedback-ex' }, outcome.why) : null,
    showAnswer ? answerLines.map((line) => el('p', { class: 'feedback-answer' }, es(line))) : null,
    q.meaning && q.type !== 'gapBank' && q.type !== 'gap' ? el('p', { class: 'feedback-ex' }, q.meaning) : null,
    q.completed
      ? el('p', { class: 'feedback-sentence' }, es(q.completed), q.sentenceEn ? el('span', { class: 'sentence-en' }, q.sentenceEn) : null)
      : null,
    q.ex ? el('p', { class: 'feedback-ex' }, q.ex) : null,
    mod ? el('button', { class: 'link-btn', type: 'button', onclick: () => { ruleBox.hidden = !ruleBox.hidden; } }, 'Show the rule') : null,
    ruleBox,
    go
  );
  document.querySelector('.session').append(panelNode);
  const card = document.querySelector('.card');
  requestAnimationFrame(() => {
    panelNode.classList.add('open');
    card.style.paddingBottom = `${panelNode.offsetHeight + 24}px`;
  });
  setTimeout(() => go.focus({ preventScroll: true }), 60);
}

function finishCheckpoint(session) {
  const sections = [];
  for (const row of session.examResults) {
    let section = sections.find((s) => s.name === row.section);
    if (!section) {
      section = { name: row.section, score: 0, total: 0 };
      sections.push(section);
    }
    section.total += 1;
    section.score += row.result === 'correct' ? 1 : row.result === 'almost' ? 0.5 : 0;
  }
  const attempt = {
    date: dateString(),
    score: sections.reduce((sum, s) => sum + s.score, 0),
    total: sections.reduce((sum, s) => sum + s.total, 0),
    sections,
  };
  saveCheckpoint(session.checkpoint.id, attempt);
  return attempt;
}

function exitButton() {
  return el('button', { class: 'btn primary', type: 'button', onclick: () => { activeSession = null; location.hash = '#/today'; route(); } }, 'Done');
}

function showEnd() {
  const session = activeSession;
  const seconds = countTime(session);
  const minutes = Math.floor(seconds / 60);
  const time = `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  if (session.checkpoint) {
    const attempt = finishCheckpoint(session);
    const attempts = state.checkpoints[session.checkpoint.id];
    const wrong = session.examResults.filter((r) => r.result !== 'correct');
    app.replaceChildren(
      el(
        'main',
        { class: 'page end' },
        el('h1', {}, `${session.title}: results`),
        panel('Score per section', 'wine', attemptCard(attempt, attempts[attempts.length - 2])),
        el('p', { class: 'muted' }, `Time: ${time}`),
        wrong.length
          ? panel('To review', 'gold', wrong.map((m) => el('div', { class: 'list-row' }, m.prompt ? es(m.prompt) : null, el('span', { class: 'row-sub' }, `${m.answer}${m.given ? ` · you: ${m.given}` : ''}`))))
          : null,
        exitButton()
      )
    );
    window.scrollTo(0, 0);
    return;
  }
  const { conversation } = session;
  if (conversation) {
    state.conversationsDone[conversation.id] = true;
    for (const phrase of conversation.phrases) {
      if (phrase[2] && index.byId.has(phrase[2])) queueItem(phrase[2]);
    }
    save();
  }
  flush();
  const score = session.answered ? session.credit / session.answered : null;
  app.replaceChildren(
    el(
      'main',
      { class: 'page end' },
      el('h1', {}, `${session.title} finished`),
      el(
        'div',
        { class: 'stats' },
        statTile('target', percent(score), 'first-try score', 'gold'),
        statTile('clock', time, 'time', 'wine'),
        statTile('check', session.newWords, 'new words', 'wine'),
        statTile('alert', session.missed.length, 'missed', 'gold')
      ),
      conversation
        ? panel('Useful phrases', 'gold', conversation.phrases.map((p) => el('div', { class: 'list-row' }, es(p[0]), el('span', { class: 'row-sub' }, p[1]))))
        : null,
      session.missed.length
        ? panel('Missed first time', 'wine', session.missed.map((m) =>
            el('div', { class: 'list-row' }, m.prompt ? es(m.prompt) : null, el('span', { class: 'row-sub' }, m.answer.replaceAll('\n', ' · ')))
          ))
        : null,
      exitButton()
    )
  );
  window.scrollTo(0, 0);
}

// ---------- Router ----------

function navigate(hash) {
  location.hash = hash;
}

function route() {
  if (activeSession) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'learn' && parts[1] === 'theme') renderTheme(parts[2]);
  else if (parts[0] === 'learn' && parts[1] === 'grammar') renderGrammar(parts[2]);
  else if (parts[0] === 'learn' && parts[1] === 'checkpoint') renderCheckpoint(parts[2]);
  else if (parts[0] === 'learn') renderLearn();
  else if (parts[0] === 'mistakes') renderMistakes();
  else if (parts[0] === 'settings') renderSettings();
  else renderToday();
}

// ---------- Content and service worker ----------

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function loadContent() {
  if (window.TRAINER_CONTENT) return window.TRAINER_CONTENT;
  const manifest = await loadJson('./content/index.json');
  const [themes, grammar, conversations, reading, checkpoints] = await Promise.all([
    Promise.all(manifest.vocab.map((file) => loadJson(`./content/${file}`))),
    Promise.all(manifest.grammar.map((file) => loadJson(`./content/${file}`))),
    loadJson(`./content/${manifest.conversations}`),
    loadJson(`./content/${manifest.reading}`),
    loadJson(`./content/${manifest.checkpoints}`),
  ]);
  return { version: manifest.version, themes, grammar, conversations, reading, checkpoints };
}

function showBanner(id, text, onClick) {
  document.getElementById(id)?.remove();
  const banner = onClick
    ? el('button', { id, class: 'banner action', type: 'button', onclick: onClick }, text)
    : el('div', { id, class: 'banner', role: 'status' }, text);
  document.body.append(banner);
  return banner;
}

function registerServiceWorker() {
  if (window.TRAINER_CONTENT || !('serviceWorker' in navigator)) return;
  let reloading = false;
  let updateRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  const offerUpdate = (worker) => {
    showBanner('update-bar', 'Update available, tap to reload', () => {
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    registration.update().catch(() => {});
  }).catch(() => {});
  navigator.serviceWorker.ready.then(() => {
    const banner = showBanner('offline-note', 'Ready offline');
    setTimeout(() => banner.remove(), 2500);
  });
}

async function start() {
  load();
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  registerServiceWorker();
  try {
    index = buildIndex(await loadContent());
  } catch (error) {
    app.replaceChildren(
      el('main', { class: 'page' }, el('h1', {}, 'Could not load the content'), el('p', {}, 'Open the app once with a connection so it can save everything for offline use.'), el('p', { class: 'muted' }, String(error.message)))
    );
    return;
  }
  route();
}

start();
