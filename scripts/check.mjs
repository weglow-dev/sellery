#!/usr/bin/env node
/* 셀러리 프로토타입 자가 점검 — 의존성 없음, Node 20+.
   로컬:  node scripts/check.mjs
   CI:    .github/workflows/ci.yml 에서 동일하게 실행 (required check "프로토타입 점검")

   빌드가 없는 정적 사이트라, 배포 전에 "브라우저에서 열자마자 죽는" 종류의 실수를 잡는다.
   1. js/*.js 전부 node --check 문법 검사 · login.html 인라인 <script> 문법 검사
   2. 병합 충돌 흔적 / debugger 잔여물 (html · css · js)
   3. 시드 키 const LS='sellery-proto-vNN' 존재 (js/02-state.js)
   4. 라우트별 주요 화면 함수가 살아 있는지 (js/ 전체에서 검색)
   5. 로컬 참조가 실제 파일로 — 대소문자까지 정확히 — 해석되는지
      index.html · login.html : href/src 속성, url(…)  ·  css/*.css : url(…)  ·  js/*.js + html : 'assets/…' 'css/…' 'js/…' '*.html' 리터럴
      건너뜀: http(s): · //… · data: · mailto: · '#…' · '${…}' 같은 동적 값 · 'assets/' 처럼 /로 끝나는 접두어
   6. index.html 이 css/*.css 와 js/*.js 를 각각 정확히 한 번씩 참조하고, <script src> 순서가 js/ 사전순과 같은지

   종료 코드: 통과 0 · 실패 1 · 실행 불가 2 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] ?? path.join(SCRIPT_DIR, '..'));
const HTML_FILES = ['index.html', 'login.html'];
const CSS_DIR = 'css', JS_DIR = 'js';

const failures = [];
const fail = (where, msg) => failures.push(`${where}  ${msg}`);
const pass = (m) => console.log('  ok    ' + m);

const readText = (relFile) => fs.readFileSync(path.join(ROOT, relFile), 'utf8').replace(/\r\n?/g, '\n');
const exists = (relFile) => { const p = path.join(ROOT, relFile); return fs.existsSync(p) && fs.statSync(p).isFile(); };
function listDir(relDir, ext) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;
  return fs.readdirSync(abs).filter((n) => n.endsWith(ext) && fs.statSync(path.join(abs, n)).isFile()).sort();
}
const nodeCheck = (absFile) => spawnSync(process.execPath, ['--check', absFile], { encoding: 'utf8' });
const errDetail = (r) => (r.stderr || r.stdout || String(r.error ?? '')).trim().split('\n').slice(0, 6).join('\n      ');

function main() {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) { console.error(`check: 루트 없음: ${ROOT}`); return 2; }
  console.log(`check: root = ${ROOT}`);
  const cssFiles = listDir(CSS_DIR, '.css');
  const jsFiles = listDir(JS_DIR, '.js');
  if (cssFiles === null) fail(`${CSS_DIR}/`, '디렉터리 없음');
  if (jsFiles === null) fail(`${JS_DIR}/`, '디렉터리 없음');
  else if (!jsFiles.length) fail(`${JS_DIR}/`, '*.js 파일이 하나도 없음');
  const htmlPresent = HTML_FILES.filter((f) => { const ok = exists(f); if (!ok) fail(f, '파일 없음'); return ok; });

  /* 1. 문법 — js/*.js 와 html 인라인 <script> */
  let ok = 0;
  for (const name of jsFiles ?? []) {
    const r = nodeCheck(path.join(ROOT, JS_DIR, name));
    if (r.status === 0) ok++; else fail(`${JS_DIR}/${name}`, `문법 오류 (node --check)\n      ${errDetail(r)}`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slry-'));
  let inline = 0;
  for (const page of htmlPresent) {
    const html = readText(page);
    const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, attrs]) => !/\bsrc=/i.test(attrs) && !/type=["'](?!text\/javascript|module)/i.test(attrs));
    blocks.forEach(([, , code], i) => {
      const f = path.join(tmp, `${page.replace(/\W/g, '_')}-${i}.js`);
      fs.writeFileSync(f, code);
      const r = nodeCheck(f);
      if (r.status === 0) inline++; else fail(`${page} 인라인 스크립트 #${i + 1}`, `문법 오류\n      ${errDetail(r)}`);
    });
  }
  pass(`문법: js/*.js ${ok}/${jsFiles?.length ?? 0} · 인라인 스크립트 ${inline}개`);

  /* 2. 병합 충돌 흔적 / debugger */
  const textFiles = [...htmlPresent, ...(cssFiles ?? []).map((n) => `${CSS_DIR}/${n}`), ...(jsFiles ?? []).map((n) => `${JS_DIR}/${n}`)];
  for (const f of textFiles) {
    const t = readText(f);
    if (/^(<{7}|={7}|>{7})/m.test(t)) fail(f, '병합 충돌 표시가 남아 있음');
    if (/^\s*debugger\s*;?\s*$/m.test(t)) fail(f, 'debugger 문이 남아 있음');
  }
  pass('충돌 표시 / debugger 없음');

  /* 3. 시드 키 — 데이터 구조를 바꿨으면 버전을 올려야 기존 방문자 화면이 깨지지 않는다 */
  const allJs = (jsFiles ?? []).map((n) => readText(`${JS_DIR}/${n}`)).join('\n');
  const seed = allJs.match(/const\s+LS\s*=\s*'([^']+)'/);
  if (!seed) fail(`${JS_DIR}/02-state.js`, "시드 키(const LS='sellery-proto-vNN')를 찾지 못함");
  else pass(`시드 키 ${seed[1]}`);

  /* 4. 라우트별 화면 함수 — 탭 하나가 통째로 사라지는 사고 방지 */
  for (const fn of ['vSellerHome', 'vBrandHome', 'vAdminOrders', 'vBrandCS', 'vCustHome', 'vStore', 'vAdminSettle', 'render']) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(allJs)) fail(`${JS_DIR}/`, `${fn}() 없음`);
  }
  pass('주요 화면 함수 존재');

  /* 5. 참조 무결성 */
  const SKIP_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
  const ATTR_RE = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/g;
  const URL_RE = /\burl\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^"'()\s]+))\s*\)/g;
  const LIT_RE = /(["'`])((?:\.\/)?(?:assets|css|js)\/[^"'`\n]*|[\w.-]+\.html(?:[?#][^"'`\n]*)?)\1/g;
  const stripHtmlComments = (t) => t.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const normalizeRef = (raw) => {
    let r = raw.trim(); if (!r) return null;
    r = r.split(/[?#]/)[0]; if (!r) return null;
    if (SKIP_RE.test(r) || /[${}<>]/.test(r) || r.endsWith('/')) return null;
    try { r = decodeURIComponent(r); } catch { /* not encoded */ }
    return r;
  };
  const dirCache = new Map();
  const entriesOf = (absDir) => { if (!dirCache.has(absDir)) dirCache.set(absDir, fs.readdirSync(absDir)); return dirCache.get(absDir); };
  function resolveRef(baseDir, ref) {
    if (ref.startsWith('/')) return { ok: false, reason: '루트 절대경로 — 하위 경로 배포에서 깨짐. 상대경로로 쓸 것' };
    const stack = [];
    for (const s of [...(baseDir ? baseDir.split('/') : []), ...ref.split('/')]) {
      if (s === '' || s === '.') continue;
      if (s === '..') { if (!stack.length) return { ok: false, reason: '저장소 루트 밖' }; stack.pop(); continue; }
      stack.push(s);
    }
    let absDir = ROOT; const walked = [];
    for (const seg of stack) {
      let names; try { names = entriesOf(absDir); } catch { return { ok: false, reason: `${walked.join('/')} 는 디렉터리가 아님` }; }
      if (!names.includes(seg)) {
        const ci = names.find((n) => n.toLowerCase() === seg.toLowerCase());
        if (ci) return { ok: false, reason: `대소문자 불일치 → 실제 이름: ${[...walked, ci].join('/')}` };
        const nf = names.find((n) => n.normalize('NFC') === seg.normalize('NFC'));
        if (nf) return { ok: false, reason: `유니코드 정규화 불일치 → 실제 이름: ${[...walked, nf].join('/')}` };
        return { ok: false, reason: `파일 없음 (${[...walked, seg].join('/')})` };
      }
      walked.push(seg); absDir = path.join(absDir, seg);
    }
    if (!walked.length || !fs.statSync(absDir).isFile()) return { ok: false, reason: '파일이 아니라 디렉터리' };
    return { ok: true };
  }
  const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
  let checked = 0, skipped = 0;
  function scan(relFile, { attrs, urls, literals, baseDir }) {
    let text = readText(relFile);
    if (relFile.endsWith('.html')) text = stripHtmlComments(text);
    const found = [];
    const collect = (re, pick) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) found.push({ idx: m.index, raw: pick(m) }); };
    if (attrs) collect(ATTR_RE, (m) => m[2]);
    if (urls) collect(URL_RE, (m) => m[1] ?? m[2] ?? m[3]);
    if (literals) collect(LIT_RE, (m) => m[2]);
    const seen = new Set();
    for (const { idx, raw } of found) {
      const ref = normalizeRef(raw);
      if (ref === null) { skipped++; continue; }
      if (seen.has(ref)) continue;
      seen.add(ref); checked++;
      const res = resolveRef(baseDir, ref);
      if (!res.ok) fail(`${relFile}:${lineOf(text, idx)}`, `"${raw}" → ${res.reason}`);
    }
  }
  for (const f of htmlPresent) scan(f, { attrs: true, urls: true, literals: true, baseDir: '' });
  for (const n of cssFiles ?? []) scan(`${CSS_DIR}/${n}`, { urls: true, baseDir: CSS_DIR });
  for (const n of jsFiles ?? []) scan(`${JS_DIR}/${n}`, { literals: true, baseDir: '' });
  pass(`참조 ${checked}개 확인 (${skipped}개 건너뜀: 외부/data/해시/동적)`);

  /* 6. index.html 이 css/·js/ 를 정확히 한 번씩, js 는 사전순으로 */
  if (htmlPresent.includes('index.html')) {
    const text = stripHtmlComments(readText('index.html'));
    const tagRefs = (re) => { const out = []; re.lastIndex = 0; let m; while ((m = re.exec(text))) { const r = normalizeRef(m[2]); if (r !== null) out.push(r.replace(/^\.\//, '')); } return out; };
    const linkRefs = tagRefs(/<link\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi).filter((r) => r.startsWith(`${CSS_DIR}/`));
    const scriptRefs = tagRefs(/<script\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi).filter((r) => r.startsWith(`${JS_DIR}/`));
    const once = (kind, relDir, expectedNames, actual, enforceOrder) => {
      const expected = expectedNames.map((n) => `${relDir}/${n}`);
      const count = new Map(); for (const a of actual) count.set(a, (count.get(a) ?? 0) + 1);
      for (const e of expected) if (!count.has(e)) fail('index.html', `${kind} 누락: ${e}`);
      for (const [a, n] of count) { if (!expected.includes(a)) fail('index.html', `${kind} 참조 대상이 ${relDir}/ 에 없음: ${a}`); if (n > 1) fail('index.html', `${kind} 중복 참조 (${n}회): ${a}`); }
      if (enforceOrder) {
        const act = [...new Set(actual.filter((a) => expected.includes(a)))];
        const exp = expected.filter((e) => act.includes(e));
        if (act.join('\n') !== exp.join('\n')) fail('index.html', `${kind} 순서가 ${relDir}/ 사전순과 다름\n      기대: ${exp.join(', ')}\n      실제: ${act.join(', ')}`);
      }
    };
    if (cssFiles) once('<link> css', CSS_DIR, cssFiles, linkRefs, false);
    if (jsFiles) once('<script> js', JS_DIR, jsFiles, scriptRefs, true);
    pass(`index.html: css ${linkRefs.length}/${cssFiles?.length ?? '?'} · js ${scriptRefs.length}/${jsFiles?.length ?? '?'} (${scriptRefs.map((s) => s.replace(`${JS_DIR}/`, '')).join(' → ')})`);
  }

  if (failures.length) {
    console.log(`\n${failures.length}건 실패`);
    for (const f of failures) console.log(`  FAIL  ${f}`);
    return 1;
  }
  console.log('\n전부 통과');
  return 0;
}

try { process.exit(main()); } catch (e) { console.error(`check: 실행 오류 — ${e?.stack ?? e}`); process.exit(2); }
