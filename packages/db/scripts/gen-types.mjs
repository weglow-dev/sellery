// `npm run gen:types`(루트) — Supabase 타입 생성 (Windows/리눅스 공용). web/scripts/gen-types.mjs 의 이식 — 출력 위치만 다르다 (docs/monorepo-migration.md §3.5).
//
// 저장소 루트(supabase/config.toml 이 있는 곳)에서 `npx supabase gen types typescript --linked` 를 실행하고
// 결과를 packages/db/src/database.types.ts 에 UTF-8(BOM 없음) · LF 로 쓴다.
// 셸 리다이렉트(`>`) 대신 스크립트를 쓰는 이유: PowerShell 의 `>` 는 UTF-16/BOM 을 쓰고,
// CLI 가 실패해도 빈 파일로 덮어써 버리기 때문 — 여기서는 출력이 비었거나 형식이 아니면 파일을 건드리지 않는다.
// 사전 조건: `supabase login` + `supabase link --project-ref …` (docs/app-plan.md §13).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgDir, "..", "..");
const outFile = resolve(pkgDir, "src", "database.types.ts");

const result = spawnSync("npx", ["supabase", "gen", "types", "typescript", "--linked"], {
  cwd: repoRoot,
  encoding: "utf8",
  shell: true, // npx 는 Windows 에서 npx.cmd — shell 경유가 플랫폼 공용
  stdio: ["ignore", "pipe", "inherit"],
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error) {
  console.error("[gen:types] supabase CLI 실행 실패:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[gen:types] supabase CLI 종료 코드 ${result.status} — 파일을 건드리지 않았습니다.`);
  process.exit(result.status ?? 1);
}

let out = (result.stdout ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
if (!out.trimStart().startsWith("export type Json")) {
  console.error("[gen:types] 출력이 database.types.ts 형식이 아닙니다 — 파일을 건드리지 않았습니다.");
  console.error(out.slice(0, 400));
  process.exit(1);
}
if (!out.endsWith("\n")) out += "\n";

let prev = null;
try {
  prev = readFileSync(outFile, "utf8");
} catch {
  prev = null;
}
if (prev === out) {
  console.log(`[gen:types] 변경 없음: ${outFile}`);
} else {
  writeFileSync(outFile, out, { encoding: "utf8" });
  console.log(`[gen:types] 갱신: ${outFile} (${out.length.toLocaleString()} chars)`);
}
