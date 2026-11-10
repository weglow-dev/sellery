// MYR 운영 스크립트(S8) — 운영 콘솔 myr-admin(M6) 이 생기기 전까지 발송 · 교환/환불 처리를 터미널에서. 콘솔이 생기면 이 파일과 샵의 /api/ops/* 는 지운다.
//
//   node packages/db/scripts/myr-ops.mjs <cmd> [args]   (저장소 루트에서 · .env.local 의 CRON_SECRET · 선택 MYR_SHOP_URL)
//
//   DB 를 직접 만지지 않는다 — 샵 서버의 운영 API(apps/myr-shop /api/ops/ship · 0069 RPC + 배송 시작 메일)를 부른다. 그래서 환경변수는 둘뿐:
//     MYR_SHOP_URL   기본 https://myr-shop.vercel.app (로컬 리허설은 http://localhost:5178)
//     CRON_SECRET    그 샵(Vercel 프로젝트 myr-shop)의 CRON_SECRET 과 같은 값 — 루트 .env.local 에 있다
//
//   orders [--shipped] [--limit N]           발송 대기 주문(결제 완료 · 운송장 없음) 표 — --shipped 면 발송된 주문
//   ship <주문번호> <택배사> <운송장>          운송장 기록 + 고객 배송 시작 메일 · 택배사는 CJ대한통운 · 우체국택배 · 한진택배 · 롯데택배 · 로젠택배(별칭 cj · 우체국 · 한진 · 롯데 · 로젠)
//                                           같은 운송장을 다시 넣으면 "이미 기록됨"(메일 없음) · 다른 운송장이면 정정 + 메일 다시
//   ship-csv <file.csv>                      여러 건 — 줄마다 `주문번호,택배사,운송장`(머리줄 있으면 건너뜀). 한 줄씩 ship 과 같다 · 실패한 줄은 표로 모아 보여준다
//   prepare [--dry] [--before ISO] [--csv 파일]   배송준비중 수동 전환(0077 · 이벗 연동 전) — 지금(또는 --before 시각) 전에 결제된 결제완료 줄 → 배송준비중.
//                                           물류센터에 주문을 넘기는 순간에 쓴다. 이때부터 그 줄은 고객 셀프 환불이 막힌다(발주 뒤).
//                                           --dry 는 바꾸지 않고 대상만 · --csv 는 물류센터에 넘길 CSV(수취인 · 주소 · 상품 · 수량)를 쓴다(개인정보 — 넘긴 뒤 지울 것)
//   deliver <주문번호> [--date YYYY-MM-DD]     배송 완료 기록(0088) — 택배사 조회로 배송 완료를 확인한 뒤. 그 주문의 배송중 줄 전부 · --date = 실제 배송일(한국 시간 · 없으면 지금)
//                                           정산(0087)은 배송 완료일이 있는 줄만 잡는다 — 이벗 송장 수집이 못 찍은 줄(운영 명령으로 발송 · 이벗 미등록 · 신호 누락)을 여기서 찍는다.
//                                           자동으로 찍지 않는다(분실 · 반송도 완료가 되므로). 이미 배송 완료면 "이미 기록됨"
//   undelivered [--days N]                   배송중으로 N일(기본 5) 넘게 남은 줄 — 택배 조회 링크 · 이벗 등록 여부. 월말(정산 전)에 보고 deliver 로 찍는다
//   claims [--all]                           교환 · 환불 요청(0078) — 진행 중(처리 대기 · 진행 중) 표 · 할 일 칸(회수 확인 · 재발송 송장 · 환불 재시도) · --all 이면 완료 · 반려까지
//   collected <요청번호>                       회수 확인 → 환불할 차례면 바로 환불(토스 부분 취소 · 고객 환불 메일). 파손 · 누액 환불처럼 회수가 없는 요청은 NOT_READY
//   reship-claim <요청번호> <택배사> <운송장>  교환 재발송 송장 → 고객 "교환 상품이 출발했어요" 메일(새 기록일 때). 회수 전이어도 된다(오배송은 먼저 보낼 수 있다)
//   claim-refund <요청번호>                   환불만 지금(승인 뒤 크론을 기다리지 않을 때 · 회수 직후 실패한 요청 — 샵 크론도 10분마다 한다)
//
// 값(시크릿)은 출력하지 않는다. 두 번 실행해도 같은 결과(RPC 멱등).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatClaimsTable, formatOrdersTable, formatPrepareTable, parseArgs, parseShipCsv, prepareCsv } from "./lib/myr-ops-plan.mjs";

function loadEnv() {
  if (process.env.CRON_SECRET) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local");
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 아래에서 누락 안내 */
  }
}
loadEnv();

const base = (process.env.MYR_SHOP_URL || "https://myr-shop.vercel.app").replace(/\/+$/, "");
const secret = (process.env.CRON_SECRET || "").trim();
if (!secret) {
  console.error("[myr-ops] CRON_SECRET 이 필요합니다 (.env.local · Vercel myr-shop 의 값과 같게)");
  process.exit(2);
}

const { cmd, args, flags } = parseArgs(process.argv.slice(2));

function fail(msg) {
  console.error(`[myr-ops] ${msg}`);
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function cmdOrders() {
  const limit = Number(flags.limit) || 100;
  const shipped = !!flags.shipped;
  const { status, json } = await call("GET", `/api/ops/ship?limit=${limit}&shipped=${shipped ? 1 : 0}`);
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) fail(`목록 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  console.log(`${base} · ${shipped ? "발송된 주문" : "발송 대기"} ${json.orders.length}건`);
  console.log(formatOrdersTable(json.orders, shipped));
}

async function shipOne(orderCode, courier, trackingNo) {
  const { status, json } = await call("POST", "/api/ops/ship", { orderCode, courier, trackingNo });
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) return { ok: false, message: `${json?.message ?? json?.code ?? "?"} (${status})` };
  return { ok: true, already: !!json.already, order: json.order };
}

async function cmdShip() {
  const [orderCode, courier, trackingNo] = args;
  if (!orderCode || !courier || !trackingNo) fail("usage: ship <주문번호> <택배사> <운송장>");
  const r = await shipOne(orderCode, courier, trackingNo);
  if (!r.ok) fail(r.message);
  const o = r.order;
  console.log(`${r.already ? "이미 기록됨" : "발송 처리"}  ${o.code.toUpperCase()}  ${o.courier} ${o.trackingNo}${r.already ? " (메일 없음)" : "  · 고객 배송 시작 메일"}`);
}

async function cmdShipCsv() {
  const file = args[0];
  if (!file) fail("usage: ship-csv <file.csv>");
  const { rows, problems } = parseShipCsv(readFileSync(resolve(file), "utf8"));
  if (problems.length) fail(`CSV 검증 실패\n  ${problems.join("\n  ")}`);
  if (!rows.length) fail("CSV 에 줄이 없습니다");
  const failed = [];
  let done = 0;
  let already = 0;
  for (const row of rows) {
    const r = await shipOne(row.orderCode, row.courier, row.trackingNo);
    if (!r.ok) failed.push(`${row.line}: ${row.orderCode} — ${r.message}`);
    else if (r.already) already++;
    else done++;
  }
  console.log(`발송 처리 ${done}건 · 이미 기록됨 ${already}건 · 실패 ${failed.length}건`);
  if (failed.length) {
    console.log(`  ${failed.join("\n  ")}`);
    process.exit(1);
  }
}

async function cmdPrepare() {
  const before = typeof flags.before === "string" ? flags.before : "";
  if (before && !Number.isFinite(new Date(before).getTime())) fail("--before 는 ISO 시각(예: 2026-11-07T11:00:00+09:00)");
  const dry = !!flags.dry;
  const { status, json } = dry
    ? await call("GET", `/api/ops/prepare${before ? `?before=${encodeURIComponent(before)}` : ""}`)
    : await call("POST", "/api/ops/prepare", before ? { before } : {});
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) fail(`배송준비중 전환 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  console.log(`${base} · ${dry ? "대상(바꾸지 않음)" : `배송준비중 ${json.count}줄 · 주문 ${json.orders.length}건`}`);
  console.log(formatPrepareTable(json.lines));
  if (typeof flags.csv === "string" && json.lines.length) {
    writeFileSync(resolve(flags.csv), prepareCsv(json.lines));
    console.log(`CSV → ${resolve(flags.csv)} (수취인 개인정보 — 물류센터에 넘긴 뒤 지울 것)`);
  }
}

async function cmdDeliver() {
  const orderCode = args[0];
  if (!orderCode) fail("usage: deliver <주문번호> [--date YYYY-MM-DD]");
  const date = typeof flags.date === "string" ? flags.date : undefined;
  const { status, json } = await call("POST", "/api/ops/deliver", { orderCode, ...(date ? { date } : {}) });
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) fail(`배송 완료 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  if (json.already) console.log(`이미 기록됨  ${json.orderCode.toUpperCase()}`);
  else console.log(`배송 완료  ${json.orderCode.toUpperCase()}  ${json.delivered}줄 · ${new Date(Date.parse(json.deliveredAt) + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ")}(KST) — 다음 정산 회차에 들어갑니다`);
}

async function cmdUndelivered() {
  const days = flags.days !== undefined ? Number(flags.days) : 5;
  if (!Number.isFinite(days) || days < 0) fail("--days 는 0 이상 숫자");
  const { status, json } = await call("GET", `/api/ops/deliver?days=${days}`);
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) fail(`목록 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  console.log(`${base} · 배송중 ${json.days}일 넘은 줄 ${json.lines.length}개 (배송 완료가 찍혀야 정산에 들어갑니다)`);
  for (const l of json.lines)
    console.log(
      `  ${l.orderCode.toUpperCase().padEnd(10)} ${String(l.days).padStart(3)}일  ${(l.courier ?? "-").padEnd(6)} ${(l.trackingNo ?? "-").padEnd(16)} ${l.ebut ? "이벗" : "수동"}  ${l.seller}  ${l.product}${l.option ? ` · ${l.option}` : ""} × ${l.qty}` +
        (l.trackUrl ? `
             ${l.trackUrl}` : ""),
    );
  if (json.lines.length) console.log(`확인 뒤: node packages/db/scripts/myr-ops.mjs deliver <주문번호> --date YYYY-MM-DD`);
}

async function cmdClaims() {
  const all = !!flags.all;
  const { status, json } = await call("GET", `/api/ops/claims${all ? "?all=1" : ""}`);
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) fail(`목록 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  console.log(`${base} · 교환 · 환불 요청 ${all ? "전부" : "진행 중"} ${json.claims.length}건`);
  console.log(formatClaimsTable(json.claims));
}

async function claimOp(body, label) {
  const { status, json } = await call("POST", "/api/ops/claims", body);
  if (status === 401) fail("CRON_SECRET 이 샵의 값과 다릅니다");
  if (!json?.ok) fail(`${label} 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  const c = json.claim;
  const refund = json.refund;
  const tail = refund?.tried ? (refund.ok ? ` · 환불 ₩${Number(refund.amount ?? 0).toLocaleString("ko-KR")}` : ` · 환불 실패(${refund.code}) — claim-refund 로 다시`) : "";
  console.log(`${json.already ? "이미 기록됨" : label}  ${String(c.code).toUpperCase()}  ${c.status}${c.step ? ` · 다음: ${c.step}` : ""}${tail}${json.mailed ? " · 고객 메일" : ""}`);
}

async function cmdCollected() {
  const [code] = args;
  if (!code) fail("usage: collected <요청번호>");
  await claimOp({ code, action: "collected" }, "회수 확인");
}

async function cmdReshipClaim() {
  const [code, courier, trackingNo] = args;
  if (!code || !courier || !trackingNo) fail("usage: reship-claim <요청번호> <택배사> <운송장>");
  await claimOp({ code, action: "reship", courier, trackingNo }, "재발송 기록");
}

async function cmdClaimRefund() {
  const [code] = args;
  if (!code) fail("usage: claim-refund <요청번호>");
  await claimOp({ code, action: "refund" }, "환불");
}

const commands = {
  orders: cmdOrders,
  ship: cmdShip,
  "ship-csv": cmdShipCsv,
  prepare: cmdPrepare,
  deliver: cmdDeliver,
  undelivered: cmdUndelivered,
  claims: cmdClaims,
  collected: cmdCollected,
  "reship-claim": cmdReshipClaim,
  "claim-refund": cmdClaimRefund,
};
if (!commands[cmd]) {
  console.log(
    "usage: node packages/db/scripts/myr-ops.mjs <orders [--shipped] [--limit N] | ship <주문번호> <택배사> <운송장> | ship-csv <file.csv> | prepare [--dry] [--before ISO] [--csv 파일] | deliver <주문번호> [--date YYYY-MM-DD] | undelivered [--days N] | claims [--all] | collected <요청번호> | reship-claim <요청번호> <택배사> <운송장> | claim-refund <요청번호>>"
  );
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((e) => fail(e instanceof Error ? e.message : String(e)));
