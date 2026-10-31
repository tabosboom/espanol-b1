// Content and packaging checks. Run: node tools/validate.mjs

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeText, normalise, splitAnswers } from '../js/grade.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const wordCount = (text) => text.trim().split(/\s+/).length;
const seenIds = new Set();
const POS = new Set(['noun', 'verb', 'adj', 'adv', 'phrase', 'connector']);

function claimId(id, where) {
  if (!id) fail(where, 'missing id');
  else if (seenIds.has(id)) fail(where, `duplicate id ${id}`);
  else seenIds.add(id);
}

function locate(entry) {
  const example = entry.ex.toLowerCase();
  if (entry.cloze) return entry.ex.includes(entry.cloze);
  const clean = entry.es.replace(/[¿?¡!…]/g, '').trim().toLowerCase();
  return example.includes(clean) || example.includes(clean.replace(/^(el|la|los|las)\s+/, ''));
}

function checkTheme(file) {
  const theme = readJson(`content/${file}`);
  let total = 0;
  for (const field of ['id', 'title', 'es', 'priority', 'packs']) {
    if (theme[field] === undefined) fail(file, `missing ${field}`);
  }
  for (const pack of theme.packs) {
    claimId(pack.id, file);
    if (pack.entries.length < 12 || pack.entries.length > 15) {
      fail(pack.id, `pack has ${pack.entries.length} entries, needs 12–15`);
    }
    for (const entry of pack.entries) {
      total += 1;
      const where = entry.id || `${pack.id}?`;
      claimId(entry.id, where);
      for (const field of ['es', 'en', 'pos', 'ex']) {
        if (!entry[field]) fail(where, `missing ${field}`);
      }
      if (!POS.has(entry.pos)) fail(where, `bad pos ${entry.pos}`);
      if (entry.pos === 'noun' && !/^(el|la|los|las|el\/la)\s/.test(entry.es)) fail(where, `noun without article: ${entry.es}`);
      const words = wordCount(entry.ex);
      if (words < 6 || words > 14) fail(where, `example has ${words} words: ${entry.ex}`);
      if (!locate(entry)) fail(where, `example does not contain "${entry.es}"${entry.cloze ? ` (cloze "${entry.cloze}")` : ''}`);
      if (gradeText(entry.es, [entry.es, ...splitAnswers(entry.accept)], entry.pos).result !== 'correct') {
        fail(where, 'canonical answer does not grade as correct');
      }
    }
  }
  return { id: theme.id, total };
}

const TAP_TYPES = new Set(['mc', 'gapBank', 'tiles', 'tf']);

function checkGrammarItem(item, where) {
  if (!item.ex) fail(where, 'missing explanation');
  else if (wordCount(item.ex) > 24) fail(where, `explanation has ${wordCount(item.ex)} words`);
  switch (item.type) {
    case 'mc':
      if (!Array.isArray(item.opts) || item.opts.length < 3 || item.opts.length > 4) fail(where, 'mc needs 3–4 options');
      else if (!(item.c >= 0 && item.c < item.opts.length)) fail(where, 'mc index out of range');
      else if (new Set(item.opts).size !== item.opts.length) fail(where, 'duplicate options');
      break;
    case 'tf':
      if (typeof item.a !== 'boolean') fail(where, 'tf answer must be boolean');
      break;
    case 'type':
      if (!item.a) fail(where, 'no answer');
      if (item.a && splitAnswers(item.a).some((a) => wordCount(a) > 8)) fail(where, 'typed answer is over 8 words');
      break;
    case 'gap':
      if ((item.q.match(/___/g) || []).length !== 1) fail(where, 'gap needs exactly one ___');
      if (!item.a) fail(where, 'no answer');
      if (item.a && splitAnswers(item.a).some((a) => wordCount(a) > 3)) fail(where, 'gap answer is over 3 words');
      break;
    case 'gapBank': {
      const blanks = (item.q.match(/___/g) || []).length;
      if (!Array.isArray(item.a) || blanks !== item.a.length) fail(where, 'gapBank blanks and answers differ');
      else if (!item.a.every((a) => item.bank?.includes(a))) fail(where, 'answer missing from bank');
      break;
    }
    case 'tiles':
      if (!item.a) fail(where, 'no answer');
      if (item.a && wordCount(splitAnswers(item.a)[0]) > 12) fail(where, 'tiles sentence too long');
      break;
    case 'spot': {
      const words = item.q.split(/\s+/);
      if (!Number.isInteger(item.wrong) || item.wrong < 0 || item.wrong >= words.length) fail(where, 'spot index out of range');
      if (!item.a) fail(where, 'no answer');
      if (item.opts && !item.opts.some((o) => splitAnswers(item.a).some((a) => normalise(a) === normalise(o)))) {
        fail(where, 'spot answer missing from options');
      }
      break;
    }
    default:
      fail(where, `unknown type ${item.type}`);
  }
}

function checkGrammar(file) {
  const mod = readJson(`content/${file}`);
  if (!mod.rule?.intro) fail(file, 'missing rule card');
  const asked = new Set();
  let tap = 0;
  for (const item of mod.items) {
    const where = item.id || `${file}?`;
    claimId(item.id, where);
    checkGrammarItem(item, where);
    if (TAP_TYPES.has(item.type)) tap += 1;
    const key = `${item.type}:${normalise(item.q)}`;
    if (asked.has(key)) fail(where, `same question twice: ${item.q}`);
    asked.add(key);
  }
  if (tap / mod.items.length < 0.4) fail(file, `only ${tap}/${mod.items.length} tap items, needs 40%`);
  return { id: mod.id, total: mod.items.length, tap, mistakes: mod.items.filter((i) => i.fromMistake).length };
}

function checkConversations(path, allIds) {
  const list = readJson(path);
  for (const conv of list) {
    claimId(conv.id, path);
    const where = conv.id;
    if (conv.turns.length < 5) warnings.push(`${where}: only ${conv.turns.length} turns`);
    conv.turns.forEach((turn, i) => {
      if (!turn.es || !turn.en) fail(`${where}#${i}`, 'missing es or en');
      if (turn.speaker === 'me') {
        const correct = (turn.options || []).filter((o) => o.correct);
        if (turn.options?.length !== 3) fail(`${where}#${i}`, 'needs 3 options');
        if (correct.length !== 1) fail(`${where}#${i}`, 'needs exactly one correct option');
        else if (correct[0].es !== turn.es) fail(`${where}#${i}`, 'correct option differs from turn text');
        for (const opt of turn.options || []) if (!opt.why) fail(`${where}#${i}`, 'option without why');
      } else if (turn.speaker !== 'them') {
        fail(`${where}#${i}`, `bad speaker ${turn.speaker}`);
      }
    });
    for (const phrase of conv.phrases || []) {
      if (phrase[2] && !allIds.has(phrase[2])) fail(where, `phrase links to unknown id ${phrase[2]}`);
    }
  }
  return list.length;
}

function listFiles(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? listFiles(path) : [path];
  });
}

function checkServiceWorker() {
  const source = readFileSync(join(root, 'sw.js'), 'utf8');
  const listed = [...source.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const file of listed) {
    if (!existsSync(join(root, file))) fail('sw.js', `lists a missing file: ${file}`);
    if (file.startsWith('reference/')) fail('sw.js', 'must not cache reference/');
  }
  const required = ['css', 'js', 'icons', 'content'].flatMap(listFiles).concat('index.html', 'manifest.webmanifest');
  for (const file of required) {
    if (!/\.DS_Store$/.test(file) && !listed.includes(relative('.', file))) fail('sw.js', `does not precache ${file}`);
  }
}

const manifest = readJson('content/index.json');
const themes = manifest.vocab.map(checkTheme);
const wordIds = new Set(seenIds);
const grammar = manifest.grammar.map(checkGrammar);
const conversations = checkConversations(`content/${manifest.conversations}`, wordIds);
readJson(`content/${manifest.reading}`);
readJson(`content/${manifest.checkpoints}`);
checkServiceWorker();

for (const t of themes) console.log(`vocab ${t.id}: ${t.total} entries`);
for (const g of grammar) console.log(`grammar ${g.id}: ${g.total} items, ${g.tap} tap, ${g.mistakes} from mistakes`);
console.log(`conversations: ${conversations}`);
warnings.forEach((w) => console.log(`warning: ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`ERROR ${e}`));
  console.error(`${errors.length} errors`);
  process.exit(1);
}
console.log('validate: OK');
