// A faster drop-in for makefun-site 1.0.0: run(input) returns the same output tree, byte for byte.

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hasOwn = Object.hasOwn;

// ---------------------------------------------------------------- text

const ENT = [];
for (let c = 0; c < 128; c++) ENT.push(null);
ENT[38] = '&amp;';
ENT[60] = '&lt;';
ENT[62] = '&gt;';
ENT[34] = '&quot;';
ENT[39] = '&#39;';

function escSlow(s, i) {
  let out = s.slice(0, i);
  let last = i;
  const n = s.length;
  for (; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 63) {
      const e = ENT[c];
      if (e !== null) {
        if (last < i) out += s.slice(last, i);
        out += e;
        last = i + 1;
      }
    }
  }
  if (last < n) out += s.slice(last);
  return out;
}

function esc(s) {
  for (let i = 0, n = s.length; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 63 && ENT[c] !== null) return escSlow(s, i);
  }
  return s;
}

const MARK = /\p{M}/gu;

function slugify(text) {
  let plain = text;
  for (let i = 0, n = text.length; i < n; i++) {
    if (text.charCodeAt(i) > 127) {
      plain = text.normalize('NFKD').replace(MARK, '');
      break;
    }
  }
  let out = '';
  let gap = false;
  let start = -1;
  for (let i = 0, n = plain.length; i < n; i++) {
    let c = plain.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32;
    else if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57))) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += String.fromCharCode(c);
  }
  if (out.length > 64) {
    out = out.slice(0, 64);
    if (out.charCodeAt(63) === 45) out = out.slice(0, 63);
  }
  return out === '' ? 'untitled' : out;
}

function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// JavaScript's \s, by code unit.
function isWs(c) {
  if (c < 128) return c === 32 || (c >= 9 && c <= 13);
  return c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}

function wordsOf(s) {
  let n = 0;
  let inWord = false;
  for (let i = 0, len = s.length; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 10 || (c < 128 ? c >= 9 && c <= 13 : isWs(c))) inWord = false;
    else if (!inWord) {
      inWord = true;
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- front matter

const KEYS = new Set(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);
const LINE = /^([a-z_]+):(?: (.*))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[^"[\]]+$/;
const BLANKLINE = /^[ \t]*$/;
const TRAIL = /[ \t]+$/;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

let fmError = null;

function stringOf(key, raw) {
  if (raw.charCodeAt(0) === 34) {
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) {
      fmError = `key "${key}": a quoted string is not closed`;
      return null;
    }
    let out = '';
    const end = raw.length - 1;
    for (let i = 1; i < end; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === end) {
          fmError = `key "${key}": a quoted string holds an escape other than \\" or \\\\`;
          return null;
        }
        out += n;
        i++;
      } else if (c === '"') {
        fmError = `key "${key}": a quoted string holds a stray quote`;
        return null;
      } else out += c;
    }
    return out;
  }
  if (raw.charCodeAt(0) === 91) {
    fmError = `key "${key}": a bare string opens on [`;
    return null;
  }
  return raw;
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary':
      return stringOf(key, raw);
    case 'date': {
      const m = DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) {
        fmError = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)';
        return null;
      }
      return raw;
    }
    case 'tags': {
      if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) {
        fmError = 'key "tags": not a list [a, b]';
        return null;
      }
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return [];
      const tags = inner.split(',');
      for (let k = 0; k < tags.length; k++) {
        const t = tags[k].trim();
        if (t === '' || !TAG.test(t)) {
          fmError = 'key "tags": an empty tag, or one holding " [ or ]';
          return null;
        }
        tags[k] = t;
      }
      return tags;
    }
    case 'draft':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      fmError = 'key "draft": true or false';
      return null;
    case 'layout':
      if (NAME.test(raw)) return raw;
      fmError = 'key "layout": not a template name';
      return null;
    default:
      if (SLUG.test(raw) && raw.length <= 64) return raw;
      fmError = 'key "slug": not a slug';
      return null;
  }
}

// Fills src.data and src.body, or returns the reason the source is refused.
function parseFrontMatter(src) {
  const text = src.text;
  const len = text.length;
  let nl = text.indexOf('\n');
  const first = nl === -1 ? text : text.slice(0, nl);
  if (first !== '---') return 'no front matter';
  if (nl === -1) return 'the front matter is not closed';
  const lines = [];
  let pos = nl + 1;
  let bodyStart = -1;
  for (;;) {
    nl = text.indexOf('\n', pos);
    const line = nl === -1 ? text.slice(pos) : text.slice(pos, nl);
    if (line === '---') {
      bodyStart = nl === -1 ? len : nl + 1;
      break;
    }
    lines.push(line);
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (bodyStart === -1) return 'the front matter is not closed';
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const c0 = line.charCodeAt(0);
    if (c0 === 35 || BLANKLINE.test(line)) continue;
    const m = LINE.exec(line);
    if (m === null) return `line ${i + 2} is not "key: value"`;
    const key = m[1];
    let raw = m[2];
    if (raw === undefined) raw = '';
    else {
      const lc = raw.charCodeAt(raw.length - 1);
      if (lc === 32 || lc === 9) raw = raw.replace(TRAIL, '');
    }
    if (!KEYS.has(key)) return `unknown key "${key}"`;
    if (hasOwn(data, key)) return `key "${key}" is given twice`;
    if (raw === '') return `key "${key}" has no value`;
    const v = valueOf(key, raw);
    if (v === null) return fmError;
    data[key] = v;
  }
  if (!hasOwn(data, 'title')) return 'no title';
  src.data = data;
  src.body = bodyStart >= len ? '' : text.slice(bodyStart);
  return null;
}

// ---------------------------------------------------------------- markdown

const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const ANYSPACE = /\s/;

function isBlank(line) {
  for (let i = 0, n = line.length; i < n; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b) {
    const c = line.charCodeAt(a);
    if (c !== 32 && c !== 9) break;
    a++;
  }
  while (b > a) {
    const c = line.charCodeAt(b - 1);
    if (c !== 32 && c !== 9) break;
    b--;
  }
  return a === 0 && b === line.length ? line : line.slice(a, b);
}

// Spaces/tabs only from `from` to the end.
function blankFrom(line, from) {
  for (let i = from, n = line.length; i < n; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function isHr(line) {
  const c = line.charCodeAt(0);
  if (c !== 45 && c !== 42) return false;
  return line.charCodeAt(1) === c && line.charCodeAt(2) === c && blankFrom(line, 3);
}

function isFenceClose(line) {
  return line.charCodeAt(0) === 96 && line.charCodeAt(1) === 96 && line.charCodeAt(2) === 96 && blankFrom(line, 3);
}

let headDepth = 0;
// The heading's text (headDepth set), or null.
function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const m = HEADING.exec(line);
  if (m === null || m[2] === '') return null;
  headDepth = m[1].length;
  return m[2];
}

function endsParagraph(line) {
  const c = line.charCodeAt(0);
  if (c === 32 || c === 9 || line.length === 0) return isBlank(line);
  if (c === 96) return line.charCodeAt(1) === 96 && line.charCodeAt(2) === 96 && FENCE_OPEN.test(line);
  if (c === 35) return headingOf(line) !== null;
  if (c === 45 || c === 42) return isHr(line);
  return false;
}

// The characters a backslash escapes: \ ` * _ [ ] ( ) # + - . ! >
const ESCAPABLE = new Uint8Array(128);
for (const ch of '\\`*_[]()#+-.!>') ESCAPABLE[ch.charCodeAt(0)] = 1;
// The characters inline must look at.
const SPECIAL = new Uint8Array(128);
for (const ch of '\\`*[&<>"\'') SPECIAL[ch.charCodeAt(0)] = 1;

const isEsc = (c) => c < 128 && ESCAPABLE[c] === 1;

function findDoubleStar(s, j, b) {
  for (; j <= b - 2; j++) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      if (j + 1 < b && isEsc(s.charCodeAt(j + 1))) j++;
      continue;
    }
    if (c === 42 && s.charCodeAt(j + 1) === 42) return j;
  }
  return -1;
}

function findBracket(s, j, b) {
  for (; j < b; j++) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      if (j + 1 < b && isEsc(s.charCodeAt(j + 1))) j++;
      continue;
    }
    if (c === 93) return j;
  }
  return -1;
}

function findSingleStar(s, j, b) {
  for (; j < b; j++) {
    const c = s.charCodeAt(j);
    if (c === 92) {
      if (j + 1 < b && isEsc(s.charCodeAt(j + 1))) j++;
      continue;
    }
    if (c !== 42) continue;
    if (j + 1 < b && s.charCodeAt(j + 1) === 42) {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

let linkOf = null;

// s[a, b) rendered inline.
function inline(s, a, b) {
  let out = '';
  let run = a;
  let i = a;
  while (i < b) {
    const c = s.charCodeAt(i);
    if (c >= 128 || SPECIAL[c] === 0) {
      i++;
      continue;
    }
    switch (c) {
      case 92: {
        if (i + 1 < b) {
          const n = s.charCodeAt(i + 1);
          if (isEsc(n)) {
            if (run < i) out += s.slice(run, i);
            out += n === 62 ? '&gt;' : s[i + 1];
            i += 2;
            run = i;
            continue;
          }
        }
        i++;
        continue;
      }
      case 96: {
        const j = s.indexOf('`', i + 1);
        if (j > i + 1 && j < b) {
          if (run < i) out += s.slice(run, i);
          out += `<code>${esc(s.slice(i + 1, j))}</code>`;
          i = j + 1;
          run = i;
        } else i++;
        continue;
      }
      case 42: {
        if (i + 1 < b && s.charCodeAt(i + 1) === 42) {
          const j = findDoubleStar(s, i + 2, b);
          if (j > i + 2) {
            if (run < i) out += s.slice(run, i);
            out += `<strong>${inline(s, i + 2, j)}</strong>`;
            i = j + 2;
            run = i;
          } else i += 2;
          continue;
        }
        const j = findSingleStar(s, i + 1, b);
        if (j > i + 1) {
          if (run < i) out += s.slice(run, i);
          out += `<em>${inline(s, i + 1, j)}</em>`;
          i = j + 1;
          run = i;
        } else i++;
        continue;
      }
      case 91: {
        const k = findBracket(s, i + 1, b);
        if (k !== -1 && k + 1 < b && s.charCodeAt(k + 1) === 40) {
          const m = s.indexOf(')', k + 2);
          if (m > k + 2 && m < b) {
            const target = s.slice(k + 2, m);
            if (!ANYSPACE.test(target)) {
              if (run < i) out += s.slice(run, i);
              out += `<a href="${esc(linkOf(target))}">${inline(s, i + 1, k)}</a>`;
              i = m + 1;
              run = i;
              continue;
            }
          }
        }
        i++;
        continue;
      }
      default:
        if (run < i) out += s.slice(run, i);
        out += ENT[c];
        i++;
        run = i;
    }
  }
  if (run === a) return run === 0 && b === s.length ? s : s.slice(a, b);
  if (run < b) out += s.slice(run, b);
  return out;
}

const inl = (s) => inline(s, 0, s.length);

// Renders src.body into src.html, src.toc, src.excerpt.
function renderMarkdown(src) {
  const lines = src.body.split('\n');
  const n = lines.length;
  let ids = null;
  let html = '';
  const toc = [];
  let excerpt = null;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    const c = line.charCodeAt(0);
    if (line.length === 0 || ((c === 32 || c === 9) && isBlank(line))) {
      i++;
      continue;
    }
    if (c === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const lang = fence[1];
        html += lang === '' ? '<pre><code>' : `<pre><code class="language-${lang}">`;
        i++;
        while (i < n && !isFenceClose(lines[i])) html += esc(lines[i++]) + '\n';
        i++;
        html += '</code></pre>\n';
        continue;
      }
    } else if (c === 35) {
      const text = headingOf(line);
      if (text !== null) {
        const depth = headDepth;
        if (ids === null) ids = new Set();
        const id = uniqueSlug(slugify(text), ids);
        const h = inl(text);
        html += `<h${depth} id="${id}">${h}</h${depth}>\n`;
        if (depth === 2 || depth === 3) toc.push({ level: depth, id, html: h });
        i++;
        continue;
      }
    } else if (c === 62) {
      const body = [];
      while (i < n && lines[i].charCodeAt(0) === 62) {
        const l = lines[i++];
        const t = trimLine(l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1));
        if (t !== '') body.push(t);
      }
      html += body.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inl(body.join('\n'))}</p>\n</blockquote>\n`;
      continue;
    }
    if ((c === 45 || c === 42) && isHr(line)) {
      html += '<hr>\n';
      i++;
      continue;
    }
    let marker = null;
    let start = 1;
    if ((c === 45 || c === 42) && line.charCodeAt(1) === 32) {
      if (BULLET.test(line)) marker = BULLET;
    } else if (c >= 48 && c <= 57) {
      const m = ORDERED.exec(line);
      if (m !== null) {
        marker = ORDERED;
        start = Number(m[1]);
      }
    }
    if (marker !== null) {
      const ordered = marker === ORDERED;
      const g = ordered ? 2 : 1;
      let items = '';
      let cur = null;
      while (i < n) {
        const l = lines[i];
        const m = marker.exec(l);
        if (m !== null) {
          if (cur !== null) items += `<li>${inl(cur)}</li>\n`;
          cur = trimLine(m[g]);
          i++;
        } else if (l.charCodeAt(0) === 32 && l.charCodeAt(1) === 32 && continued(l)) {
          cur += '\n' + trimLine(l);
          i++;
        } else break;
      }
      items += `<li>${inl(cur)}</li>\n`;
      const tag = ordered ? 'ol' : 'ul';
      html += `${ordered && start !== 1 ? `<ol start="${start}">` : `<${tag}>`}\n${items}</${tag}>\n`;
      continue;
    }
    let text = trimLine(line);
    i++;
    while (i < n && !endsParagraph(lines[i])) text += '\n' + trimLine(lines[i++]);
    const h = inl(text);
    if (excerpt === null) excerpt = h;
    html += `<p>${h}</p>\n`;
  }
  src.html = html;
  src.toc = toc;
  src.excerpt = excerpt ?? '';
}

// A line of two or more spaces then a non-space (JavaScript's \S).
function continued(l) {
  let k = 2;
  while (l.charCodeAt(k) === 32) k++;
  if (k >= l.length) return false;
  const c = l.charCodeAt(k);
  if (c < 128) return !(c >= 9 && c <= 13);
  return !isWs(c);
}

// ---------------------------------------------------------------- templates

class TemplateError extends Error {}

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = BLANKLINE.test(src.slice(lineStart, open)) && BLANKLINE.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

// Node kinds: 0 text, 1 var, 2 raw, 3 if, 4 for, 5 include.
function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ k: 0, text: tok.text });
    else if (tok.t === 'var') body.push({ k: 1, path: tok.path });
    else if (tok.t === 'raw') body.push({ k: 2, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { k: 4, kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { k: 3, kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ k: 5, name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

// Compiled rendering: each node list becomes fn(root, frame, depth) -> string.
// A frame is one loop's binding: { name, x, k, n, parent }.

function loopObj(f) {
  return { index: f.k + 1, first: f.k === 0, last: f.k === f.n - 1, length: f.n };
}

function rest(v, path, from) {
  for (let j = from; j < path.length; j++) {
    if (v === null || typeof v !== 'object' || !hasOwn(v, path[j])) return undefined;
    v = v[path[j]];
  }
  return v;
}

function compilePath(path) {
  const first = path[0];
  const len = path.length;
  if (first === 'loop') {
    if (len === 2) {
      const p = path[1];
      const fromLoop =
        p === 'index' ? (f) => f.k + 1 : p === 'first' ? (f) => f.k === 0 : p === 'last' ? (f) => f.k === f.n - 1 : p === 'length' ? (f) => f.n : () => undefined;
      return (root, frame) => (frame !== null ? fromLoop(frame) : hasOwn(root, 'loop') ? rest(root.loop, path, 1) : undefined);
    }
    return (root, frame) => (frame !== null ? rest(loopObj(frame), path, 1) : hasOwn(root, 'loop') ? rest(root.loop, path, 1) : undefined);
  }
  if (len === 1)
    return (root, frame) => {
      for (let f = frame; f !== null; f = f.parent) if (f.name === first) return f.x;
      return hasOwn(root, first) ? root[first] : undefined;
    };
  if (len === 2) {
    const p = path[1];
    return (root, frame) => {
      let v;
      found: {
        for (let f = frame; f !== null; f = f.parent)
          if (f.name === first) {
            v = f.x;
            break found;
          }
        if (!hasOwn(root, first)) return undefined;
        v = root[first];
      }
      return v !== null && typeof v === 'object' && hasOwn(v, p) ? v[p] : undefined;
    };
  }
  return (root, frame) => {
    let v;
    found: {
      for (let f = frame; f !== null; f = f.parent)
        if (f.name === first) {
          v = f.x;
          break found;
        }
      if (!hasOwn(root, first)) return undefined;
      v = root[first];
    }
    return rest(v, path, 1);
  };
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let out = '';
    for (let k = 0; k < v.length; k++) out += (k === 0 ? '' : ', ') + textOf(v[k]);
    return out;
  }
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

const EMPTY = () => '';

function compileList(nodes, tpl) {
  const fns = [];
  let lastText = null;
  for (const nd of nodes) {
    const f = compileNode(nd, tpl);
    if (typeof f === 'string') {
      if (lastText !== null) {
        lastText += f;
        fns[fns.length - 1] = lastText;
      } else {
        lastText = f;
        fns.push(f);
      }
    } else {
      lastText = null;
      fns.push(f);
    }
  }
  const parts = fns.map((f) => (typeof f === 'string' ? () => f : f));
  const n = parts.length;
  if (n === 0) return EMPTY;
  if (n === 1) return parts[0];
  if (n === 2) {
    const [a, b] = parts;
    return (r, f, d) => a(r, f, d) + b(r, f, d);
  }
  if (n === 3) {
    const [a, b, c] = parts;
    return (r, f, d) => a(r, f, d) + b(r, f, d) + c(r, f, d);
  }
  return (r, f, d) => {
    let out = '';
    for (let k = 0; k < n; k++) out += parts[k](r, f, d);
    return out;
  };
}

function compileNode(nd, tpl) {
  switch (nd.k) {
    case 0:
      return nd.text;
    case 1: {
      const get = compilePath(nd.path);
      return (r, f) => {
        const v = get(r, f);
        return typeof v === 'string' ? esc(v) : esc(textOf(v));
      };
    }
    case 2: {
      const get = compilePath(nd.path);
      return (r, f) => {
        const v = get(r, f);
        return typeof v === 'string' ? v : textOf(v);
      };
    }
    case 3: {
      const get = compilePath(nd.path);
      const not = nd.not;
      const then = compileList(nd.then, tpl);
      const els = nd.else === null ? EMPTY : compileList(nd.else, tpl);
      return (r, f, d) => (truthy(get(r, f)) !== not ? then(r, f, d) : els(r, f, d));
    }
    case 4: {
      const get = compilePath(nd.path);
      const name = nd.name;
      const body = compileList(nd.body, tpl);
      return (r, f, d) => {
        const xs = get(r, f);
        if (!Array.isArray(xs)) return '';
        const n = xs.length;
        let out = '';
        for (let k = 0; k < n; k++) out += body(r, { name, x: xs[k], k, n, parent: f }, d);
        return out;
      };
    }
    default: {
      const name = nd.name;
      return (r, f, d) => {
        if (d >= 8) return '';
        const t = tpl.get(name);
        return t === undefined ? '' : t(r, f, d + 1);
      };
    }
  }
}

// ---------------------------------------------------------------- the build

function dirOf(path) {
  const k = path.lastIndexOf('/');
  return k === -1 ? '' : path.slice(0, k);
}

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const CR = /\r\n?/g;

export function run(input) {
  const tplSrc = input.templates;
  const parsed = new Map();
  const report = [];
  for (const name of Object.keys(tplSrc).sort(cmp)) {
    try {
      parsed.set(name, parseTemplate(name, tplSrc[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const tpl = new Map();
  for (const [name, nodes] of parsed) tpl.set(name, compileList(nodes, tpl));

  const base = input.site.base_url.replace(/\/+$/, '');
  const files = [...input.files].sort((x, y) => cmp(x.path, y.path));
  const statics = [];
  const staticPaths = new Set();
  const sources = [];
  for (const f of files) {
    const p = f.path;
    if (p.endsWith('.md')) {
      const c = f.content;
      const text = c.indexOf('\r') === -1 ? c : c.replace(CR, '\n');
      const s = { path: p, text, data: null, body: '', post: false, layout: '', slug: '', outDir: '', url: '', html: '', toc: null, excerpt: '', tagRefs: null, newer: null, older: null, card: null };
      const why = parseFrontMatter(s);
      if (why !== null) {
        report.push(`refused ${p}: ${why}`);
        continue;
      }
      s.post = p.startsWith('posts/');
      if (p.startsWith('tags/')) {
        report.push(`refused ${p}: tags/ is the generator's own`);
        continue;
      }
      if (p.startsWith('page/')) {
        report.push(`refused ${p}: page/ is the generator's own`);
        continue;
      }
      if (s.post && !hasOwn(s.data, 'date')) {
        report.push(`refused ${p}: a post needs a date`);
        continue;
      }
      const layout = s.data.layout ?? (s.post ? 'post' : 'page');
      if (!tpl.has(layout)) {
        report.push(`refused ${p}: layout "${layout}" is no template that parses`);
        continue;
      }
      s.layout = layout;
      if (s.data.draft === true) {
        report.push(`draft ${p}`);
        continue;
      }
      sources.push(s);
    } else {
      statics.push(f);
      staticPaths.add(p);
    }
  }

  // Permalinks.
  const taken = new Map();
  const bySource = new Map();
  for (const s of sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let set = taken.get(dir);
    if (set === undefined) {
      set = dir === '' ? new Set(['posts', 'tags', 'page']) : new Set();
      taken.set(dir, set);
    }
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), set);
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${base}/${s.outDir}/`;
    bySource.set(s.path, s);
  }

  // Markdown.
  const broken = new Set();
  for (const s of sources) {
    const dir = dirOf(s.path);
    const spath = s.path;
    linkOf = (target) => {
      const c = target.charCodeAt(0);
      if (c === 47 || c === 35 || SCHEME.test(target)) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = rel === '' ? null : resolvePath(dir, rel);
      if (path !== null) {
        const t = bySource.get(path);
        if (t !== undefined) return t.url + frag;
        if (staticPaths.has(path)) return `${base}/${path}${frag}`;
      }
      broken.add(`broken-link ${spath} -> ${target}`);
      return target;
    };
    renderMarkdown(s);
  }
  linkOf = null;

  // Collections.
  const posts = [];
  let nPages = 0;
  for (const s of sources) if (s.post) posts.push(s);
  else nPages++;
  posts.sort((x, y) => cmp(y.data.date, x.data.date) || cmp(x.slug, y.slug));
  const np = posts.length;
  for (let k = 0; k < np; k++) {
    posts[k].newer = k === 0 ? null : posts[k - 1];
    posts[k].older = k === np - 1 ? null : posts[k + 1];
  }

  // Tags.
  const bySlug = new Map();
  const slugCache = new Map();
  const tagSlug = (name) => {
    let s = slugCache.get(name);
    if (s === undefined) {
      s = slugify(name);
      slugCache.set(name, s);
    }
    return s;
  };
  for (const p of posts) {
    const refs = [];
    const names = p.data.tags;
    if (names !== undefined) {
      const seen = new Set();
      for (const name of names) {
        const slug = tagSlug(name);
        if (seen.has(slug)) continue;
        seen.add(slug);
        let tag = bySlug.get(slug);
        if (tag === undefined) {
          tag = { name, slug, url: `${base}/tags/${slug}/`, posts: [] };
          bySlug.set(slug, tag);
        }
        tag.posts.push(p);
        refs.push(tag);
      }
    }
    p.tagRefs = refs;
  }
  for (const s of sources) {
    if (s.post) continue;
    const refs = [];
    const names = s.data.tags;
    if (names !== undefined) {
      const seen = new Set();
      for (const name of names) {
        const slug = tagSlug(name);
        if (seen.has(slug)) continue;
        seen.add(slug);
        refs.push(bySlug.get(slug) ?? { name, slug, url: '', posts: [] });
      }
    }
    s.tagRefs = refs;
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || cmp(x.slug, y.slug));

  // Layouts.
  const cardOf = (s) => {
    const d = s.data;
    const date = d.date;
    const tr = s.tagRefs;
    const ctags = new Array(tr.length);
    for (let k = 0; k < tr.length; k++) ctags[k] = { name: tr[k].name, slug: tr[k].slug, url: tr[k].url };
    return {
      title: d.title,
      url: s.url,
      date: date ?? '',
      date_long: date === undefined ? '' : longDate(date),
      summary: d.summary ?? '',
      excerpt: s.excerpt,
      reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
      tags: ctags,
    };
  };
  for (const p of posts) p.card = cardOf(p);
  const linkRec = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });

  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => p.card);
  const output = {};
  for (const s of sources) {
    const card = s.post ? s.card : cardOf(s);
    const page = {
      title: card.title,
      url: card.url,
      date: card.date,
      date_long: card.date_long,
      summary: card.summary,
      excerpt: card.excerpt,
      reading_minutes: card.reading_minutes,
      tags: s.post ? card.tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url })) : card.tags,
      slug: s.slug,
      content: s.html,
      toc: s.toc,
      newer: linkRec(s.newer),
      older: linkRec(s.older),
      is_post: s.post,
    };
    output[`${s.outDir}/index.html`] = tpl.get(s.layout)({ site, tags: allTags, recent, page }, null, 0);
  }
  const per = input.site.per_page;
  const total = Math.max(1, Math.ceil(np / per));
  const indexUrl = (k) => (k === 1 ? `${base}/` : `${base}/page/${k}/`);
  const tIndex = tpl.get('index');
  for (let k = 1; k <= total; k++) {
    if (tIndex === undefined) continue;
    const pager = { number: k, total, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === total ? '' : indexUrl(k + 1) };
    const pp = posts.slice((k - 1) * per, k * per).map((p) => p.card);
    output[k === 1 ? 'index.html' : `page/${k}/index.html`] = tIndex({ site, tags: allTags, recent, posts: pp, pager }, null, 0);
  }
  const tTag = tpl.get('tag');
  if (tTag !== undefined)
    for (const t of tags) {
      const tag = { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) };
      output[`tags/${t.slug}/index.html`] = tTag({ site, tags: allTags, recent, tag }, null, 0);
    }
  const tTags = tpl.get('tags');
  if (tTags !== undefined) output['tags/index.html'] = tTags({ site, tags: allTags, recent }, null, 0);
  for (const f of statics) {
    if (hasOwn(output, f.path)) report.push(`shadowed ${f.path}: a built page has its path`);
    else output[f.path] = f.content;
  }

  const lines = report;
  for (const b of broken) lines.push(b);
  lines.sort(cmp);
  lines.push(`built ${nPages} pages, ${np} posts, ${tags.length} tags and ${statics.length} static files`);
  output['build-report.txt'] = lines.join('\n') + '\n';
  return output;
}
