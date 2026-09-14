#!/usr/bin/env node
/**
 * scripts/check-refs.mjs — 참조 무결성 + JS 문법 검사 (CI 게이트, 의존성 없음, Node 20+)
 *
 * 사용법:  node scripts/check-refs.mjs [repo-root]
 *   repo-root 를 생략하면 이 스크립트가 있는 scripts/ 의 부모 디렉터리를 루트로 쓴다 (cwd 무관).
 *
 * 검사 항목
 *  (a) js/*.js 전부 `node --check` 문법 검사
 *  (b) 로컬 참조가 실제 파일로 — 대소문자까지 정확히 — 해석되는지
 *      - index.html · login.html : href="…" / src="…" 속성, url(…)
 *      - css/*.css               : url(…)  (css 파일 위치 기준 상대경로)
 *      - js/*.js · 두 html       : 'assets/…' 'css/…' 'js/…' '*.html' 문자열 리터럴 (문서 루트 기준)
 *      건너뜀: http(s): · //… · data: · mailto: · javascript: · tel: · '#…' · '${…}' 같은 동적 값 · 'assets/' 처럼 /로 끝나는 접두어
 *      ?query 와 #hash 는 떼고 비교한다. 루트 절대경로(/assets/…)는 Pages 하위 경로에서 깨지므로 실패로 본다.
 *      대소문자는 fs.readdirSync 로 경로 세그먼트마다 비교하므로 Windows 에서도 불일치를 잡는다.
 *  (c) index.html 이 css/*.css 와 js/*.js 를 각각 정확히 한 번씩 참조하고,
 *      <script src> 순서가 js/ 디렉터리의 사전순(코드 유닛 순)과 같은지
 *
 * 종료 코드: 실패 없음 0 · 실패 있음 1 · 실행 자체 불가(루트 없음 등) 2
 * 참고: JS 주석 안의 따옴표 문자열도 리터럴로 취급한다(주석을 파싱하지 않음). 주석에 옛 경로를 남기지 말 것.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] ?? path.join(SCRIPT_DIR, '..'));

const HTML_FILES = ['index.html', 'login.html'];
const CSS_DIR = 'css';
const JS_DIR = 'js';

// scheme: (http:, https:, data:, mailto:, javascript:, tel:, blob:, C: …) 또는 프로토콜 상대(//…)
const SKIP_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
// href="…" / src="…" (data-src 포함, srcset 제외). 값은 한 줄 안에서만 잡는다.
const ATTR_RE = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/g;
// url("…") · url('…') · url(…)
const URL_RE = /\burl\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^"'()\s]+))\s*\)/g;
// 리터럴 전체가 assets/… css/… js/… (./ 접두 허용) 이거나 *.html(?query#hash) 인 문자열
const LIT_RE = /(["'`])((?:\.\/)?(?:assets|css|js)\/[^"'`\n]*|[\w.-]+\.html(?:[?#][^"'`\n]*)?)\1/g;
// index.html 의 <link href> / <script src>
const LINK_RE = /<link\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi;
const SCRIPT_RE = /<script\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;

const failures = [];
const fail = (where, msg) => failures.push(`${where}  ${msg}`);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function readText(relFile) {
  return fs.readFileSync(path.join(ROOT, relFile), 'utf8').replace(/\r\n?/g, '\n');
}
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
function lineOf(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
// HTML 주석은 줄 수를 유지한 채 공백으로 지운다 (주석 처리된 <script>/<link> 를 세지 않기 위해)
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}
function listDir(relDir, ext) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;
  return fs.readdirSync(abs)
    .filter((n) => n.endsWith(ext) && fs.statSync(path.join(abs, n)).isFile())
    .sort(); // 코드 유닛 순 = 00-core.js < 01-seed.js < … < 90-boot.js
}

// 참조 문자열 정규화. null 이면 검사 대상 아님.
function normalizeRef(raw) {
  let r = raw.trim();
  if (!r) return null;
  r = r.split(/[?#]/)[0];                // ?query / #hash 제거
  if (!r) return null;                   // '#…' '?…' 뿐
  if (SKIP_RE.test(r)) return null;      // 외부 URL / data: / mailto: …
  if (/[${}<>]/.test(r)) return null;    // 템플릿 표현식 등 동적 값
  if (r.endsWith('/')) return null;      // 'assets/' 같은 디렉터리 접두어 (동적 조합)
  try { r = decodeURIComponent(r); } catch { /* 인코딩 아님 — 그대로 */ }
  return r;
}

const dirCache = new Map();
function entriesOf(absDir) {
  if (!dirCache.has(absDir)) dirCache.set(absDir, fs.readdirSync(absDir));
  return dirCache.get(absDir);
}

// baseDir(루트 기준 posix 디렉터리, '' = 루트) 에서 ref 를 해석해 실제 파일인지 확인.
// 세그먼트마다 readdirSync 결과와 정확히 비교하므로 대소문자/유니코드 정규화 차이를 잡는다.
function resolveRef(baseDir, ref) {
  if (ref.startsWith('/')) return { ok: false, reason: '루트 절대경로 — Pages 하위 경로(/weglow-sellery/)에서 깨짐. 상대경로로 쓸 것' };
  const segs = [...(baseDir ? baseDir.split('/') : []), ...ref.split('/')];
  const stack = [];
  for (const s of segs) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (!stack.length) return { ok: false, reason: '저장소 루트 밖을 가리킴' }; stack.pop(); continue; }
    stack.push(s);
  }
  let absDir = ROOT;
  const walked = [];
  for (const seg of stack) {
    let names;
    try { names = entriesOf(absDir); } catch { return { ok: false, reason: `${walked.join('/')} 는 디렉터리가 아님` }; }
    if (!names.includes(seg)) {
      const ci = names.find((n) => n.toLowerCase() === seg.toLowerCase());
      if (ci) return { ok: false, reason: `대소문자 불일치 → 실제 이름: ${[...walked, ci].join('/')}` };
      const nf = names.find((n) => n.normalize('NFC') === seg.normalize('NFC'));
      if (nf) return { ok: false, reason: `유니코드 정규화(NFC/NFD) 불일치 → 실제 이름: ${[...walked, nf].join('/')}` };
      return { ok: false, reason: `파일 없음 (${[...walked, seg].join('/')})` };
    }
    walked.push(seg);
    absDir = path.join(absDir, seg);
  }
  if (!walked.length || !fs.statSync(absDir).isFile()) return { ok: false, reason: '파일이 아니라 디렉터리' };
  return { ok: true, file: walked.join('/') };
}

// 파일 하나에서 참조를 뽑아 검사. 반환: { checked, skipped }
function checkFileRefs(relFile, { attrs, urls, literals, baseDir }) {
  let text = readText(relFile);
  if (relFile.endsWith('.html')) text = stripHtmlComments(text);
  const starts = lineStarts(text);
  const found = []; // { line, raw }
  const collect = (re, pick) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) found.push({ line: lineOf(starts, m.index), raw: pick(m) });
  };
  if (attrs) collect(ATTR_RE, (m) => m[2]);
  if (urls) collect(URL_RE, (m) => m[1] ?? m[2] ?? m[3]);
  if (literals) collect(LIT_RE, (m) => m[2]);

  let checked = 0, skipped = 0;
  const seen = new Set();
  for (const { line, raw } of found) {
    const ref = normalizeRef(raw);
    if (ref === null) { skipped++; continue; }
    if (seen.has(ref)) continue; // 같은 파일 안의 같은 참조는 한 번만 보고
    seen.add(ref);
    checked++;
    const res = resolveRef(baseDir, ref);
    if (!res.ok) fail(`${relFile}:${line}`, `"${raw}" → ${res.reason}`);
  }
  return { checked, skipped };
}

// (c) index.html 이 dir 의 파일을 정확히 한 번씩, (enforceOrder 면) 사전순으로 참조하는지
function checkExactlyOnce(kind, relDir, expectedNames, actualRefs, enforceOrder) {
  const expected = expectedNames.map((n) => `${relDir}/${n}`);
  const count = new Map();
  for (const a of actualRefs) count.set(a, (count.get(a) ?? 0) + 1);
  for (const e of expected) if (!count.has(e)) fail('index.html', `${kind} 누락: ${e} 를 참조하지 않음`);
  for (const [a, n] of count) {
    if (!expected.includes(a)) fail('index.html', `${kind} 참조 대상이 ${relDir}/ 에 없음: ${a}`);
    if (n > 1) fail('index.html', `${kind} 중복 참조 (${n}회): ${a}`);
  }
  if (enforceOrder) {
    const actualKnown = [...new Set(actualRefs.filter((a) => expected.includes(a)))];
    const expectedKnown = expected.filter((e) => actualKnown.includes(e));
    if (actualKnown.join('\n') !== expectedKnown.join('\n')) {
      fail('index.html', `${kind} 순서가 ${relDir}/ 사전순과 다름\n      기대: ${expectedKnown.join(', ')}\n      실제: ${actualKnown.join(', ')}`);
    }
  }
}

function main() {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
    console.error(`check-refs: 루트 디렉터리를 찾을 수 없음: ${ROOT}`);
    return 2;
  }
  console.log(`check-refs: root = ${ROOT}`);

  const cssFiles = listDir(CSS_DIR, '.css');
  const jsFiles = listDir(JS_DIR, '.js');
  if (cssFiles === null) fail(`${CSS_DIR}/`, '디렉터리 없음');
  if (jsFiles === null) fail(`${JS_DIR}/`, '디렉터리 없음');
  else if (!jsFiles.length) fail(`${JS_DIR}/`, '*.js 파일이 하나도 없음');
  const htmlPresent = HTML_FILES.filter((f) => {
    const ok = fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile();
    if (!ok) fail(f, '파일 없음');
    return ok;
  });

  // (a) 문법
  let syntaxOk = 0;
  for (const name of jsFiles ?? []) {
    const abs = path.join(ROOT, JS_DIR, name);
    const r = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
    if (r.status === 0) { syntaxOk++; continue; }
    const detail = (r.stderr || r.stdout || String(r.error ?? '')).trim().split('\n').slice(0, 6).join('\n      ');
    fail(`${JS_DIR}/${name}`, `문법 오류 (node --check)\n      ${detail}`);
  }
  console.log(`[syntax] ${JS_DIR}/*.js  ${syntaxOk}/${jsFiles?.length ?? 0} OK`);

  // (b) 참조
  let checked = 0, skipped = 0;
  const perFile = [];
  const scan = (relFile, opts) => {
    const r = checkFileRefs(relFile, opts);
    checked += r.checked; skipped += r.skipped;
    perFile.push(`${relFile} ${r.checked}`);
  };
  for (const f of htmlPresent) scan(f, { attrs: true, urls: true, literals: true, baseDir: '' });
  for (const name of cssFiles ?? []) scan(`${CSS_DIR}/${name}`, { urls: true, baseDir: CSS_DIR });
  for (const name of jsFiles ?? []) scan(`${JS_DIR}/${name}`, { literals: true, baseDir: '' });
  console.log(`[refs]   ${checked} local refs checked, ${skipped} skipped (external/data/hash/dynamic)`);
  console.log(`         ${perFile.join(' · ')}`);

  // (c) index.html 이 css/·js/ 를 정확히 한 번씩, js 는 사전순으로
  if (htmlPresent.includes('index.html')) {
    const text = stripHtmlComments(readText('index.html'));
    const tagRefs = (re) => {
      const out = [];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const ref = normalizeRef(m[2]);
        if (ref !== null) out.push(ref.replace(/^\.\//, ''));
      }
      return out;
    };
    const linkRefs = tagRefs(LINK_RE).filter((r) => r.startsWith(`${CSS_DIR}/`));
    const scriptRefs = tagRefs(SCRIPT_RE).filter((r) => r.startsWith(`${JS_DIR}/`));
    if (cssFiles) checkExactlyOnce('<link> css', CSS_DIR, cssFiles, linkRefs, false);
    if (jsFiles) checkExactlyOnce('<script> js', JS_DIR, jsFiles, scriptRefs, true);
    console.log(`[order]  index.html  <link> css ${linkRefs.length}/${cssFiles?.length ?? '?'}  ·  <script> js ${scriptRefs.length}/${jsFiles?.length ?? '?'}`);
    if (scriptRefs.length) console.log(`         script order: ${scriptRefs.join(' → ')}`);
  }

  if (failures.length) {
    console.log(`\nFAIL (${failures.length})`);
    for (const f of failures) console.log(`  - ${f}`);
    return 1;
  }
  console.log('\nOK — 참조 무결성 · 문법 · 로드 순서 모두 통과');
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error(`check-refs: 실행 오류 — ${e?.stack ?? e}`);
  process.exit(2);
}
