// Inlines all JS, CSS and JSON into dist/trainer.html, with no service worker.
// Run: node tools/build-single.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const manifest = readJson('content/index.json');
const content = {
  version: manifest.version,
  themes: manifest.vocab.map((file) => readJson(`content/${file}`)),
  grammar: manifest.grammar.map((file) => readJson(`content/${file}`)),
  conversations: readJson(`content/${manifest.conversations}`),
  reading: readJson(`content/${manifest.reading}`),
  checkpoints: readJson(`content/${manifest.checkpoints}`),
};

// Dependency order; each module's imports are all defined earlier in the bundle.
const ORDER = ['grade', 'srs', 'storage', 'questions', 'session', 'app'];
const stripModuleSyntax = (source) =>
  source
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
    .replace(/^export \{[^}]*\};?\n/gm, '')
    .replace(/^export /gm, '');
const script = ORDER.map((name) => stripModuleSyntax(read(`js/${name}.js`))).join('\n');

// A JSON string may not close the script tag it sits in.
const data = JSON.stringify(content).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Español B1</title>
<style>
${read('css/app.css')}
</style>
</head>
<body>
<div id="app"></div>
<script>window.TRAINER_CONTENT = ${data};</script>
<script type="module">
${script.replace(/<\/script/gi, '<\\/script')}
</script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/trainer.html'), html);
console.log(`dist/trainer.html: ${Math.round(html.length / 1024)} KB`);
