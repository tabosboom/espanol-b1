// Answer normalisation and checking. Pure functions, no DOM.

const STRIP = /[¿?¡!.,;:«»"()…]/g;
const ARTICLE = /^(el\/la|el|la|los|las)\s+(.+)$/;
const OPPOSITE = { el: 'la', la: 'el', los: 'las', las: 'los' };
const INDEFINITE = { el: 'un', la: 'una', los: 'unos', las: 'unas' };

export function normalise(text) {
  return String(text ?? '').toLowerCase().replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
}

export function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function splitAnswers(text) {
  return String(text ?? '').split('|').map((s) => s.trim()).filter(Boolean);
}

// "liado/a de trabajo" -> ["liado de trabajo", "liada de trabajo"]
function expandGender(text) {
  const match = text.match(/([\p{L}]+)o\/a(?![\p{L}])/u);
  if (!match) return [text];
  const masculine = text.replace(match[0], `${match[1]}o`);
  const feminine = text.replace(match[0], `${match[1]}a`);
  return [text, masculine, feminine];
}

function forms(answer, pos) {
  const out = expandGender(normalise(answer));
  if (pos === 'adj') {
    for (const form of [...out]) {
      if (form.endsWith('o')) out.push(`${form.slice(0, -1)}a`);
    }
  }
  return out;
}

// Returns { result: 'correct' | 'almost' | 'wrong', answer, spelled?, withArticle? }.
// `accepted` lists the accepted answers, the first being the canonical spelling.
export function gradeText(given, accepted, pos) {
  const typed = normalise(given);
  const canonical = accepted[0];
  if (!typed) return { result: 'wrong', answer: canonical };
  const bare = stripAccents(typed);

  for (const answer of accepted) {
    for (const form of forms(answer, pos)) {
      if (form === typed) return { result: 'correct', answer };
      if (stripAccents(form) === bare) return { result: 'correct', answer, spelled: answer };
    }
  }

  if (pos === 'noun') {
    for (const answer of accepted) {
      const match = normalise(answer).match(ARTICLE);
      if (!match) continue;
      const [, article, rest] = match;
      const noun = stripAccents(rest);
      if (bare === noun) return { result: 'correct', answer, withArticle: answer };
      if (article === 'el/la') {
        for (const form of ['el', 'la', 'un', 'una']) {
          if (bare === `${form} ${noun}`) return { result: 'correct', answer };
        }
        continue;
      }
      if (bare === `${INDEFINITE[article]} ${noun}`) return { result: 'correct', answer };
      const other = OPPOSITE[article];
      if (bare === `${other} ${noun}` || bare === `${INDEFINITE[other]} ${noun}`) {
        return { result: 'almost', answer };
      }
    }
  }
  return { result: 'wrong', answer: canonical };
}
