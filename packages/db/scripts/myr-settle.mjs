// MYR 정산 운영 스크립트(0087) — 운영 콘솔 myr-admin 의 "제조 원장 · 정산"(docs/myr-admin-screens.md §8) 이 생기기 전까지 터미널에서.
// 계산 · 확정은 DB 함수(myr_settlement_run · myr_settlement_confirm_held)가 한다 — 이 스크립트는 부르고 표로 보여 줄 뿐이다. 콘솔이 생기면 지운다.
//
//   node packages/db/scripts/myr-settle.mjs <cmd> [args]   (저장소 루트에서 · .env.local 의 PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY)
//
//   ⚠ 루트 .env.local 이 로컬 Supabase 를 가리키면 로컬 DB 다. 운영은 env 를 덮어쓴다:
//     PUBLIC_SUPABASE_URL=https://ocxppeuoiysnkwwujvko.supabase.co SUPABASE_SERVICE_ROLE_KEY=<운영 키> node … <cmd>
//
//   pending                                   제조 원장 대기 — 보류된 정산(상품 · 달 · 정산금) + 판매 중인데 원장이 없는 상품(다음 회차에 보류될 후보)
//   mfg <code>                                상품의 제조 원장(차수 · 제조금액 · 보증금 입금/환급 · 남은 제조금액)
//   mfg-add <code> <제조금액> ["메모"]           제조 차수 추가(재생산 포함) — 보증금 = 제조금액의 25% 버림 · 0 = "제조금액 없음" 명시(보류를 풀 때)
//   mfg-deposit <code> <차수> [--date YYYY-MM-DD]   보증금 입금 확인(환급은 입금 확인된 보증금만)
//   mfg-void <code> <차수> "<사유>"              잘못 넣은 차수 무효(지우지 않는다 · 상계에 쓰였거나 보증금을 환급했으면 거절)
//   confirm-held <code>                       보류된 정산 확정(그 상품의 보류 줄을 달 순서로) — 원장이 있어야 한다
//   run <YYYY-MM>                             회차 수동 실행(크론이 실패했을 때 — 크론과 같은 함수 · 이미 돌았으면 already)
//   report <YYYY-MM>                          회차 보고(크리에이터 · 상품별 판매 · 정산 뒤 환불 · 이월 · 정산금 · 상계 · 보증금 환급 · 지급)
//
// 크론: 샵 /api/cron/settle — 매월 1일 13:00(KST)에 지난달 회차를 계산하고 바로 확정(원장 없는 상품만 보류).
// 키는 출력하지 않는다. 두 번 실행해도 같은 결과(RPC 멱등 · 거절 코드).

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "./lib/myr-ops-plan.mjs";

function loadEnv() {
  if (process.env.PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local");
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 아래에서 누락 안내 */
  }
}
loadEnv();

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[myr-settle] PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local)");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { cmd, args, flags } = parseArgs(process.argv.slice(2));
const where = /127\.0\.0\.1|localhost/.test(url) ? "로컬 DB" : "클라우드 DB";

function fail(msg) {
  console.error(`[myr-settle] ${msg}`);
  process.exit(1);
}
const kstDate = (iso) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);
const won = (n) => (n == null ? "—" : `₩${Number(n).toLocaleString("ko-KR")}`);
const MESSAGES = {
  NOT_FOUND: "없는 상품 · 차수입니다",
  BAD_AMOUNT: "제조금액은 0 이상 정수",
  VOIDED: "무효 처리된 차수입니다",
  ALREADY_PAID: "이미 입금 확인된 차수입니다",
  ALREADY_VOIDED: "이미 무효 처리된 차수입니다",
  REASON_REQUIRED: "사유를 적어 주세요",
  REFUNDED: "보증금을 환급한 차수라 무효로 할 수 없습니다",
  USED: "이미 상계에 쓰인 금액이라 무효로 할 수 없습니다(남은 제조금액이 상계 합계보다 작아집니다)",
  NO_MFG: "제조 원장이 없습니다 — 먼저 mfg-add(0원이면 0)",
  NOTHING_HELD: "보류된 정산이 없습니다",
  NOT_CLOSED: "아직 끝나지 않은 달입니다",
  OUT_OF_ORDER: "더 늦은 회차가 이미 있습니다",
  BAD_MONTH: "달 형식은 YYYY-MM",
};
async function rpc(fn, params) {
  const { data, error } = await db.rpc(fn, params);
  if (error) fail(`${fn} 실패: ${error.message}`);
  return data;
}
function check(r) {
  if (!r || r.ok === false) fail(`${r?.code ?? "실패"} — ${MESSAGES[r?.code] ?? ""}`);
  return r;
}
async function productId(code) {
  if (!code) fail("상품 code 가 필요합니다");
  const { data, error } = await db.from("myr_products").select("id, code, name").eq("code", String(code).toLowerCase()).maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`상품을 찾을 수 없습니다: ${code}`);
  return data;
}
function month(v) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v ?? ""));
  if (!m || +m[2] < 1 || +m[2] > 12) fail("달 형식은 YYYY-MM");
  return `${m[1]}-${m[2]}-01`;
}

async function cmdPending() {
  const r = await rpc("myr_mfg_pending", {});
  console.log(`[${where}] 보류된 정산 ${r.held.length}개 상품`);
  for (const h of r.held) console.log(`  ${h.product.code.padEnd(32)} ${h.seller.handle.padEnd(18)} ${h.months.join(",").padEnd(16)} 정산금 ${won(h.settle)}  → mfg-add 뒤 confirm-held ${h.product.code}`);
  console.log(`판매 중인데 제조 원장이 없는 상품 ${r.no_ledger.length}개(다음 회차에 보류)`);
  for (const p of r.no_ledger) console.log(`  ${p.product.code.padEnd(32)} ${p.seller.handle.padEnd(18)} ${p.status}`);
}
async function printLedger(id) {
  const l = await rpc("myr_mfg_ledger", { p_product_id: id });
  console.log(`[${where}] ${l.product.code} · ${l.product.name}`);
  for (const b of l.batches)
    console.log(
      `  ${String(b.seq).padStart(2)}차 ${won(b.amount).padStart(12)}  보증금 ${won(b.deposit_amount).padStart(10)} ${b.deposit_paid_at ? `입금 ${kstDate(b.deposit_paid_at)}` : "미입금"}${b.deposit_refunded ? " · 환급됨" : ""}` +
        `${b.voided_at ? `  [무효: ${b.void_reason}]` : ""}${b.note ? `  ${b.note}` : ""}`,
    );
  console.log(`  합계 ${won(l.total)} · 상계 ${won(l.offset)} · 남은 제조금액 ${won(l.remaining)} · 보증금 입금 ${won(l.deposit_paid)} · 환급 ${won(l.deposit_refunded)}`);
}
async function cmdMfg() {
  const p = await productId(args[0]);
  await printLedger(p.id);
}
async function cmdMfgAdd() {
  const p = await productId(args[0]);
  const amount = Number(args[1]);
  if (!Number.isInteger(amount) || amount < 0) fail("제조금액은 0 이상 정수(원)");
  const r = check(await rpc("myr_mfg_add", { p_product_id: p.id, p_amount: amount, p_note: args[2] ?? null, p_actor: "script" }));
  console.log(`[${where}] ${p.code} ${r.batch.seq}차 ${won(r.batch.amount)} · 보증금 ${won(r.batch.deposit_amount)} · 남은 제조금액 ${won(r.remaining)}`);
}
async function cmdMfgDeposit() {
  const p = await productId(args[0]);
  const seq = Number(args[1]);
  const date = flags.date ? new Date(`${flags.date}T00:00:00+09:00`).toISOString() : null;
  if (flags.date && Number.isNaN(Date.parse(date))) fail("--date 형식은 YYYY-MM-DD");
  const r = check(await rpc("myr_mfg_deposit", { p_product_id: p.id, p_seq: seq, p_paid_at: date ?? new Date().toISOString() }));
  console.log(`[${where}] ${p.code} ${r.batch.seq}차 보증금 ${won(r.batch.deposit_amount)} 입금 확인`);
}
async function cmdMfgVoid() {
  const p = await productId(args[0]);
  const r = check(await rpc("myr_mfg_void", { p_product_id: p.id, p_seq: Number(args[1]), p_reason: args[2] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${p.code} ${args[1]}차 무효 · 남은 제조금액 ${won(r.remaining)}`);
}
async function cmdConfirmHeld() {
  const p = await productId(args[0]);
  const r = check(await rpc("myr_settlement_confirm_held", { p_product_id: p.id, p_actor: "script" }));
  console.log(`[${where}] ${p.code} 보류 ${r.confirmed}개 확정 · 지급 ${won(r.payout)}`);
}
async function cmdRun() {
  const m = month(args[0]);
  const r = check(await rpc("myr_settlement_run", { p_month: m, p_actor: "script" }));
  if (r.already) console.log(`[${where}] ${r.month} 회차는 이미 있습니다 — report ${r.month}`);
  else console.log(`[${where}] ${r.month} 회차 — 상품 ${r.rows}개 · 확정 ${r.confirmed} · 보류 ${r.held} · 지급 합계 ${won(r.payout)}`);
}
async function cmdReport() {
  const m = month(args[0]);
  const r = await rpc("myr_settlement_report", { p_month: m });
  if (!r) fail(`${args[0]} 회차가 없습니다`);
  console.log(`[${where}] ${r.month} 회차 · 계산 ${new Date(Date.parse(r.cutoff_at) + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')}(KST) · ${r.created_by}`);
  const head = ["크리에이터", "상품", "상태", "판매", "정산뒤환불", "이월", "정산금", "상계", "남은제조", "보증금환급", "지급"];
  console.log("  " + head.join(" | "));
  let sum = 0;
  for (const x of r.rows) {
    sum += x.payout ?? 0;
    console.log(
      "  " +
        [
          x.seller.handle,
          x.product.code,
          x.status === "held" ? "보류" : "확정",
          won(x.sales),
          won(x.refund_adj),
          won(x.carry_in),
          won(x.settle),
          won(x.offset),
          won(x.mfg_after),
          won(x.deposit_refund),
          won(x.payout),
        ].join(" | ") + (x.seller.settle_status !== "verified" ? "  (사업자 정보 미확인 — 지급 보류)" : ""),
    );
  }
  console.log(`  지급 합계(확정) ${won(sum)}`);
}

const COMMANDS = {
  pending: cmdPending,
  mfg: cmdMfg,
  "mfg-add": cmdMfgAdd,
  "mfg-deposit": cmdMfgDeposit,
  "mfg-void": cmdMfgVoid,
  "confirm-held": cmdConfirmHeld,
  run: cmdRun,
  report: cmdReport,
};
const fn = COMMANDS[cmd];
if (!fn) {
  console.error("사용법: node packages/db/scripts/myr-settle.mjs <pending|mfg|mfg-add|mfg-deposit|mfg-void|confirm-held|run|report> … (파일 머리말 참고)");
  process.exit(2);
}
await fn();
