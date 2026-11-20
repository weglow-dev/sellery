#!/usr/bin/env node
// MYR 파트너팀 톡(0125) — 운영 콘솔이 생기기 전까지 운영이 크리에이터 대화를 보고 답한다.
//   node packages/db/scripts/myr-talk.mjs <cmd> [args]   (저장소 루트에서 · .env.local 의 PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY)
//   ⚠ 루트 .env.local 이 로컬 Supabase(127.0.0.1:54321)를 가리키면 로컬 DB. 운영은 env 를 덮어쓴다:
//     PUBLIC_SUPABASE_URL=https://ocxppeuoiysnkwwujvko.supabase.co SUPABASE_SERVICE_ROLE_KEY=<운영 키> node … list
//
//   list [--waiting]                 대화방 목록(답할 차례 먼저 · --waiting = 답할 차례만)
//   show <@handle>                   대화 보기(운영 읽음 표시)
//   reply <@handle> "<내용>"          답하기(1~2000자 · 서버 myr_partner_body_max) — 크리에이터 콘솔 상단 톡 아이콘에 뱃지가 붙는다
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "./lib/myr-ops-plan.mjs";
import { normHandle } from "./lib/myr-products-plan.mjs";

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
  console.error("[myr-talk] PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local)");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { cmd, args, flags } = parseArgs(process.argv.slice(2));
const where = /127\.0\.0\.1|localhost/.test(url) ? "로컬 DB" : "클라우드 DB";

function fail(msg) {
  console.error(`[myr-talk] ${msg}`);
  process.exit(1);
}

const kst = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

async function sellerByHandle(raw) {
  const handle = normHandle(raw ?? "");
  if (handle === "@") fail(`핸들 형식이 아닙니다: ${raw}`);
  const { data, error } = await db.from("sellers").select("id, name, handle").eq("handle", handle).maybeSingle();
  if (error) fail(`sellers 조회 실패: ${error.message}`);
  if (!data) fail(`크리에이터가 없습니다: ${handle}`);
  return data;
}

async function cmdList() {
  const { data, error } = await db.rpc("myr_app_admin_partner_threads", { p_waiting_only: flags.waiting === true });
  if (error) fail(error.message);
  const rows = Array.isArray(data) ? data : [];
  console.log(`[${where}] 파트너팀 톡 ${rows.length}개${flags.waiting === true ? "(답할 차례만)" : ""}`);
  for (const r of rows) {
    const mark = r.waiting ? "● 답할 차례" : "  답함     ";
    console.log(`${mark}  ${r.handle} ${r.name ?? ""} · 안 읽음 ${r.unread} · ${kst(r.last_message_at)} · ${r.last_sender === "admin" ? "운영" : "크리에이터"}: ${r.last_preview ?? ""}`);
  }
  if (rows.length) console.log(`\n보기: node packages/db/scripts/myr-talk.mjs show <@handle> · 답하기: … reply <@handle> "내용"`);
}

async function cmdShow() {
  const seller = await sellerByHandle(args[0]);
  const { data, error } = await db.rpc("myr_app_admin_partner_talk", { p_seller: seller.id, p_mark_read: true });
  if (error) fail(error.message);
  if (!data?.ok) fail(`거부: ${data?.code}`);
  const msgs = Array.isArray(data.messages) ? data.messages : [];
  console.log(`[${where}] ${seller.handle} ${seller.name ?? ""} — 메시지 ${msgs.length}개`);
  for (const m of msgs) {
    const who = m.sender === "admin" ? "운영      " : "크리에이터";
    console.log(`${kst(m.created_at)}  ${who}  ${String(m.body).replace(/\n/g, "\n                         ")}`);
  }
}

async function cmdReply() {
  const seller = await sellerByHandle(args[0]);
  const body = args[1] ?? fail('usage: reply <@handle> "<내용>"');
  const { data, error } = await db.rpc("myr_app_admin_partner_reply", { p_seller: seller.id, p_body: body, p_admin: null });
  if (error) fail(error.message);
  if (!data?.ok) fail(data?.code === "BAD_BODY" ? `내용은 1~${data.max}자로 써 주세요` : `거부: ${data?.code}`);
  console.log(`[${where}] ${seller.handle} 에 답했어요 — 크리에이터 콘솔 톡 아이콘에 뱃지가 붙어요`);
}

const commands = { list: cmdList, show: cmdShow, reply: cmdReply };
const run = commands[cmd];
if (!run) {
  console.error('usage: node packages/db/scripts/myr-talk.mjs list [--waiting] | show <@handle> | reply <@handle> "<내용>"');
  process.exit(2);
}
await run();
