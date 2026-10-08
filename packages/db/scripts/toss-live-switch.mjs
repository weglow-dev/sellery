// 토스 라이브 키 전환 — Vercel Production 4 프로젝트의 토스 키를 `.env.cloud.local` 의 라이브 짝으로 한 번에 바꾼다(또는 테스트 짝으로 되돌린다).
//   docs/launch-checklist.md §1 · D-day 런북 · docs/deploy.md §1.2(이름) · §5.3(결제위젯 키) · §5.3.1(지급대행 키) · §8.3(재배포 주의)
//
// 사용 (저장소 루트에서):
//   node packages/db/scripts/toss-live-switch.mjs                 계획만(기본 --dry-run) — 어느 프로젝트의 어느 이름에 어떤 접두의 값이 들어갈지 + 지금 Vercel 에 있는 값의 접두
//   node packages/db/scripts/toss-live-switch.mjs --apply         Production 에 업서트(값은 출력하지 않는다) → 적용 뒤 프로젝트별 접두 재조회 출력
//   node packages/db/scripts/toss-live-switch.mjs --rollback [--apply]   테스트 짝으로 되돌리기(계획/적용)
//   옵션 --env-file <path>(기본 루트 .env.cloud.local) · --team <id>(기본 Vercel CLI config.json currentTeam) · --status(계획 없이 Vercel 현재값 접두만)
//
// 어떤 값이 어디로 (lib/toss-live-switch-plan.mjs KEY_MAP):
//   PUBLIC_TOSS_CLIENT_KEY    ← TOSS_LIVE_WIDGET_CLIENT_KEY  (live_gck_)  → sellery-shop · sellery-influencer   ※ 빌드 시 인라인 — 적용 뒤 **재배포**(deploy.md §8.3)
//   TOSS_SECRET_KEY           ← TOSS_LIVE_WIDGET_SECRET_KEY  (live_gsk_)  → 4 프로젝트
//   TOSS_PAYOUT_SECRET_KEY    ← TOSS_LIVE_PAYOUT_SECRET_KEY  (live_sk_)   → 4 프로젝트  (지급대행 상점 peerkeamf5 · 공유 잔액 — payout_daily_cap 가드)
//   TOSS_PAYOUT_SECURITY_KEY  ← TOSS_LIVE_PAYOUT_SECURITY_KEY(64자 hex)   → 4 프로젝트
//   --rollback 은 PUBLIC_TOSS_CLIENT_KEY · TOSS_SECRET_KEY(test_gck_/test_gsk_) · TOSS_PEER_SECRET_KEY · TOSS_PEER_PAYOUT_SECURITY_KEY 를 같은 이름에 넣는다.
//
// 안전장치: 값은 어디에도 출력하지 않는다(접두 · 길이만) · 네 값이 모두 기대 형식이어야 한 건이라도 적는다(한 프로젝트만 라이브가 되는 상태 방지) · Production 만(Preview 는 테스트 짝 유지)
//   · Vercel 토큰은 `%APPDATA%/com.vercel.cli/Data/auth.json`(vercel login 이 만든 파일)에서 읽고 출력하지 않는다 · `VERCEL_TOKEN` env 가 있으면 그것을 쓴다.
// 이 스크립트는 DB 를 건드리지 않는다. 전환 뒤 할 일(§1): 재배포 → `curl https://sellery.life/api/health` → 라이브 상점 웹훅 등록 → 실결제 1건.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan, describeValue, parseDotenv, PROJECTS, summarizePlan, summarizeVercelEnvs } from "./lib/toss-live-switch-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith("--")) {
    flags[key] = next;
    i++;
  } else flags[key] = true;
}
if (flags.help || flags.h) {
  console.log("usage: node packages/db/scripts/toss-live-switch.mjs [--apply] [--rollback] [--status] [--env-file <path>] [--team <id>]");
  process.exit(0);
}
const mode = flags.rollback ? "rollback" : "live";
const apply = flags.apply === true;
const envFile = resolve(ROOT, typeof flags["env-file"] === "string" ? flags["env-file"] : ".env.cloud.local");

/* ---------------- Vercel 인증 (값 미출력) ---------------- */
function vercelAuth() {
  const dataDir = resolve(process.env.APPDATA || resolve(process.env.HOME || "", ".config"), "com.vercel.cli", "Data");
  let token = process.env.VERCEL_TOKEN || "";
  if (!token) {
    const p = resolve(dataDir, "auth.json");
    if (!existsSync(p)) throw new Error(`Vercel 토큰이 없어요 — \`vercel login\` 을 먼저 하거나 VERCEL_TOKEN 을 넣으세요 (${p})`);
    token = JSON.parse(readFileSync(p, "utf8")).token || "";
    if (!token) throw new Error("auth.json 에 token 이 없어요 — `vercel login`");
  }
  let team = typeof flags.team === "string" ? flags.team : process.env.VERCEL_TEAM_ID || "";
  if (!team) {
    const p = resolve(dataDir, "config.json");
    if (existsSync(p)) team = JSON.parse(readFileSync(p, "utf8")).currentTeam || "";
  }
  if (!team) throw new Error("Vercel 팀 id 가 없어요 — `vercel switch weglow-team` 또는 --team <id>");
  return { token, team };
}

async function vercel(auth, path, init = {}) {
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set("teamId", auth.team);
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json", ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(`Vercel ${init.method || "GET"} ${path} → ${res.status} ${body?.error?.message || body?.error?.code || ""}`);
  return body;
}

async function currentStatus(auth) {
  const out = {};
  for (const project of PROJECTS) {
    try {
      const body = await vercel(auth, `/v9/projects/${encodeURIComponent(project)}/env?decrypt=true`);
      out[project] = summarizeVercelEnvs(body?.envs ?? []);
    } catch (e) {
      out[project] = [{ key: "(조회 실패)", value: e instanceof Error ? e.message : String(e) }];
    }
  }
  return out;
}

function printStatus(status, title) {
  console.log(`\n== ${title} ==`);
  for (const [project, rows] of Object.entries(status)) {
    console.log(`${project}: ${rows.length ? rows.map((r) => `${r.key}=${r.value}`).join(" · ") : "(토스 키 없음)"}`);
  }
}

async function main() {
  const auth = vercelAuth();
  if (flags.status) {
    printStatus(await currentStatus(auth), "Vercel Production 현재값(접두 · 길이)");
    return;
  }
  if (!existsSync(envFile)) throw new Error(`env 파일이 없어요: ${envFile} (--env-file 로 지정)`);
  const env = parseDotenv(readFileSync(envFile, "utf8"));
  const plan = buildPlan(mode, env);
  console.log(`모드: ${mode === "live" ? "라이브 전환" : "테스트 짝으로 롤백"} · 대상: Production 만 · 파일: ${envFile}`);
  console.table(summarizePlan(plan));
  if (plan.errors.length) {
    console.error("\n계획을 만들 수 없어요 — 아래를 .env.cloud.local 에 채운 뒤 다시:");
    for (const e of plan.errors) console.error(`  · ${e}`);
    process.exit(1);
  }
  printStatus(await currentStatus(auth), "적용 전 Vercel Production");
  if (!apply) {
    console.log(`\n(dry-run) 적용하려면 --apply. ${plan.items.length}건 업서트 예정 — PUBLIC_TOSS_CLIENT_KEY 는 빌드 시 인라인이라 적용 뒤 shop · influencer 재배포(deploy.md §8.3).`);
    return;
  }
  let n = 0;
  for (const it of plan.items) {
    await vercel(auth, `/v10/projects/${encodeURIComponent(it.project)}/env?upsert=true`, {
      method: "POST",
      body: JSON.stringify({ key: it.key, value: it.value, type: it.type, target: it.target }),
    });
    n++;
    console.log(`업서트 ${it.project} ${it.key} ← ${describeValue(it.value)} (${it.target.join(",")})`);
  }
  console.log(`\n${n}건 적용.`);
  printStatus(await currentStatus(auth), "적용 후 Vercel Production");
  console.log("\n다음: ① shop · influencer 재배포(PUBLIC_TOSS_CLIENT_KEY 인라인 — deploy.md §8.3) · brand · admin 은 Redeploy ② curl https://sellery.life/api/health ③ 라이브 상점 웹훅(결제 · 지급대행) 등록 ④ 실결제 1건 · 지급 1,000원 리허설(launch-checklist §8)");
}

main().catch((e) => {
  console.error(`[toss-live-switch] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
