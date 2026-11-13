// MYR 정산 운영 스크립트(0087) — 운영 콘솔 myr-admin 의 "제조 원장 · 정산 · 지급"(docs/myr-admin-screens.md §10 · §11 · 만들 것 docs/myr-admin-plan.md §8 · §9) 이 생기기 전까지 터미널에서.
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
//   mfg-fix <code> <차수> <올바른 금액> "<사유>"  제조금액 정정 — 올바른 금액으로 새 차수 + 잘못된 차수 무효를 한 번에(보증금 입금 확인일도 옮긴다).
//                                             이미 상계한 금액은 빼고 남은 만큼만 이후 회차에서 상계된다(확정된 회차는 그대로).
//                                             올바른 금액이 이미 상계한 금액보다 작으면 거절 + 덜 지급한 차액 안내(운영이 따로 지급)
//   mfg-void <code> <차수> "<사유>"              차수를 통째로 무효(중복 입력 등 · 지우지 않는다 · 금액을 고칠 때는 mfg-fix)
//   confirm-held <code>                       보류된 정산 확정(그 상품의 보류 줄을 달 순서로) — 원장이 있어야 한다
//   run <YYYY-MM>                             회차 수동 실행(크론이 실패했을 때 — 크론과 같은 함수 · 이미 돌았으면 already)
//   report <YYYY-MM>                          회차 보고(크리에이터 · 상품별 판매 · 정산 뒤 환불 · 이월 · 정산금 · 상계 · 보증금 환급 · 지급)
//                                             + 지급 건(상태 · 보류 이유 · 운영 메모 · 지급 가능 — 0102 서버 값 그대로)
//   hold <YYYY-MM> <@핸들> "<메모>"             지급 건 운영 보류(메모 필수 · 지급 완료 · 0원은 거절) — 사람이 건 보류는 자동으로 풀리지 않는다
//   release <YYYY-MM> <@핸들>                  운영 보류 해제 — 자동 상태로(사업자 정보 확인 전이면 다시 지급 보류)
//   to-pay <YYYY-MM>                          지급 목록 — 지급 가능한 지급 건 · 금액 · 이체할 계좌(원문 · 터미널에만)
//   paid <YYYY-MM> <@핸들> <금액> --date YYYY-MM-DD ["메모"]
//                                             지급 완료 기록(0103) — 직접 이체한 뒤. 금액은 to-pay 의 금액과 같아야 · 이체한 날은 오늘 이후 · 회차 계산일 전이면 거절
//                                             세금계산서 확인 전이면 지급 가능이 아니라 to-pay 에 나오지 않는다(0104)
//   unpaid <YYYY-MM> <@핸들> "<사유>"            지급 완료 취소(잘못 기록했을 때 · 사유 필수 · 이력은 남는다)
//   invoices [<YYYY-MM>] [--status submitted|returned|accepted|none]
//                                             세금계산서(0104) — 필요한 지급 건 · 상태 · 합계 · 공급가액 · 세액 · 작성일자 · 발행 기한 · 승인번호 · 상호 · 사업자등록번호(홈택스 대조용 원문)
//                                             달을 빼면 모든 달 · --status 기본 submitted(확인 대기) · --status all 이면 전부
//   invoice-ok <YYYY-MM> <@핸들>                홈택스에서 대조한 뒤 확인 → 지급 대기(사업자 정보 확인 전이면 그 이유로 보류). 낸 뒤 금액이 바뀌었으면 거절
//   invoice-return <YYYY-MM> <@핸들> "<사유>"    다시 제출 요청(사유는 크리에이터에게 보인다 · 확인 완료도 지급 전이면 되돌릴 수 있다)
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
  USED: "이미 상계에 쓰인 금액이라 무효 · 정정할 수 없습니다(남은 제조금액이 상계 합계보다 작아집니다)",
  SAME_AMOUNT: "지금 금액과 같습니다",
  NO_MFG: "제조 원장이 없습니다 — 먼저 mfg-add(0원이면 0)",
  NOTHING_HELD: "보류된 정산이 없습니다",
  NOT_CLOSED: "아직 끝나지 않은 달입니다",
  OUT_OF_ORDER: "더 늦은 회차가 이미 있습니다",
  BAD_MONTH: "달 형식은 YYYY-MM",
};
// 지급 건 보류 · 해제(0102) — ALREADY_PAID 처럼 차수 명령과 코드가 겹쳐 따로 둔다
const PAYOUT_MESSAGES = {
  NOT_FOUND: "그 달 · 핸들의 지급 건이 없습니다(report 로 확인 · 핸들은 @ 포함)",
  NOTE_REQUIRED: "보류 메모를 적어 주세요",
  ALREADY_PAID: "이미 지급 완료된 지급 건입니다",
  ALREADY_HELD: "이미 운영 보류 중입니다",
  NOTHING_TO_PAY: "0원 지급 건(지급 없음)이라 보류할 것이 없습니다",
  NOT_MANUAL: "운영 보류가 아닙니다(사업자 정보 · 세금계산서 보류는 확인되면 자동으로 풀립니다)",
  NOT_PAYABLE: "지급 가능한 지급 건이 아닙니다",
  AMOUNT_MISMATCH: "적은 금액이 지급 건 금액과 다릅니다",
  BAD_DATE: "--date YYYY-MM-DD 로 이체한 날을 적어 주세요",
  FUTURE_DATE: "이체한 날이 오늘(KST) 뒤입니다",
  BEFORE_RUN: "이체한 날이 회차 계산일 전입니다",
  REASON_REQUIRED: "취소 사유를 적어 주세요",
  NOT_PAID: "지급 완료가 아닙니다",
  // 세금계산서(0104)
  NOT_SUBMITTED: "크리에이터가 아직 승인번호를 내지 않았습니다(또는 이미 다시 제출 요청 중)",
  ALREADY_ACCEPTED: "이미 확인한 세금계산서입니다",
  AMOUNT_CHANGED: "크리에이터가 낸 뒤 세금계산서 합계가 바뀌었습니다 — invoice-return 으로 다시 발행을 요청하세요",
};
function checkPayout(r) {
  if (!r || r.ok === false) {
    // 서버가 같이 준 값(맞는 금액 · 보류 이유 · 이미 기록된 날 · 회차 계산일)을 그대로 덧붙인다
    const extra = r?.submitted_total != null ? ` (낸 합계 ${won(r.submitted_total)} · 지금 합계 ${won(r.total)})` : r?.amount != null ? ` (지급 건 금액 ${won(r.amount)})` : r?.hold_label ? ` (${r.status} · ${r.hold_label})` : r?.paid_on ? ` (이체한 날 ${r.paid_on})` : r?.run_on ? ` (회차 계산일 ${r.run_on})` : "";
    fail(`${r?.code ?? "실패"} — ${PAYOUT_MESSAGES[r?.code] ?? ""}${extra}`);
  }
  return r;
}
async function rpc(fn, params) {
  const { data, error } = await db.rpc(fn, params);
  if (error) fail(`${fn} 실패: ${error.message}`);
  return data;
}
function check(r) {
  if (r?.code === "USED" && r.shortfall > 0)
    fail(`USED — ${MESSAGES.USED}\n  이미 상계한 금액이 올바른 제조금액보다 ${won(r.shortfall)} 많습니다 — 크리에이터에게 ${won(r.shortfall)} 을 덜 지급한 상태라 운영이 따로 지급해야 합니다`);
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
async function cmdMfgFix() {
  const p = await productId(args[0]);
  const seq = Number(args[1]);
  const amount = Number(args[2]);
  if (!Number.isInteger(seq) || seq < 1) fail("차수는 1 이상 정수");
  if (!Number.isInteger(amount) || amount < 0) fail("올바른 제조금액은 0 이상 정수(원)");
  const r = check(await rpc("myr_mfg_fix", { p_product_id: p.id, p_seq: seq, p_amount: amount, p_reason: args[3] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${p.code} ${r.voided_seq}차 무효 → ${r.batch.seq}차 ${won(r.batch.amount)}(보증금 ${won(r.batch.deposit_amount)}${r.batch.deposit_paid_at ? " · 입금 확인 옮김" : ""}) · 남은 제조금액 ${won(r.remaining)}`);
  if (r.deposit_diff > 0) console.log(`  보증금을 ${won(r.deposit_diff)} 더 받은 상태입니다 — 크리에이터에게 따로 돌려주세요(정산 환급은 새 보증금 기준)`);
  if (r.deposit_diff < 0) console.log(`  보증금이 ${won(-r.deposit_diff)} 모자랍니다 — 추가로 받거나 입금 확인을 다시 하세요`);
  await printLedger(p.id);
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
  else console.log(`[${where}] ${r.month} 회차 — 상품 ${r.rows}개 · 확정 ${r.confirmed} · 보류 ${r.held} · 지급 건 ${r.payouts ?? 0}건 · 지급 합계 ${won(r.payout)}`);
}
async function cmdReport() {
  const m = month(args[0]);
  const r = await rpc("myr_settlement_report", { p_month: m });
  if (!r) fail(`${args[0]} 회차가 없습니다`);
  console.log(`[${where}] ${r.month} 회차 · 계산 ${new Date(Date.parse(r.cutoff_at) + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')}(KST) · ${r.created_by}`);
  const head = ["크리에이터", "상품", "상태", "판매", "정산뒤환불", "이월", "정산금", "상계", "남은제조", "보증금환급", "지급"];
  console.log("  " + head.join(" | "));
  for (const x of r.rows) {
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
        ].join(" | "),
    );
  }
  // 지급 건(0101 · 0102) — 금액 · 합계 · 상태 문구 · 보류 이유 · 지급 가능은 서버 값 그대로. 보류 해제 줄이 풀린 회차에 들어가 위 줄 합과 다를 수 있다
  console.log("  지급 건");
  for (const p of r.payouts ?? []) {
    // 보류 이유 전부(0104 holds — 사업자 정보와 세금계산서가 같이 걸리면 둘 다)
    const labels = (p.holds ?? []).map((h) => h.label).join(" · ");
    const why = labels ? ` (${labels}${p.hold_note ? ` · ${p.hold_note}` : ""})` : "";
    const paid = p.paid_on ? ` | 이체 ${p.paid_on} ${won(p.paid_amount)}${p.paid_note ? ` · ${p.paid_note}` : ""}` : "";
    const inv = p.invoice?.needed ? ` | 세금계산서 ${p.invoice.status_label} ${won(p.invoice.total)}${p.invoice.overdue ? " · 기한 지남" : ""}` : " | 세금계산서 필요 없음";
    console.log(`  ${p.seller.handle} | ${p.status_label ?? p.status}${why} | 줄 ${p.rows}개 | ${won(p.amount)} | ${p.payable ? "지급 가능" : "지급 불가"}${inv}${paid}`);
  }
  console.log(`  지급 합계 ${won(r.payout_total ?? 0)}`);
}
async function cmdHold() {
  const m = month(args[0]);
  const r = checkPayout(await rpc("myr_payout_hold", { p_month: m, p_handle: args[1] ?? "", p_note: args[2] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${args[0]} ${args[1]} 지급 건 운영 보류 — 풀 때 release ${args[0]} ${args[1]}`);
  return r;
}
async function cmdRelease() {
  const m = month(args[0]);
  const r = checkPayout(await rpc("myr_payout_release", { p_month: m, p_handle: args[1] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${args[0]} ${args[1]} 운영 보류 해제 — 지금 상태 ${r.status}${r.hold_reason ? `(${r.hold_reason})` : ""} · report ${args[0]} 로 확인`);
}
async function cmdToPay() {
  const m = month(args[0]);
  const list = (await rpc("myr_payout_to_pay", { p_month: m })) ?? [];
  console.log(`[${where}] ${args[0]} 지급 목록 — ${list.length}건 (계좌 원문이 보입니다 · 화면 공유 주의)`);
  for (const p of list) console.log(`  ${p.seller.handle} | ${p.seller.name} | ${won(p.amount)} | ${p.bank.bank ?? "-"} ${p.bank.account ?? "-"} (${p.bank.holder ?? "-"})`);
  if (list.length) console.log(`  이체한 뒤: paid ${args[0]} <@핸들> <금액> --date YYYY-MM-DD "메모"`);
}
async function cmdPaid() {
  const m = month(args[0]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(flags.date ?? ""))) fail(PAYOUT_MESSAGES.BAD_DATE);
  const amount = Number(args[2]);
  if (!Number.isInteger(amount)) fail("금액은 원 단위 정수(to-pay 의 금액)");
  const r = checkPayout(await rpc("myr_payout_mark_paid", { p_month: m, p_handle: args[1] ?? "", p_amount: amount, p_paid_on: flags.date, p_note: args[3] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${args[0]} ${args[1]} 지급 완료 — ${won(r.amount)} · 이체한 날 ${r.paid_on} · ${r.bank.bank ?? "-"} ${r.bank.account_masked ?? "-"}`);
}
async function cmdUnpaid() {
  const m = month(args[0]);
  const r = checkPayout(await rpc("myr_payout_unmark_paid", { p_month: m, p_handle: args[1] ?? "", p_reason: args[2] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${args[0]} ${args[1]} 지급 완료 취소 — 지금 상태 ${r.status}${r.hold_reason ? `(${r.hold_reason})` : ""}`);
}

// 세금계산서(0104) — 금액 · 날짜 · 상태 문구는 서버 값(myr_payout_invoice_json) 그대로
async function cmdInvoices() {
  const m = args[0] ? month(args[0]) : null;
  const status = flags.status === "all" ? null : String(flags.status ?? "submitted");
  const list = (await rpc("myr_tax_invoice_list", { p_month: m, p_status: status })) ?? [];
  console.log(`[${where}] 세금계산서 ${args[0] ?? "모든 달"} · ${status ?? "전부"} — ${list.length}건 (사업자등록번호 원문이 보입니다 · 화면 공유 주의)`);
  for (const x of list) {
    const i = x.invoice;
    console.log(
      `  ${x.month} | ${x.seller.handle} | ${x.seller.company ?? "-"} ${x.seller.biz_no ?? "-"} | ${i.status_label}${i.overdue ? " · 기한 지남" : ""}${i.amount_changed ? " · 낸 뒤 금액 바뀜" : ""}` +
        ` | 합계 ${won(i.total)} (공급가액 ${won(i.supply)} · 세액 ${won(i.tax)}) | 작성일자 ${i.write_date} · 기한 ${i.due_date}` +
        `${i.approval_no ? ` | 승인번호 ${i.approval_no.slice(0, 8)}-${i.approval_no.slice(8, 16)}-${i.approval_no.slice(16)}` : ""}${i.return_note ? ` | 요청 사유: ${i.return_note}` : ""} | 지급 건 ${x.payout_label}`,
    );
  }
  if (list.length && status === "submitted") console.log(`  홈택스에서 대조한 뒤: invoice-ok <YYYY-MM> <@핸들> · 다르면 invoice-return <YYYY-MM> <@핸들> "사유"`);
}
async function cmdInvoiceOk() {
  const m = month(args[0]);
  const r = checkPayout(await rpc("myr_tax_invoice_accept", { p_month: m, p_handle: args[1] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${args[0]} ${args[1]} 세금계산서 확인 — 지급 건 ${r.status}${r.hold_label ? `(${r.hold_label})` : ""} · ${r.payable ? "지급 가능 → to-pay" : "아직 지급 불가"}`);
}
async function cmdInvoiceReturn() {
  const m = month(args[0]);
  const r = checkPayout(await rpc("myr_tax_invoice_return", { p_month: m, p_handle: args[1] ?? "", p_note: args[2] ?? "", p_actor: "script" }));
  console.log(`[${where}] ${args[0]} ${args[1]} 세금계산서 다시 제출 요청 — 지급 건 ${r.status}${r.hold_reason ? `(${r.hold_reason})` : ""}`);
}

const COMMANDS = {
  pending: cmdPending,
  mfg: cmdMfg,
  "mfg-add": cmdMfgAdd,
  "mfg-deposit": cmdMfgDeposit,
  "mfg-fix": cmdMfgFix,
  "mfg-void": cmdMfgVoid,
  "confirm-held": cmdConfirmHeld,
  run: cmdRun,
  report: cmdReport,
  hold: cmdHold,
  release: cmdRelease,
  "to-pay": cmdToPay,
  paid: cmdPaid,
  unpaid: cmdUnpaid,
  invoices: cmdInvoices,
  "invoice-ok": cmdInvoiceOk,
  "invoice-return": cmdInvoiceReturn,
};
const fn = COMMANDS[cmd];
if (!fn) {
  console.error("사용법: node packages/db/scripts/myr-settle.mjs <pending|mfg|mfg-add|mfg-deposit|mfg-fix|mfg-void|confirm-held|run|report|hold|release|to-pay|paid|unpaid|invoices|invoice-ok|invoice-return> … (파일 머리말 참고)");
  process.exit(2);
}
await fn();
