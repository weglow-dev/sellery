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
  spec.startsWith("$lib/server/") ||
  /^\.{1,2}\/.*\.server(\.(ts|js))?$/.test(spec);

const isDemoCoreImport = (spec) =>
  spec === "@sellery/core" || DEMO_CORE_SUBPATHS.some((s) => spec === `@sellery/core/${s}` || spec === `@sellery/core/${s}.ts`);

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

// ---------- packages/db · packages/payments ----------
for (const pkg of ["db", "payments"]) {
  const srcDir = join(ROOT, "packages", pkg, "src");
  for (const file of walk(srcDir)) {
    const r = rel(file);
    if (/\.server\.ts$/.test(r)) continue;
    for (const { spec, line } of importsOf(file)) {
      const relServer = /^\.{1,2}\/(.*\/)?server\//.test(spec) || /^\.{1,2}\/.*\.server$/.test(spec);
      if (relServer || spec.startsWith("@sellery/db/server/") || spec.startsWith("@sellery/payments/server/")) {
        report("error", file, line, `(c) 순수 파일이 서버 모듈을 import: '${spec}' — 서버 의존은 *.server.ts 에만`);
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
