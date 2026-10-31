// Renderers for every question type. Each renderer draws into `root` and calls
// `done(outcome)` exactly once:
//   { result, given, answer, spelled?, withArticle?, results? }
// `results` maps item ids to results for questions that test several items (match).

import { gradeText, normalise, splitAnswers, stripAccents } from './grade.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== undefined && child !== null && child !== false) node.append(child);
  }
  return node;
}

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const es = (text, cls = '') => el('span', { lang: 'es', class: `es ${cls}`.trim() }, text);

function promptBlock(q) {
  const block = el('div', { class: 'prompt' });
  if (q.round) block.append(el('p', { class: 'tag round' }, q.round));
  if (q.tag) block.append(el('p', { class: 'tag' }, q.tag));
  if (q.instruction) block.append(el('p', { class: 'instruction' }, q.instruction));
  if (q.prompt) {
    block.append(
      el('p', { class: 'prompt-text' }, q.promptLang === 'en' ? q.prompt : es(q.prompt))
    );
  }
  return block;
}

function answerInput(onEnter, placeholder = 'Type your answer') {
  const input = el('input', {
    class: 'answer-input',
    type: 'text',
    lang: 'es',
    placeholder,
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': 'Your answer',
    onfocus: () => setTimeout(() => input.scrollIntoView({ block: 'center' }), 300),
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onEnter();
      }
    },
  });
  return input;
}

function checkButton(onClick, disabled = false) {
  return el('button', { class: 'btn primary', type: 'button', disabled, onclick: onClick }, 'Check');
}

function lockAll(root) {
  root.querySelectorAll('button, input').forEach((node) => {
    node.disabled = true;
  });
}

function renderMc(q, root, done) {
  root.append(promptBlock(q));
  const correct = q.opts[q.c];
  const options = el('div', { class: 'options' });
  let rightButton = null;
  shuffle(q.opts).forEach((opt) => {
    const button = el(
        'button',
        {
          class: 'option',
          type: 'button',
          onclick: (event) => {
            const isRight = opt === correct;
            lockAll(root);
            event.currentTarget.classList.add(isRight ? 'picked-right' : 'picked-wrong');
            if (!isRight) rightButton?.classList.add('picked-right');
            done({ result: isRight ? 'correct' : 'wrong', given: opt, answer: correct });
          },
        },
        q.optsLang === 'en' ? opt : es(opt)
      );
    if (opt === correct) rightButton = button;
    options.append(button);
  });
  root.append(options);
}

function renderTf(q, root, done) {
  root.append(promptBlock(q));
  const options = el('div', { class: 'options two' });
  [
    ['Verdadero', true],
    ['Falso', false],
  ].forEach(([label, value]) => {
    options.append(
      el(
        'button',
        {
          class: 'option',
          type: 'button',
          onclick: (event) => {
            const isRight = value === q.a;
            lockAll(root);
            event.currentTarget.classList.add(isRight ? 'picked-right' : 'picked-wrong');
            done({
              result: isRight ? 'correct' : 'wrong',
              given: label,
              answer: q.a ? 'Verdadero' : 'Falso',
            });
          },
        },
        es(label)
      )
    );
  });
  root.append(options);
}

function typedOutcome(input, q) {
  const outcome = gradeText(input.value, q.accepted, q.pos);
  return { ...outcome, given: input.value.trim(), answer: q.display || outcome.answer };
}

// First letter of each word, the rest as dots: "qué tal" -> "q·· t··".
function hintFor(answer) {
  const words = normalise(answer).replace(/\/\p{L}+/gu, '').split(' ');
  return words.map((word) => word[0] + '·'.repeat(Math.max(word.length - 1, 0))).join(' ');
}

// Writing help: a first-letter hint, and a way out without typing a wrong guess.
function writingHelp(q, input, giveUp) {
  if (q.exam) return null;
  const hint = el('button', {
    class: 'link-btn',
    type: 'button',
    onclick: () => {
      input.placeholder = hintFor(q.display || q.accepted[0]);
      hint.disabled = true;
      input.focus({ preventScroll: true });
    },
  }, 'Hint');
  return el('div', { class: 'help-row' }, hint, el('button', { class: 'link-btn', type: 'button', onclick: giveUp }, "I don't know"));
}

function renderType(q, root, done) {
  root.append(promptBlock(q));
  const finish = (outcome) => {
    lockAll(root);
    input.blur();
    done(outcome);
  };
  const check = () => {
    if (input.value.trim()) finish(typedOutcome(input, q));
  };
  const input = answerInput(check);
  root.append(
    el('div', { class: 'answer-row' }, input, checkButton(check)),
    writingHelp(q, input, () => finish({ result: 'wrong', given: '', answer: q.display || q.accepted[0] }))
  );
  input.focus({ preventScroll: true });
}

function splitBlanks(text) {
  return text.split('___');
}

function renderGap(q, root, done) {
  root.append(promptBlock({ ...q, prompt: null }));
  const parts = splitBlanks(q.sentence);
  const sentence = el('p', { class: 'sentence', lang: 'es' }, parts[0], el('span', { class: 'blank' }, '___'), parts[1]);
  root.append(sentence);
  const finish = (outcome) => {
    lockAll(root);
    input.blur();
    sentence.querySelector('.blank').textContent = outcome.answer;
    done(outcome);
  };
  const check = () => {
    if (input.value.trim()) finish(typedOutcome(input, q));
  };
  const input = answerInput(check);
  root.append(
    el('div', { class: 'answer-row' }, input, checkButton(check)),
    writingHelp(q, input, () => finish({ result: 'wrong', given: '', answer: q.display || q.accepted[0] }))
  );
  input.focus({ preventScroll: true });
}

function renderGapBank(q, root, done) {
  root.append(promptBlock({ ...q, prompt: null }));
  const parts = splitBlanks(q.sentence);
  const filled = new Array(parts.length - 1).fill(null);
  const sentence = el('p', { class: 'sentence', lang: 'es' });
  const bank = el('div', { class: 'chips' });
  const check = checkButton(() => {
    const given = filled.map((chip) => chip.textContent);
    const allRight = given.every(
      (text, i) => normalise(text) === normalise(splitAnswers(q.answers[i])[0])
    );
    lockAll(root);
    done({
      result: allRight ? 'correct' : 'wrong',
      given: given.join(', '),
      answer: q.answers.map((a) => splitAnswers(a)[0]).join(' … '),
    });
  }, true);

  const blanks = filled.map((_, index) =>
    el('button', {
      class: 'blank-slot',
      type: 'button',
      'aria-label': `Blank ${index + 1}`,
      onclick: () => {
        if (!filled[index]) return;
        filled[index].disabled = false;
        filled[index] = null;
        refresh();
      },
    })
  );
  parts.forEach((part, i) => {
    sentence.append(part);
    if (blanks[i]) sentence.append(blanks[i]);
  });

  function refresh() {
    blanks.forEach((blank, i) => {
      blank.textContent = filled[i] ? filled[i].textContent : '';
      blank.classList.toggle('has-word', Boolean(filled[i]));
    });
    check.disabled = filled.some((chip) => !chip);
  }

  shuffle(q.bank).forEach((word) => {
    const chip = el(
      'button',
      {
        class: 'chip',
        type: 'button',
        lang: 'es',
        onclick: () => {
          const free = filled.indexOf(null);
          if (free < 0) return;
          filled[free] = chip;
          chip.disabled = true;
          refresh();
        },
      },
      word
    );
    bank.append(chip);
  });
  refresh();
  root.append(sentence, bank, check);
}

function renderTiles(q, root, done) {
  root.append(promptBlock(q));
  const accepted = splitAnswers(q.a);
  const words = accepted[0].split(/\s+/);
  const line = el('div', { class: 'tile-line', 'aria-label': 'Your sentence' });
  const pool = el('div', { class: 'chips' });
  const check = checkButton(() => {
    const given = [...line.children].map((tile) => tile.textContent).join(' ');
    const target = stripAccents(normalise(given));
    const isRight = accepted.some((a) => stripAccents(normalise(a)) === target);
    lockAll(root);
    done({ result: isRight ? 'correct' : 'wrong', given, answer: accepted[0] });
  }, true);

  const refresh = () => {
    check.disabled = line.children.length === 0;
  };
  shuffle([...words, ...(q.distractors || [])]).forEach((word) => {
    const source = el(
      'button',
      {
        class: 'chip',
        type: 'button',
        lang: 'es',
        onclick: () => {
          source.disabled = true;
          const tile = el(
            'button',
            {
              class: 'chip placed',
              type: 'button',
              lang: 'es',
              onclick: () => {
                tile.remove();
                source.disabled = false;
                refresh();
              },
            },
            word
          );
          line.append(tile);
          refresh();
        },
      },
      word
    );
    pool.append(source);
  });
  root.append(line, pool, check);
}

function renderMatch(q, root, done) {
  root.append(promptBlock(q));
  const results = {};
  let selected = null;
  let remaining = q.pairs.length;

  const grid = el('div', { class: 'match' });
  const left = el('div', { class: 'match-col' });
  const right = el('div', { class: 'match-col' });
  grid.append(left, right);

  const pick = (button, side, id) => {
    if (selected?.button === button) {
      button.classList.remove('selected');
      selected = null;
      return;
    }
    if (!selected || selected.side === side) {
      selected?.button.classList.remove('selected');
      selected = { button, side, id };
      button.classList.add('selected');
      return;
    }
    const other = selected;
    other.button.classList.remove('selected');
    selected = null;
    const spanishId = side === 'es' ? id : other.id;
    if (other.id === id) {
      if (!results[id]) results[id] = 'correct';
      button.classList.add('matched');
      other.button.classList.add('matched');
      button.disabled = true;
      other.button.disabled = true;
      remaining -= 1;
      if (remaining === 0) {
        const missed = q.pairs.filter((pair) => results[pair.id] === 'wrong');
        done({
          result: missed.length ? 'wrong' : 'correct',
          given: '',
          answer: q.pairs.map((pair) => `${pair.es} = ${pair.en}`).join('\n'),
          results,
        });
      }
    } else {
      results[spanishId] = 'wrong';
      button.classList.add('mismatch');
      other.button.classList.add('mismatch');
      setTimeout(() => {
        button.classList.remove('mismatch');
        other.button.classList.remove('mismatch');
      }, 450);
    }
  };

  shuffle(q.pairs).forEach((pair) => {
    const button = el('button', {
      class: 'match-btn',
      type: 'button',
      onclick: () => pick(button, 'es', pair.id),
    }, es(pair.es));
    left.append(button);
  });
  shuffle(q.pairs).forEach((pair) => {
    const button = el('button', {
      class: 'match-btn',
      type: 'button',
      onclick: () => pick(button, 'en', pair.id),
    }, pair.en);
    right.append(button);
  });
  root.append(grid);
}

function renderSpot(q, root, done) {
  root.append(promptBlock({ ...q, prompt: null }));
  const words = q.sentence.split(/\s+/);
  const accepted = splitAnswers(q.a);
  const line = el('div', { class: 'spot-line', lang: 'es' });
  const fixArea = el('div', { class: 'spot-fix' });
  let chosen = null;

  const finish = (fixText) => {
    const fixOutcome = gradeText(fixText, accepted);
    const isRight = chosen === q.wrong && fixOutcome.result === 'correct';
    lockAll(root);
    done({
      result: isRight ? 'correct' : 'wrong',
      given: `${words[chosen]} → ${fixText}`,
      answer: `${words[q.wrong]} → ${accepted[0]}`,
      spelled: isRight ? fixOutcome.spelled : undefined,
    });
  };

  const showFix = () => {
    fixArea.replaceChildren();
    fixArea.append(el('p', { class: 'instruction' }, 'What should it be?'));
    if (q.opts) {
      const options = el('div', { class: 'options' });
      q.opts.forEach((opt) => {
        options.append(el('button', { class: 'option', type: 'button', onclick: () => finish(opt) }, es(opt)));
      });
      fixArea.append(options);
    } else {
      const check = () => {
        if (input.value.trim()) finish(input.value);
      };
      const input = answerInput(check, 'Type the fix');
      fixArea.append(el('div', { class: 'answer-row' }, input, checkButton(check)));
      input.focus({ preventScroll: true });
    }
  };

  words.forEach((word, index) => {
    const button = el(
      'button',
      {
        class: 'spot-word',
        type: 'button',
        onclick: () => {
          line.querySelector('.selected')?.classList.remove('selected');
          button.classList.add('selected');
          chosen = index;
          showFix();
        },
      },
      word
    );
    line.append(button);
  });
  root.append(line, fixArea);
}

function bubble(turn) {
  const english = el('span', { class: 'bubble-en', hidden: true }, turn.en || '');
  return el(
    'button',
    {
      class: `bubble ${turn.speaker}`,
      type: 'button',
      'aria-label': `${turn.es}. Tap for English.`,
      onclick: () => {
        english.hidden = !english.hidden;
      },
    },
    es(turn.es),
    english
  );
}

function renderDialogue(q, root, done) {
  root.append(promptBlock(q));
  if (q.setting) root.append(el('p', { class: 'setting' }, q.setting));
  const chat = el('div', { class: 'chat' }, q.context.map(bubble));
  root.append(chat);
  root.append(el('p', { class: 'instruction' }, 'Choose the best reply. Tap a bubble for its English.'));
  const options = el('div', { class: 'options' });
  shuffle(q.turn.options).forEach((opt) => {
    options.append(
      el(
        'button',
        {
          class: 'option',
          type: 'button',
          'data-right': opt.correct ? 'true' : null,
          onclick: (event) => {
            lockAll(options);
            event.currentTarget.classList.add(opt.correct ? 'picked-right' : 'picked-wrong');
            if (!opt.correct) options.querySelector('[data-right]')?.classList.add('picked-right');
            chat.append(bubble(q.turn));
            done({
              result: opt.correct ? 'correct' : 'wrong',
              given: opt.es,
              answer: q.turn.es,
              why: opt.why,
            });
          },
        },
        es(opt.es)
      )
    );
  });
  root.append(options);
}

function renderRead(q, root, done) {
  const text = el('details', { class: 'read-text', open: q.index === 0 });
  text.append(el('summary', {}, q.title));
  q.text.split(/\n+/).forEach((para) => text.append(el('p', { lang: 'es', class: 'es' }, para)));
  root.append(text);
  const inner = { ...q.question, instruction: `Question ${q.index + 1} of ${q.total}` };
  const render = q.question.type === 'tf' ? renderTf : renderMc;
  render(inner, root, done);
}

const RENDERERS = {
  mc: renderMc,
  tf: renderTf,
  type: renderType,
  gap: renderGap,
  gapBank: renderGapBank,
  tiles: renderTiles,
  match: renderMatch,
  spot: renderSpot,
  dialogue: renderDialogue,
  read: renderRead,
};

export function renderQuestion(q, root, done) {
  RENDERERS[q.type](q, root, done);
}
