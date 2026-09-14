#!/usr/bin/env node
/* 셀러리 프로토타입 자가 점검 — 의존성 없음.
   로컬:  node scripts/check.mjs
   CI:    .github/workflows/ci.yml 에서 동일하게 실행

   단일 파일 프로토타입이라 빌드가 없다. 대신 배포 전에
   "브라우저에서 열자마자 죽는" 종류의 실수만 확실히 잡는다. */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGES = ['index.html', 'login.html'];
let failed = 0;
const fail = (m) => { console.error('  FAIL  ' + m); failed++; };
const pass = (m) => console.log('  ok    ' + m);

/* 1. 인라인 <script> 문법 검사 — 오타 하나로 화면이 백지가 되는 걸 막는다 */
const tmp = mkdtempSync(join(tmpdir(), 'slry-'));
for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/\bsrc=/i.test(attrs) && !/type=["'](?!text\/javascript|module)/i.test(attrs));
  if (!blocks.length) fail(`${page}: 인라인 스크립트를 찾지 못함`);
  blocks.forEach(([, , code], i) => {
    const f = join(tmp, `${page.replace(/\W/g, '_')}-${i}.js`);
    writeFileSync(f, code);
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      fail(`${page} 스크립트 #${i + 1} 문법 오류\n${String(e.stderr || e.message).trim()}`);
    }
  });
  pass(`${page}: 인라인 스크립트 ${blocks.length}개 문법 정상`);
}

/* 2. 병합 충돌 흔적 / 디버그 잔여물 */
for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  if (/^(<{7}|={7}|>{7})/m.test(html)) fail(`${page}: 병합 충돌 표시가 남아 있음`);
  if (/^\s*debugger\s*;?\s*$/m.test(html)) fail(`${page}: debugger 문이 남아 있음`);
}
pass('충돌 표시 / debugger 없음');

/* 3. 시드 키 — 데이터 구조를 바꿨으면 버전을 올려야 기존 방문자 화면이 깨지지 않는다 */
const index = readFileSync('index.html', 'utf8');
const seed = index.match(/const\s+LS\s*=\s*'([^']+)'/);
if (!seed) fail("index.html: 시드 키(const LS='sellery-proto-vNN')를 찾지 못함");
else pass(`시드 키 ${seed[1]}`);

/* 4. 라우트별 화면 함수가 살아 있는지 — 탭 하나가 통째로 사라지는 사고 방지 */
for (const fn of ['vSellerHome', 'vBrandHome', 'vAdminOrders', 'vBrandCS', 'vCustHome', 'vStore', 'vAdminSettle']) {
  if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(index)) fail(`index.html: ${fn}() 없음`);
}
pass('주요 화면 함수 존재');

/* 5. 자산 참조 — 로컬에 없는 이미지를 가리키면 배포 후에야 알게 된다 */
const missing = [...index.matchAll(/["'(](assets\/[^"')\s]+)["')]/g)]
  .map((m) => m[1])
  .filter((p, i, a) => a.indexOf(p) === i)
  .filter((p) => { try { readFileSync(p); return false; } catch { return true; } });
if (missing.length) fail('없는 자산 참조: ' + missing.join(', '));
else pass('assets/ 참조 전부 존재');

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
