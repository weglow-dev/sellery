// 패키지 경계 검사 — docs/monorepo-migration.md §3.3 (a)~(d). CI: `node scripts/check-boundaries.mjs` (루트 `npm run check:boundaries`).
//
// SvelteKit 은 `*.server.ts` 를 **앱 cwd 안**에서만 서버 전용으로 본다(`@sveltejs/kit/src/exports/vite/index.js` is_internal) —
// 워크스페이스 패키지의 `packages/*/src/server/*.server.ts` 는 검사 대상이 아니다. 이 스크립트가 그 빈틈을 메운다(`import "server-only"` 의 대체 3겹 중 하나).
//
//   (a) apps/*/src 의 브라우저 도달 파일(`.svelte` · `+page.ts` · `+layout.ts` · `src/lib/(server 밖)` 등 — `*.server.ts` · `+server.ts` · `hooks.server.ts` ·
//       `src/lib/server/**` 가 아닌 전부)이 `@sellery/db/server/*` · `@sellery/payments/server/*` · `$lib/server/*` · 상대 `*.server` 모듈을 import → 실패
//   (b) apps/shop · apps/influencer 의 `(demo)` 밖 파일(서버 파일 포함)이 `@sellery/core` 를 bare 로, 또는
//       `@sellery/core/{state.svelte,actions,seed,storage,ui.svelte,helpers}` 를 import → 실패.  admin(ssr=false 데모)은 허용.
//       shop 은 S2(SSR 전환), influencer 는 S5(콘솔 이식), brand 는 브랜드 콘솔 1단계부터 **error** — 데모 화면은 `routes/(demo)/**` 안에서만 허용(allowlist, 결정 C).
//   (c) packages/{db,payments}/src 의 `.server.ts` 가 아닌 파일이 `server/` 모듈을 import → 실패 (테스트 파일 포함 — 순수 규칙만 테스트한다)
//   (d) packages/ui/src/site/** 가 `@sellery/core` 를 bare 로 import → 실패 (폴더가 아직 없으면 건너뛴다)
//   (e) 서버 파일(`*.server.ts` · `+server.ts` · `src/lib/server/**`)이 `@sellery/db/browser` 를 import → 실패 (브라우저 클라이언트는 브라우저에서만)
//   (f) MYR 앱 · `@sellery/myr-core` 가 셀러리 패키지(`@sellery/{db,payments,core,ui}`)를 import → 실패 · (g) `@sellery/myr-core` 가 SvelteKit 별칭을 import → 실패
//   (h) MYR 코드(`apps/myr*/src` · `packages/myr-core/src` · 테스트 제외)가 **서버 판정 식을 다시 쓰면** 실패 — 백엔드 원칙 1 · 2(CLAUDE.md).
//       줄의 남은 수량 · 살아 있는 줄 · 금액 − 환불 · 단가 × 수량 · 주문/요청/상품 상태 묶음 · 요청 사유 규칙 · 품절 · 할인율 범위 · 판매가 상한은 DB 함수 하나가 정하고(0097~0099),
//       화면 · 서버 TS 는 그 값을 응답에서 읽는다. 아래 MYR_MIRROR_RULES 의 식이 나오면 "서버 값을 쓰라"는 안내와 함께 막는다.
//       DB 함수끼리 같은 식을 다시 쓰는 것은 pgTAP `supabase/tests/myr_single_source.test.sql` 이 막는다(짝).
//
// 의존성 0 · Node 22. 위반은 `파일:줄 — 사유` 로 출력, error 가 하나라도 있으면 exit 1.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 규칙 (b) 의 강제 수준 — 앱별. 'error' 로 바꾸는 시점은 위 주석. */
const DEMO_RULE = {
  shop: "error", // S2(shop SSR 전환)에서 error 로 올림 — shop 은 @sellery/core/{constants,util,icons,types} 만
  influencer: "error", // S5(콘솔 이식)에서 error 로 올림 — 데모 상태는 routes/(demo)/** 에서만
  brand: "error", // 브랜드 콘솔 1단계(docs/brand-console-plan.md §2)에서 error 로 올림 — 데모 상태는 routes/(demo)/** 에서만
};

const DEMO_CORE_SUBPATHS = ["state.svelte", "actions", "seed", "storage", "ui.svelte", "helpers"];
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", ".vercel", "static", "build", "dist", ".git"]);
const SRC_EXT = /\.(ts|js|mjs|svelte)$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SRC_EXT.test(name)) out.push(p);
  }
  return out;
}

/** import / export-from / dynamic import 의 specifier 와 줄 번호 */
function importsOf(file) {
  const text = readFileSync(file, "utf8");
  const out = [];
  const re =
    /(?:^|[^\w$.])(?:import|export)\s*(?:type\s+)?(?:[\w$*{}\s,]*?\s*from\s*)?["']([^"']+)["']|(?:^|[^\w$.])import\s*\(\s*["']([^"']+)["']\s*\)/gm;
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    const line = text.slice(0, m.index).split("\n").length;
    out.push({ spec, line });
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join("/");

const isServerFile = (r) =>
  /\.server\.(ts|js)$/.test(r) || /\/\+server\.(ts|js)$/.test(r) || /\/src\/lib\/server\//.test(r) || /\/src\/hooks\.server\.(ts|js)$/.test(r);

const isServerImport = (spec) =>
  spec.startsWith("@sellery/db/server/") ||
  spec.startsWith("@sellery/payments/server/") ||
  spec.startsWith("@sellery/myr-core/server/") ||
  spec.startsWith("$lib/server/") ||
  /^\.{1,2}\/.*\.server(\.(ts|js))?$/.test(spec);

const isDemoCoreImport = (spec) =>
  spec === "@sellery/core" || DEMO_CORE_SUBPATHS.some((s) => spec === `@sellery/core/${s}` || spec === `@sellery/core/${s}.ts`);

const isMyrApp = (app) => app === "myr" || app.startsWith("myr-");
const isSelleryPackageImport = (spec) => /^@sellery\/(db|payments|core|ui)(\/|$)/.test(spec);

const errors = [];
const warnings = [];
const report = (level, file, line, why) => (level === "error" ? errors : warnings).push(`${rel(file)}:${line} — ${why}`);

// ---------- apps/* ----------
const appsDir = join(ROOT, "apps");
for (const app of existsSync(appsDir) ? readdirSync(appsDir) : []) {
  const srcDir = join(appsDir, app, "src");
  for (const file of walk(srcDir)) {
    const r = rel(file);
    const server = isServerFile(r);
    const inDemoGroup = /\/routes\/\(demo\)\//.test(r);
    for (const { spec, line } of importsOf(file)) {
      // (a) 브라우저 도달 파일의 서버 모듈 import
      if (!server && isServerImport(spec)) {
        report("error", file, line, `(a) 브라우저 도달 파일이 서버 전용 모듈을 import: '${spec}' — +*.server.ts 또는 $lib/server 배럴에서만`);
      }
      // (f) MYR 앱의 셀러리 패키지 import
      if (isMyrApp(app) && isSelleryPackageImport(spec)) {
        report("error", file, line, `(f) MYR 앱이 셀러리 패키지를 import: '${spec}' — 필요한 코드는 @sellery/myr-core 로 복사한다(docs/myr.md 결정 11)`);
      }
      // (e) 서버 파일의 브라우저 클라이언트 import
      if (server && spec === "@sellery/db/browser") {
        report("error", file, line, `(e) 서버 파일이 '@sellery/db/browser' 를 import — 서버는 event.locals.supabase 를 쓴다`);
      }
      // (b) shop · influencer 의 데모 상태 import
      const level = DEMO_RULE[app];
      if (level && !inDemoGroup && isDemoCoreImport(spec)) {
        report(
          level,
          file,
          line,
          `(b) ${app} 이 @sellery/core 데모 상태를 import: '${spec}' — SSR 앱은 @sellery/core/{constants,util,icons,types} 만 (데모 화면은 routes/(demo)/** 안에서만)`,
        );
      }
    }
  }
}

// ---------- packages/db · packages/payments · packages/myr-core ----------
for (const pkg of ["db", "payments", "myr-core"]) {
  const srcDir = join(ROOT, "packages", pkg, "src");
  for (const file of walk(srcDir)) {
    const r = rel(file);
    if (/\.server\.ts$/.test(r)) continue;
    for (const { spec, line } of importsOf(file)) {
      const relServer = /^\.{1,2}\/(.*\/)?server\//.test(spec) || /^\.{1,2}\/.*\.server$/.test(spec);
      if (relServer || spec.startsWith("@sellery/db/server/") || spec.startsWith("@sellery/payments/server/") || spec.startsWith("@sellery/myr-core/server/")) {
        report("error", file, line, `(c) 순수 파일이 서버 모듈을 import: '${spec}' — 서버 의존은 *.server.ts 에만`);
      }
    }
  }
}

// ---------- packages/myr-core (f · g) — 서버 파일 포함 전부 ----------
for (const file of walk(join(ROOT, "packages", "myr-core", "src"))) {
  for (const { spec, line } of importsOf(file)) {
    if (isSelleryPackageImport(spec)) {
      report("error", file, line, `(f) @sellery/myr-core 가 셀러리 패키지를 import: '${spec}' — 복사만(docs/myr.md 결정 11)`);
    }
    if (/^\$(env|app|lib)(\/|$)/.test(spec)) {
      report("error", file, line, `(g) @sellery/myr-core 가 SvelteKit 별칭을 import: '${spec}' — 설정은 configureMyrCore 로 주입한다`);
    }
  }
}

// ---------- (h) MYR — 서버 판정 식을 화면 · TS 에서 다시 쓰지 않는다 ----------
// 식 하나 = 규칙 하나. allow 는 그 식이 "형식(서버가 보내는 값의 종류)"으로만 쓰이는 파일. 새 예외를 넣기 전에 서버 응답에 값을 더하는 쪽을 먼저 본다.
const MYR_MIRROR_RULES = [
  { re: /\bqty\s*-\s*[\w.]*refunded_?[qQ]ty\b/, why: "줄의 남은 수량(수량 − 환불 수량)을 다시 계산 — 서버 값 leftQty(myr_line_left)를 쓴다" },
  { re: /['"]CANCELED['"]\s*&&[^\n]*\bleftQty\b|\bleftQty\s*(>|<=|===)\s*0\b/, why: "살아 있는 줄을 다시 판정 — 서버 값 live(myr_line_live)를 쓴다" },
  { re: /\b[aA]mount\s*-\s*[\w.]*refund_?[aA]mount\b/, why: "금액 − 환불을 다시 계산 — 서버 값(netAmount · amounts.net · myr_line_net)을 쓴다" },
  { re: /\b[uU]nit_?[pP]rice\s*\*|\*\s*[\w.]*[uU]nit_?[pP]rice\b/, why: "단가 × 수량을 다시 계산 — 서버 값(줄 amount · leftAmount · 예상 금액 lines · myr_line_amount)을 쓴다" },
  { re: /\bgoods\s*\+\s*[\w.]*shippingBack\b|\bshippingBack\s*\+\s*[\w.]*goods\b/, why: "결제 금액(상품 + 배송비)을 다시 계산 — 서버 값 paid 를 쓴다" },
  { re: /['"]PAID['"]\s*(,|\|\|)[^\n]*['"]PARTIAL_REFUNDED['"]/, why: "주문 상태 묶음을 다시 씀 — 서버 값(alive · claimStatus) 또는 DB 함수(myr_order_status_*)를 쓴다" },
  {
    re: /===\s*['"]pending['"]\s*\|\|[^\n]*===\s*['"]progress['"]|\[\s*['"]pending['"]\s*,\s*['"]progress['"]\s*\]/,
    why: "열린 요청 상태 묶음을 다시 씀 — 서버 값 open(myr_claim_status_open)을 쓴다",
    allow: ["packages/myr-core/src/order-view.ts"], // OPEN_CLAIM_STATUSES — 서버가 보내는 값의 형식(타입 가드)
  },
  {
    re: /===\s*['"](listed|live)['"]\s*\|\|[^\n]*===\s*['"]paused['"]|===\s*['"]draft['"]\s*\|\|[^\n]*===\s*['"]rejected['"]/,
    why: "상품 상태 묶음을 다시 씀 — 서버 값 approved · editable(myr_product_status_*)을 쓴다",
  },
  {
    re: /(===|!==)\s*['"](단순 변심|파손 · 누액|오배송)['"]/,
    why: "요청 사유 규칙(요청 종류 · 사진 필수 · 기한 적용)을 다시 씀 — 서버 값 ClaimFormRules(myr_app_claim_form_rules)를 쓴다",
  },
  {
    re: /\brefunded_?[qQ]ty\s*>\s*0\b/,
    why: "줄에 환불이 있었는지 다시 판정 — 서버 값 hasRefund(myr_line_has_refund · lineHasRefund)를 쓴다",
  },
  { re: /\bstock(Left)?\s*(<=|<|===)\s*[01]\b/, why: "품절을 다시 판정 — 서버 값 soldOut(myr_product_sold_out)을 쓴다" },
  { re: /\bGB_PCT_(MIN|MAX)\b|\b10_?000_?000\b/, why: "공구 할인율 범위 · 판매가 상한 숫자를 화면에 둠 — 서버 값(pctRange · 거절 응답 max)을 쓴다" },
  { re: /\bsales\s*-\s*[\w.]*refund_?[aA]dj\b/, why: "순매출(판매 − 정산 뒤 환불)을 다시 계산 — 서버 값 netSales(myr_settlement_net_sales)를 쓴다" },
  { re: /\bsettle\s*-\s*[\w.]*offset\b/, why: "줄 지급액(정산금 − 상계 + 보증금 환급)을 다시 계산 — 서버 값 payout(myr_settlement_row_payout)을 쓴다" },
  { re: /\bdepositPaid\s*-\s*[\w.]*depositRefunded\b/, why: "맡긴 보증금을 다시 계산 — 서버 값 depositHeld 를 쓴다" },
  {
    re: /\.reduce\([^\n]*\.(remaining|depositPaid|depositHeld|depositTotal|nextOffset|offset|payout|netSales)\b/,
    why: "정산 합계를 화면에서 더함 — 서버 값(ledgerTotal · 달 total · 지급 건 금액 myr_payout_amount)을 쓴다",
  },
  { re: /\bremaining\s*===?\s*0\b/, why: "상환 완료를 다시 판정 — 서버 값 paidOff(myr_mfg_paid_off)를 쓴다" },
  { re: /\bdeposit(Held|Unpaid|Refunded)\s*(===?|!==|>|<=)\s*0\b/, why: "보증금 상태를 다시 판정 — 서버 값 depositState(myr_mfg_deposits)를 쓴다" },
  { re: /\breleasedIn\s*\|\||\|\|\s*[\w.]*nextPayout\b/, why: "이 달 합계에서 빠진 줄을 다시 판정 — 서버 값 counted(myr_settlement_card_rows)를 쓴다" },
  { re: /\.some\([^\n]*\.hasLedger\b/, why: "보류 해제 예정을 다시 판정 — 서버 값 releasable(myr_settlement_row_releasable)을 쓴다" },
  { re: /Date\.UTC\([^)\n]*,\s*1\s*,\s*4\s*[,)]/, why: "정산 지급 시각(다음 달 1일 오후 1시)을 화면에서 계산 — 서버 값 payAt · settleAt(myr_settlement_pay_at)을 쓴다" },
];
/** 주석을 뺀 코드 줄 — 줄 주석 · 블록 주석 줄 · 줄 끝 주석(URL 의 :// 는 남긴다) */
function codeLines(file) {
  let block = false;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((raw, i) => {
      let t = raw;
      if (block) {
        const end = t.indexOf("*/");
        if (end < 0) return { line: i + 1, text: "" };
        t = t.slice(end + 2);
        block = false;
      }
      t = t.replace(/\/\*.*?\*\//g, "").replace(/<!--.*?-->/g, "");
      const start = t.indexOf("/*");
      if (start >= 0) {
        block = true;
        t = t.slice(0, start);
      }
      return { line: i + 1, text: t.replace(/(^|[^:'"`\\])\/\/.*$/, "$1") };
    });
}
const isTestFile = (r) => /\/src\/test\//.test(r) || /\.test\.(ts|js)$/.test(r);
const myrSrcDirs = [
  ...(existsSync(appsDir) ? readdirSync(appsDir).filter(isMyrApp).map((app) => join(appsDir, app, "src")) : []),
  join(ROOT, "packages", "myr-core", "src"),
];
for (const dir of myrSrcDirs) {
  for (const file of walk(dir)) {
    const r = rel(file);
    if (isTestFile(r)) continue;
    for (const { line, text } of codeLines(file)) {
      if (!text.trim()) continue;
      for (const rule of MYR_MIRROR_RULES) {
        if (rule.allow?.includes(r)) continue;
        if (rule.re.test(text)) report("error", file, line, `(h) ${rule.why} — 백엔드 원칙 1(CLAUDE.md)`);
      }
    }
  }
}

// ---------- packages/ui/src/site ----------
const siteDir = join(ROOT, "packages", "ui", "src", "site");
for (const file of walk(siteDir)) {
  for (const { spec, line } of importsOf(file)) {
    if (isDemoCoreImport(spec)) {
      report("error", file, line, `(d) packages/ui/src/site 가 @sellery/core 데모 상태를 import: '${spec}' — site 컴포넌트는 props-only`);
    }
  }
}

// ---------- 결과 ----------
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`[check-boundaries] errors ${errors.length} · warnings ${warnings.length}`);
if (errors.length > 0) process.exit(1);
