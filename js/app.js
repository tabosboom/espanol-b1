// Router, tabs and screens.

import { el, es, renderQuestion } from './questions.js';
import {
  buildConversation, buildDailySession, buildGrammarPractice, buildIndex, buildMistakes, buildPack,
  buildQuickReview, countDueWords, describeItem, exchangeIds, moduleAccuracy,
} from './session.js';
import {
  accuracyLastDays, addNewWords, addSeconds, exportProgress, flush, importProgress, isLearned,
  isPersistent, load, minutesToday, queueItem, recordAnswer, resetProgress, save, setSetting, state, streak,
} from './storage.js';
import { daysBetween, dateString } from './srs.js';

const app = document.getElementById('app');
let index = null;
let activeSession = null;

const TABS = [
  { id: 'today', label: 'Today', icon: 'M12 4v2m0 12v2M4 12h2m12 0h2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' },
  { id: 'learn', label: 'Learn', icon: 'M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8 -.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5V5.5ZM12 6v13.5' },
  { id: 'mistakes', label: 'Mistakes', icon: 'M12 4 3 20h18L12 4Zm0 6v5m0 2.5v.5' },
  { id: 'settings', label: 'Settings', icon: 'M5 7h9m4 0h1M5 17h1m4 0h9M16 5v4M8 15v4' },
];

function icon(path) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(ns, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

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

function statTile(value, label) {
  return el('div', { class: 'stat' }, el('strong', {}, String(value)), el('span', {}, label));
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
    ? 'Priority vocabulary themes and verbs + prepositions, then Checkpoint 1.'
    : 'Core B1 themes and the remaining grammar, then Checkpoint 2.';
  return `Day ${day} of 14. Suggested: 30–60 minutes in 2–4 sessions. ${focus}`;
}

function renderToday() {
  const learned = allWordIds().filter(isLearned).length;
  const minutes = minutesToday();
  const goal = state.settings.goalMinutes;
  page(
    'today',
    el('h1', {}, 'Today'),
    el(
      'div',
      { class: 'goal' },
      goalRing(minutes, goal),
      el('p', {}, `${minutes} of ${goal} minutes today`)
    ),
    el('button', { class: 'btn primary big', type: 'button', onclick: () => startSession(buildDailySession(index), 'Session') }, `Start session (about ${goal} min)`),
    el('button', { class: 'btn', type: 'button', onclick: () => startSession(buildQuickReview(index), 'Quick review') }, '5-minute quick review'),
    el(
      'div',
      { class: 'stats' },
      statTile(streak(), 'day streak'),
      statTile(countDueWords(index), 'words due'),
      statTile(learned, 'words learned'),
      statTile(percent(accuracyLastDays(7)), 'accuracy this week')
    ),
    el('p', { class: 'plan' }, planText()),
    isPersistent() ? null : el('p', { class: 'warning' }, 'This browser is blocking storage, so progress will be lost when the app closes.')
  );
}

// ---------- Learn ----------

function progressRow(href, title, subtitle, done, total, onClick) {
  const bar = el('div', { class: 'bar' }, el('div', { style: `width:${total ? (done / total) * 100 : 0}%` }));
  const body = [el('span', { class: 'row-title' }, title), el('span', { class: 'row-sub' }, subtitle), bar];
  return href
    ? el('a', { class: 'row', href }, body)
    : el('button', { class: 'row', type: 'button', onclick: onClick }, body);
}

function themeStats(ids) {
  const seen = ids.filter((id) => state.items[id]?.seen).length;
  const learned = ids.filter(isLearned).length;
  return { seen, learned, accuracy: moduleAccuracy(ids) };
}

function renderLearn() {
  const themes = [...index.themes].sort((a, b) => a.priority - b.priority);
  page(
    'learn',
    el('h1', {}, 'Learn'),
    el('h2', {}, 'Vocabulary'),
    themes.map((theme) => {
      const ids = theme.packs.flatMap((p) => p.entries.map((e) => e.id));
      const s = themeStats(ids);
      return progressRow(`#/learn/theme/${theme.id}`, theme.title, `${s.seen} of ${ids.length} words seen · ${s.learned} learned · accuracy ${percent(s.accuracy)}`, s.seen, ids.length);
    }),
    el('h2', {}, 'Grammar'),
    index.grammar.map((mod) => {
      const ids = mod.items.map((i) => i.id);
      const s = themeStats(ids);
      return progressRow(`#/learn/grammar/${mod.id}`, mod.title, `${s.seen} of ${ids.length} items done · accuracy ${percent(s.accuracy)}`, s.seen, ids.length);
    }),
    el('h2', {}, 'Conversations'),
    index.conversations.map((conv) => {
      const ids = exchangeIds(conv);
      const seen = ids.filter((id) => state.items[id]?.seen).length;
      return progressRow(null, conv.title, `${state.conversationsDone[conv.id] ? 'Done' : 'Not finished'} · accuracy ${percent(moduleAccuracy(ids))}`, seen, ids.length, () => startConversation(conv));
    }),
    el('h2', {}, 'Reading'),
    el('p', { class: 'muted' }, index.reading.length ? '' : 'No texts yet. They arrive in a later update.'),
    el('h2', {}, 'Checkpoints'),
    el('p', { class: 'muted' }, 'No tests yet. They arrive in a later update.')
  );
}

function renderTheme(themeId) {
  const theme = index.themes.find((t) => t.id === themeId);
  if (!theme) return navigate('#/learn');
  page(
    'learn',
    backLink('#/learn', 'Learn'),
    el('h1', {}, theme.title),
    el('p', { class: 'subtitle' }, es(theme.es)),
    theme.packs.map((pack) => {
      const ids = pack.entries.map((e) => e.id);
      const s = themeStats(ids);
      return progressRow(null, pack.title, `${s.seen} of ${ids.length} seen · ${s.learned} learned · accuracy ${percent(s.accuracy)}`, s.seen, ids.length, () => startSession(buildPack(index, pack), pack.title));
    })
  );
}

function ruleCard(mod) {
  const { rule } = mod;
  return el(
    'section',
    { class: 'rule' },
    el('p', {}, rule.intro),
    (rule.points || []).map((point) =>
      el('div', { class: 'rule-point' }, el('strong', {}, point.title), point.examples.map((e) => el('p', { class: 'rule-ex' }, es(e[0]), el('span', { class: 'rule-en' }, e[1]))))
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
    ruleCard(mod)
  );
  state.rulesSeen[mod.id] = true;
  save();
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
          el('button', { class: 'btn primary', type: 'button', onclick: () => startSession(buildMistakes(index), 'Mistakes') }, 'Practise all mistakes'),
          [...groups.entries()].map(([module, list]) => [
            el('h2', {}, module),
            list.map((info) => el('div', { class: 'mistake' }, es(info.title), el('span', { class: 'row-sub' }, info.detail))),
          ]),
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
    el('h2', {}, 'Daily goal'),
    segmented([5, 10, 15, 20], state.settings.goalMinutes, (v) => setSetting('goalMinutes', v), (v) => `${v} min`),
    el('h2', {}, 'New words per session'),
    segmented([5, 8, 10, 12, 15], state.settings.newWords, (v) => setSetting('newWords', v)),
    el('h2', {}, 'Backup'),
    el('p', { class: 'muted' }, 'Progress is stored only on this phone. Export it now and then in case iOS clears the data.'),
    el('button', { class: 'btn', type: 'button', onclick: doExport }, 'Export progress'),
    shareButton,
    exportBox,
    importBox,
    el('button', { class: 'btn', type: 'button', onclick: doImport }, 'Import progress'),
    status,
    el('h2', {}, 'Reset'),
    resetButton,
    el('p', { class: 'muted version' }, `Content version ${index.version}`)
  );
}

// ---------- Session runner ----------

function startConversation(conv) {
  startSession(buildConversation(conv), conv.title, conv);
}

function startSession(steps, title, conversation = null) {
  if (!steps.length) {
    showNothingToDo();
    return;
  }
  activeSession = {
    steps, title, conversation, at: 0, startedAt: Date.now(), answered: 0, credit: 0, newWords: 0, missed: [], counted: false,
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
    )
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
    el('p', { class: 'tag new' }, 'New word'),
    el('p', { class: 'intro-es' }, es(entry.es)),
    el('p', { class: 'intro-en' }, entry.en),
    el('p', { class: 'intro-example' }, es(entry.ex)),
    entry.note ? el('p', { class: 'muted' }, entry.note) : null,
    el('button', { class: 'btn primary', type: 'button', onclick: nextStep }, 'Continue')
  );
}

function onAnswered(step, outcome) {
  const session = activeSession;
  const perId = outcome.results || Object.fromEntries(step.ids.map((id) => [id, outcome.result]));
  for (const [id, result] of Object.entries(perId)) {
    const first = recordAnswer(id, step.module, result, outcome.given);
    if (first && index.byId.get(id)?.kind === 'vocab') session.newWords += 1;
  }
  session.answered += 1;
  session.credit += outcome.result === 'correct' ? 1 : outcome.result === 'almost' ? 0.5 : 0;
  if (outcome.result !== 'correct') {
    session.missed.push({ prompt: promptOf(step.question), answer: outcome.answer });
  }
  showFeedback(step, outcome);
}

function promptOf(q) {
  if (q.type === 'match') return 'Match the pairs';
  if (q.type === 'dialogue') return q.context[q.context.length - 1]?.es || q.setting;
  return q.sentence || q.prompt || '';
}

const FEEDBACK_LABEL = {
  correct: 'Correct',
  almost: 'Almost: wrong article',
  wrong: 'Not quite',
};

function showFeedback(step, outcome) {
  const q = step.question;
  const answerLines = String(q.answerDisplay && outcome.result !== 'correct' ? q.answerDisplay : outcome.answer).split('\n');
  const shouldShowAnswer = outcome.result !== 'correct' || q.type === 'mc';
  const label = outcome.spelled ? `Correct — spelled: ${outcome.spelled}`
    : outcome.withArticle ? `Correct — with article: ${outcome.withArticle}`
    : FEEDBACK_LABEL[outcome.result];
  const go = el('button', { class: 'btn continue', type: 'button', onclick: nextStep }, 'Continue');
  const panel = el(
    'div',
    { class: `feedback ${outcome.result}`, role: 'status' },
    el('p', { class: 'feedback-label' }, label),
    outcome.why && outcome.result !== 'correct' ? el('p', { class: 'feedback-ex' }, outcome.why) : null,
    shouldShowAnswer ? answerLines.map((line) => el('p', { class: 'feedback-answer' }, es(line))) : null,
    q.ex ? el('p', { class: 'feedback-ex' }, q.ex) : null,
    q.example ? el('p', { class: 'feedback-example' }, es(q.example)) : null,
    go
  );
  document.querySelector('.session').append(panel);
  const card = document.querySelector('.card');
  requestAnimationFrame(() => {
    panel.classList.add('open');
    card.style.paddingBottom = `${panel.offsetHeight + 24}px`;
  });
  setTimeout(() => go.focus({ preventScroll: true }), 60);
}

function showEnd() {
  const session = activeSession;
  const seconds = countTime(session);
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
  const minutes = Math.floor(seconds / 60);
  app.replaceChildren(
    el(
      'main',
      { class: 'page end' },
      el('h1', {}, `${session.title} finished`),
      el(
        'div',
        { class: 'stats' },
        statTile(percent(score), 'score'),
        statTile(`${minutes}:${String(seconds % 60).padStart(2, '0')}`, 'time'),
        statTile(session.newWords, 'new words'),
        statTile(session.missed.length, 'missed')
      ),
      conversation
        ? [
            el('h2', {}, 'Useful phrases'),
            conversation.phrases.map((p) => el('div', { class: 'mistake' }, es(p[0]), el('span', { class: 'row-sub' }, p[1]))),
          ]
        : null,
      session.missed.length
        ? [
            el('h2', {}, 'Missed'),
            session.missed.map((m) =>
              el('div', { class: 'mistake' }, m.prompt ? es(m.prompt) : null, el('span', { class: 'row-sub' }, m.answer.replaceAll('\n', ' · ')))
            ),
          ]
        : null,
      el('button', { class: 'btn primary', type: 'button', onclick: () => { activeSession = null; location.hash = '#/today'; route(); } }, 'Done')
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
  const manifest = await loadJson('./content/index.json');
  const [themes, grammar, conversations, reading] = await Promise.all([
    Promise.all(manifest.vocab.map((file) => loadJson(`./content/${file}`))),
    Promise.all(manifest.grammar.map((file) => loadJson(`./content/${file}`))),
    loadJson(`./content/${manifest.conversations}`),
    loadJson(`./content/${manifest.reading}`),
  ]);
  return { version: manifest.version, themes, grammar, conversations, reading };
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
  if (!('serviceWorker' in navigator)) return;
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
