// 마이그레이션 번호 검사 — CI: `node scripts/check-migrations.mjs` (루트 `npm run check:migrations`).
//
// 왜 필요한가: `supabase/migrations/` 는 **4자리 번호 접두**로 적용 순서를 정하는데, 번호가 같아도
// **파일명이 다르면 git 이 충돌로 알려주지 않는다.** 두 사람이 각자 같은 번호를 쓰면 양쪽 브랜치가
// 조용히 병합되고, `supabase db push --linked` 가 터진다:
//
//     ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
//     Key (version)=(0047) already exists.
//
// 그때는 SQL 이 **이미 실행된 뒤** 버전 기록만 실패하므로 클라우드 상태와 기록이 어긋난다.
// 실제로 두 번 났다 — 0043(팀원 `purge_demo_data` × 내 `campaign_alerts` → 0044 로 이동) ·
// 0047(팀원 `no_monthly_sample_quota` × 내 `settle_cancel` → 0048 로 이동). 둘 다 병합 뒤에 발견했다.
//
// 검사 항목
//   (a) **번호 중복** — 같은 4자리 접두가 둘 이상이면 error. 이 스크립트의 본래 목적이다.
//   (b) 형식 — `NNNN_snake_case.sql` 이 아니면 error (번호를 못 읽으면 순서를 보장할 수 없다).
//   (c) 번호 건너뜀 — 연속하지 않으면 warning. 병합 순서가 뒤바뀌었거나 파일을 지운 흔적일 수 있다.
//       error 가 아닌 이유: 번호를 비워 두는 것 자체가 사고는 아니다(되돌린 마이그레이션).
//
// 의존성 0 · Node 22. error 가 하나라도 있으면 exit 1.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");

const errors = [];
const warnings = [];

/** `0048_settle_cancel.sql` → { num: "0048", name: "settle_cancel" } */
const FILE_RE = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
} catch (e) {
  console.error(`error: supabase/migrations 를 읽을 수 없습니다 — ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error("error: supabase/migrations 에 .sql 파일이 없습니다");
  process.exit(1);
}

// (a)(b) 번호별로 모은다
const byNum = new Map();
for (const f of files) {
  const m = FILE_RE.exec(f);
  if (!m) {
    errors.push(`${f} — 이름이 'NNNN_snake_case.sql' 형식이 아닙니다 (번호를 읽을 수 없으면 적용 순서를 보장할 수 없습니다)`);
    continue;
  }
  const num = m[1];
  if (!byNum.has(num)) byNum.set(num, []);
  byNum.get(num).push(f);
}

for (const [num, group] of [...byNum.entries()].sort()) {
  if (group.length > 1) {
    errors.push(
      `번호 ${num} 가 ${group.length}개 파일에 중복됩니다: ${group.join(" · ")}\n` +
        `        → 나중에 만든 쪽을 다음 빈 번호로 옮기고 코드·문서·스크립트의 참조도 함께 바꾸세요.\n` +
        `        (git 은 파일명이 다르면 충돌로 알려주지 않습니다 — 그대로 병합되면 db push 가 실패합니다)`,
    );
  }
}

// (c) 번호 건너뜀 — 중복이 없을 때만 의미가 있다
const nums = [...byNum.keys()].map(Number).sort((a, b) => a - b);
if (errors.length === 0 && nums.length > 1) {
  const missing = [];
  for (let n = nums[0]; n < nums[nums.length - 1]; n += 1) {
    if (!nums.includes(n)) missing.push(String(n).padStart(4, "0"));
  }
  if (missing.length > 0) {
    warnings.push(`번호가 비어 있습니다: ${missing.join(", ")} — 되돌린 마이그레이션이면 정상입니다`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`[check-migrations] 파일 ${files.length}개 · errors ${errors.length} · warnings ${warnings.length}`);
if (errors.length > 0) process.exit(1);
