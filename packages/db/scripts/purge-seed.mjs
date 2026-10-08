// 시드·데모·개발 데이터 일괄 삭제 — 실판매(2026-10-14) 전 클라우드 DB 를 비운다 (docs/launch-checklist.md §2 · D-1 런북 · 0043 admin_purge_demo_data).
//
// 사용 (저장소 루트 · 루트 .env.local 을 읽는다 — 클라우드는 `node --env-file=.env.cloud.local …` 로 덮어쓴다):
//   node packages/db/scripts/purge-seed.mjs                              dry-run(기본) — 표별 삭제/잔존 건수 · 지워질 계정(마스킹) · 스토리지 객체 목록 · 시퀀스 계획. 아무것도 안 바꾼다
//   node packages/db/scripts/purge-seed.mjs --confirm PURGE              실행 — DB 는 한 트랜잭션(RPC) → auth.users 삭제(auth.admin.deleteUser) → 스토리지 객체 삭제(best-effort) → 표별 잔존 count 후검사
//   옵션
//     --keep-email a@b,c@d   그 이메일의 계정·파트너·고객과 밑에 달린 행(상품 · 양쪽이 남는 캠페인 · 주문 · 정산 · 🥬 원장 …)을 남긴다 (소문자 일치)
//     --keep-owner           대표 실계정(lib/purge-plan.mjs OWNER_EMAILS — s104 강신욱 · b101 · 카카오 고객) 을 --keep-email 에 더한다. **기본은 관리자 외 전부 삭제**(결정 대기 — launch-checklist §9-2)
//     --keep s104,b101,c107  코드로 남긴다(캠페인 코드는 인플루언서·브랜드·상품을 함께)
//     --reset-seq            삭제 뒤 **빈 표**의 코드 시퀀스만 처음값으로(campaign 100 · order 2000 · cs 100 · seller 100 · seller_channel 100 · brand 100 · product 100). 남는 행이 있으면 건너뜀
//     --skip-storage         스토리지 정리 생략 · --json 결과를 JSON 으로
//
// 항상 남는 것: platform_settings(payout_mode · payout_daily_cap 포함 — 값을 건드리지 않는다) · grade_tiers · brand_grade_tiers · categories · 관리자(profiles.role='admin' — 단 *@sellery.demo · *@sellery.test 는 지운다).
// 지우는 것: 그 밖의 전부 — 시드 b1·b2 / s1~s8 / p1~p10 / c1~c15 / 주문 / 원장 / cs / 결제·정산·지급 / 고객 / profiles / 그 auth 계정(dev-*@sellery.test 포함) / 지워진 파트너의 partner-docs · public-assets 객체.
// 검증 절차(로컬): `npx supabase db reset` → dry-run → `--confirm PURGE` → 후검사 표에서 남은 행 = 마스터 4표 + 관리자만 → 앱 화면(빈 홈 · 콘솔 로그인) → 다시 `db reset`.
// 두 번 실행해도 안전(남은 것만 다시 센다). production 거부 없음 — 이 스크립트의 목적이 클라우드 정리다. 대신 로컬이 아니면 10초 카운트다운.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { hostLabel, isLocalHost, MASTER_TABLES, parseArgs, PURGE_TABLES, storagePrefixesFor } from "./lib/purge-plan.mjs";

function loadEnv() {
  if (process.env.PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local");
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 값 미출력 */
  }
}
loadEnv();

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("usage: node packages/db/scripts/purge-seed.mjs [--confirm PURGE] [--keep-email a@b,c@d] [--keep-owner] [--keep s104,b101] [--reset-seq] [--skip-storage] [--json]");
  process.exit(0);
}
const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[purge-seed] PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — 루트 .env.local(또는 node --env-file=.env.cloud.local)을 확인하세요.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const local = isLocalHost(url);
const log = (...a) => {
  if (!args.json) console.log(...a);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpcPurge(confirm) {
  const { data, error } = await admin.rpc("admin_purge_demo_data", { p_confirm: confirm, p_keep_emails: args.keepEmails, p_keep_codes: args.keepCodes, p_reset_seq: args.resetSeq });
  if (error) throw new Error(`admin_purge_demo_data failed: ${error.message} (0043 이 적용됐는지 확인)`);
  if (!data?.ok) throw new Error(`admin_purge_demo_data 응답 이상: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

/** 지워질 파트너의 스토리지 객체 — [{ bucket, path }] (재귀 1단계: 코드가 올리는 경로는 모두 <prefix>/<file>) */
async function listStorage(purged) {
  const out = [];
  for (const { bucket, prefix } of storagePrefixesFor(purged)) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      out.push({ bucket, path: `${prefix}/ (조회 실패: ${error.message})`, error: true });
      continue;
    }
    for (const o of data ?? []) if (o.id || o.metadata) out.push({ bucket, path: `${prefix}/${o.name}` });
  }
  return out;
}

async function removeStorage(objects) {
  const byBucket = new Map();
  for (const o of objects) {
    if (o.error) continue;
    if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, []);
    byBucket.get(o.bucket).push(o.path);
  }
  const result = { removed: 0, failed: [] };
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) result.failed.push(`${bucket}: ${error.message} (${chunk.length}건)`);
      else result.removed += chunk.length;
    }
  }
  return result;
}

/** 모든 표의 현재 건수 — 후검사(남은 행 = 마스터 + 남긴 것만인지 사람이 본다) */
async function tableCounts() {
  const rows = [];
  for (const t of [...MASTER_TABLES, ...PURGE_TABLES]) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
    rows.push({ table: t, rows: error ? `? ${error.message}` : count ?? 0, kind: MASTER_TABLES.includes(t) ? "마스터(유지)" : "" });
  }
  const { data: users, error: uErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  rows.push({ table: "auth.users", rows: uErr ? `? ${uErr.message}` : (users?.users ?? []).length, kind: "" });
  return rows;
}

function printPlan(data, storage) {
  log(`대상 DB: ${hostLabel(url)} ${local ? "(로컬)" : "(**클라우드**)"} · 모드: ${data.dry_run ? "dry-run" : "실행"}`);
  log(`남김: 이메일 ${data.keep_emails.length ? data.keep_emails.join(", ") : "(없음 — 관리자 외 전부 삭제)"} · 코드 ${data.keep_codes.length ? data.keep_codes.join(", ") : "(없음)"}`);
  log(`남는 집합: 계정 ${data.kept.users} · 인플루언서 ${data.kept.sellers} · 브랜드 ${data.kept.brands} · 고객 ${data.kept.customers} · 상품 ${data.kept.products} · 캠페인 ${data.kept.campaigns}`);
  console.table(data.counts.map((c) => ({ 표: c.table, 삭제: c.delete, 잔존: c.keep })));
  const total = data.counts.reduce((a, c) => a + Number(c.delete), 0);
  log(`표 ${data.counts.length}개 · 삭제 ${total}행 · auth 계정 ${data.auth_user_ids.length}개${data.auth_users.length ? ` — ${data.auth_users.map((u) => u.email_masked ?? u.id.slice(0, 8)).join(", ")}` : ""}`);
  log(`스토리지 객체 ${storage.length}개${storage.length ? ":" : ""}`);
  for (const o of storage) log(`  ${o.bucket}/${o.path}`);
  log(`시퀀스: ${data.sequences.map((s) => `${s.name}${s.reset ? ` → ${s.restart}` : ` (유지${s.skipped_reason === "rows_remain" ? " · 행 남음" : ""})`}`).join(" · ")}`);
}

async function main() {
  // 1) dry-run 은 항상 먼저(실행 모드에서도 같은 계획을 보여주고 카운트다운)
  const plan = await rpcPurge(null);
  const storage = args.skipStorage ? [] : await listStorage(plan.purged);
  printPlan(plan, storage);
  if (!args.confirm) {
    if (args.confirmRaw) log(`\n--confirm 값이 'PURGE' 가 아니에요(${args.confirmRaw}) — 실행하지 않았어요.`);
    else log("\n(dry-run) 실행하려면 --confirm PURGE. 마스터 4표(platform_settings · grade_tiers · brand_grade_tiers · categories)와 관리자는 남습니다.");
    if (args.json) console.log(JSON.stringify({ plan, storage }, null, 2));
    return;
  }
  if (!local) {
    log(`\n!! 클라우드 DB(${hostLabel(url)})를 지웁니다 — 10초 안에 Ctrl+C 로 취소할 수 있어요. 백업(Supabase → Database → Backups)을 먼저 확인하세요.`);
    for (let s = 10; s > 0; s--) {
      log(`  ${s}…`);
      await sleep(1000);
    }
  }
  // 2) DB — 한 트랜잭션
  const done = await rpcPurge("PURGE");
  log("\nDB 삭제 완료 (한 트랜잭션).");
  console.table(done.counts.map((c) => ({ 표: c.table, 삭제: c.delete, 잔존: c.keep })));
  log(`시퀀스: ${done.sequences.filter((s) => s.reset).map((s) => `${s.name} → ${s.restart}`).join(" · ") || "(변경 없음)"}`);
  // 3) auth.users — GoTrue 가 identities · sessions 정리
  let authDeleted = 0;
  const authFailed = [];
  for (const id of done.auth_user_ids ?? []) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) authFailed.push(`${id.slice(0, 8)}… ${error.message}`);
    else authDeleted++;
  }
  log(`auth 계정 삭제 ${authDeleted}개${authFailed.length ? ` · 실패 ${authFailed.length}: ${authFailed.join(" / ")}` : ""}`);
  // 4) 스토리지(best-effort)
  if (!args.skipStorage && storage.length) {
    const r = await removeStorage(storage);
    log(`스토리지 객체 삭제 ${r.removed}개${r.failed.length ? ` · 실패: ${r.failed.join(" / ")}` : ""}`);
  }
  // 5) 후검사
  const after = await tableCounts();
  log("\n후검사 — 남은 행(마스터 4표 + 남긴 것만이어야 한다):");
  console.table(after);
  if (args.json) console.log(JSON.stringify({ plan, done, authDeleted, authFailed, after }, null, 2));
  log("\n다음: 고객 홈 https://sellery.life/(빈 상태) · /influencers · /admin/settle 대기 0 · partner-admin.mjs list / brands 로 확인. 다시 되돌릴 수 없어요 — 실계정은 재가입.");
}

main().catch((e) => {
  console.error(`[purge-seed] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
