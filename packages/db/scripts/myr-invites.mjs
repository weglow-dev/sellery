// MYR 크리에이터 초대 스크립트 — 운영 콘솔 myr-admin "크리에이터 초대" 화면이 생기기 전까지 터미널에서(docs/myr.md 결정 14 · §4.2.1 10번 · 0070).
//
//   node packages/db/scripts/myr-invites.mjs <cmd> [args]   (저장소 루트에서 · .env.local 의 CRON_SECRET · 선택 MYR_INFLUENCER_URL)
//
//   DB 를 직접 만지지 않는다 — 크리에이터 콘솔 서버의 운영 API(apps/myr-influencer /api/ops/invites · 0070 RPC + 초대 메일)를 부른다. 환경변수는 둘:
//     MYR_INFLUENCER_URL  기본 https://myr-influencer.vercel.app (로컬은 http://localhost:5179) — 초대 링크도 이 주소로 만들어진다
//     CRON_SECRET         그 콘솔(Vercel 프로젝트 myr-influencer)의 CRON_SECRET 과 같은 값 — 루트 .env.local 에 있다(샵 myr-shop 과 같은 값)
//
//   send <email> [--by 이름]       초대 발급 + 초대 메일 · 링크를 출력한다(카톡 · DM 으로 따로 보낼 수 있게). 같은 이메일을 다시 보내면 이전 링크는 취소
//   list [--state pending|used|expired|revoked|requested] [--limit N]
//                                  초대 목록(최근순) — requested = 만료 화면에서 "새 초대 요청하기" 를 누르고 아직 다시 초대받지 않은 사람
//   revoke <email>                 대기 중인 초대 취소(링크가 "만료" 화면으로)
//
// 이미 크리에이터인 이메일(시드 크리에이터 등)은 초대가 아니라 myr-creators.mjs account 로 계정을 잇는다.
// 시크릿은 출력하지 않는다. 링크는 받는 사람만 쓰게 — 다른 곳에 붙여넣지 않는다.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/myr-ops-plan.mjs";
import { DEFAULT_CONSOLE_URL, consoleBase, formatInvitesTable } from "./lib/myr-invites-plan.mjs";

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

function fail(msg) {
  console.error(`[myr-invites] ${msg}`);
  process.exit(1);
}

const base = consoleBase(process.env.MYR_INFLUENCER_URL || DEFAULT_CONSOLE_URL) ?? fail(`MYR_INFLUENCER_URL 형식이 아닙니다: ${process.env.MYR_INFLUENCER_URL}`);
const secret = (process.env.CRON_SECRET || "").trim();
if (!secret) {
  console.error("[myr-invites] CRON_SECRET 이 필요합니다 (.env.local · Vercel myr-influencer 의 값과 같게)");
  process.exit(2);
}
const { cmd, args, flags } = parseArgs(process.argv.slice(2));

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) fail("CRON_SECRET 이 콘솔의 값과 다릅니다");
  if (res.status === 503 && json?.code === "NOT_CONFIGURED") fail("콘솔(Vercel myr-influencer)에 CRON_SECRET 이 없습니다 — docs/deploy.md 크리에이터 콘솔 절");
  return { status: res.status, json };
}

async function cmdSend() {
  const email = args[0] ?? fail("usage: send <email> [--by 이름]");
  const by = typeof flags.by === "string" ? flags.by : null;
  const { status, json } = await call("POST", "/api/ops/invites", { email, by });
  if (!json?.ok) fail(`${json?.message ?? json?.code ?? "?"} (${status})`);
  const i = json.invite;
  const until = new Date(i.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  console.log(`${base} · ${i.email} 초대${i.reissued ? " (다시 초대 — 이전 링크는 취소됨)" : ""}`);
  console.log(`  메일: ${i.mailed ? "보냄" : `안 보냄(${i.mailReason}) — 아래 링크를 직접 전달하세요`}`);
  console.log(`  유효: ${until}까지`);
  console.log(`  링크: ${i.link}`);
}

async function cmdList() {
  const q = new URLSearchParams();
  if (typeof flags.state === "string") q.set("state", flags.state);
  q.set("limit", String(Number(flags.limit) || 100));
  const { status, json } = await call("GET", `/api/ops/invites?${q}`);
  if (!json?.ok) fail(`목록 실패 (${status}): ${json?.message ?? json?.code ?? "?"}`);
  console.log(`${base} · 초대 ${json.invites.length}건${flags.state ? ` (${flags.state})` : ""}`);
  console.log(formatInvitesTable(json.invites));
}

async function cmdRevoke() {
  const email = args[0] ?? fail("usage: revoke <email>");
  const { status, json } = await call("DELETE", "/api/ops/invites", { email });
  if (!json?.ok) fail(`${json?.message ?? json?.code ?? "?"} (${status})`);
  console.log(json.revoked ? `${email} 대기 중인 초대 ${json.revoked}건 취소` : `${email} 에 대기 중인 초대가 없습니다`);
}

const commands = { send: cmdSend, list: cmdList, revoke: cmdRevoke };
if (!commands[cmd]) {
  console.log("usage: node packages/db/scripts/myr-invites.mjs <send <email> [--by 이름] | list [--state …] [--limit N] | revoke <email>>");
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((e) => fail(e instanceof Error ? e.message : String(e)));
