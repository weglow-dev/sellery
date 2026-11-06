// MYR 운영 스크립트(S8) — 운영 콘솔 myr-admin(M6) 이 생기기 전까지 발송 처리를 터미널에서. 콘솔이 생기면 이 파일과 샵의 /api/ops/ship 은 지운다.
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
//
// 값(시크릿)은 출력하지 않는다. 두 번 실행해도 같은 결과(RPC 멱등).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOrdersTable, formatPrepareTable, parseArgs, parseShipCsv, prepareCsv } from "./lib/myr-ops-plan.mjs";

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

const commands = { orders: cmdOrders, ship: cmdShip, "ship-csv": cmdShipCsv, prepare: cmdPrepare };
if (!commands[cmd]) {
  console.log("usage: node packages/db/scripts/myr-ops.mjs <orders [--shipped] [--limit N] | ship <주문번호> <택배사> <운송장> | ship-csv <file.csv> | prepare [--dry] [--before ISO] [--csv 파일]>");
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((e) => fail(e instanceof Error ? e.message : String(e)));
