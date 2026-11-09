// MYR 크리에이터 계정 운영 스크립트 — 크리에이터 콘솔(apps/myr-influencer) 로그인 계정을 sellers 행에 만든다/잇는다(docs/myr.md §4.2.1 2번).
// **이미 있는 크리에이터 행(시드 등)에 계정을 잇는 용도** — 새 크리에이터는 초대 가입(myr-invites.mjs send · 0070). 운영 콘솔 인플루언서 화면(우선 4) 전까지 여기서. service role · production 허용(셀러리 partner-admin.mjs 의 MYR 판 — 셀러리 스크립트는 셀러리 콘솔 주소로 메일을 보내서 못 쓴다).
//
//   node packages/db/scripts/myr-creators.mjs <cmd> [args]   (저장소 루트에서 · .env.local 의 PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY)
//
//   ⚠ 루트 .env.local 이 **로컬 Supabase(127.0.0.1:54321)** 를 가리키면 로컬 DB 에 만든다. 클라우드(운영)는 env 를 덮어쓴다:
//     PUBLIC_SUPABASE_URL=https://ocxppeuoiysnkwwujvko.supabase.co SUPABASE_SERVICE_ROLE_KEY=<운영 키> node … account …
//
//   list                                         MYR 상품이 있는 크리에이터 + 로그인 계정 연결 여부
//   account <@handle> <email> [--password <pw>]  비밀번호 계정을 만들어(이미 있으면 그 계정) 크리에이터에 연결. 메일 인증 완료로 만든다(메일 발송 없음).
//                                                --password 가 없으면 임시 비밀번호를 만들어 **한 번만 출력**한다 — 크리에이터에게 따로 전달 · 콘솔 "비밀번호 찾기"로 바꿀 수 있다.
//                                                이미 있는 계정에 --password 를 주면 그 비밀번호로 바꾼다.
//   invite <@handle> <email> --console <url>     초대 메일(크리에이터가 링크를 눌러 비밀번호를 정한다) + 연결. url = 콘솔 주소(예 https://myr-influencer.vercel.app)
//                                                — Supabase Redirect URLs 에 그 주소가 있어야 링크가 콘솔로 온다(docs/deploy.md MYR 표).
//   unlink <@handle>                             로그인 계정 연결만 끊는다(계정 · 상품은 그대로)
//   suspend <@handle> · reactivate <@handle>     콘솔 이용 정지/해제(sellers.active) — 정지되면 콘솔 모든 화면이 /suspended. 샵의 상품 노출도 같이 멈춘다(0056 공개 RPC 가 active 를 본다)
//   settle-info [--all]                          사업자 · 정산 정보 확인 대기(0085 · --all = 미입력 빼고 전부) — 원문 출력(확인용 · 화면 공유 주의)
//                                                확인: 홈택스 사업자 상태(휴 · 폐업 아님) · 상호 · 대표자 일치 / 은행 "예금주 조회"로 예금주 = 상호 또는 대표자
//   settle-verify <@handle> --at <제출 시각>       확인 완료(확인 중만) — 정산금 지급 가능
//   settle-reject <@handle> "<사유>" --at <제출 시각>   다시 입력 요청(사유 필수 · 크리에이터 콘솔 홈 배너 · 내 정보에 사유)
//                                                --at = settle-info 가 보여 준 제출 시각(그 줄 아래에 명령이 그대로 찍힌다) — 그사이 크리에이터가 다시 저장했으면 거절(STALE · 보지 않은 값을 확인하지 않게)
//
// 연결 규칙: sellers.user_id = 계정(콘솔 게이트의 진실 — @sellery/myr-core server/seller) · 계정 하나는 크리에이터 하나에만 · profiles.role 이 customer 면 seller 로(관리자는 그대로).
// 키·비밀번호(--password 로 준 값)는 출력하지 않는다. 두 번 실행해도 같은 결과.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "./lib/myr-ops-plan.mjs";
import { normHandle } from "./lib/myr-products-plan.mjs";
import { formatCreatorsTable, generatePassword, inviteRedirect, normEmail, passwordProblem } from "./lib/myr-creators-plan.mjs";

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
  console.error("[myr-creators] PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local)");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { cmd, args, flags } = parseArgs(process.argv.slice(2));
const where = /127\.0\.0\.1|localhost/.test(url) ? "로컬 DB" : "클라우드 DB";

function fail(msg) {
  console.error(`[myr-creators] ${msg}`);
  process.exit(1);
}

async function sellerByHandle(raw) {
  const handle = normHandle(raw);
  if (handle === "@") fail(`핸들 형식이 아닙니다: ${raw}`);
  const { data, error } = await db.from("sellers").select("id, name, handle, user_id, email, active").eq("handle", handle).maybeSingle();
  if (error) fail(`sellers 조회 실패: ${error.message}`);
  if (!data) fail(`크리에이터가 없습니다: ${handle} — 먼저 myr-products.mjs import 로 만든다`);
  return data;
}

/** 이메일로 계정 찾기 — Admin API 에 이메일 조회가 없어 페이지를 넘기며 찾는다(MYR 규모에서 충분) */
async function userByEmail(email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`계정 조회 실패: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** 크리에이터 ↔ 계정 연결 — 계정이 다른 크리에이터에 이미 붙어 있으면 거부 · 크리에이터에 다른 계정이 있으면 거부(unlink 먼저) */
async function link(seller, user, email) {
  if (seller.user_id && seller.user_id !== user.id) fail(`${seller.handle} 에는 이미 다른 계정이 연결돼 있습니다 — unlink 먼저`);
  const { data: other, error: oErr } = await db.from("sellers").select("handle").eq("user_id", user.id).neq("id", seller.id).maybeSingle();
  if (oErr) fail(`연결 확인 실패: ${oErr.message}`);
  if (other) fail(`${email} 계정은 이미 ${other.handle} 에 연결돼 있습니다`);
  const patch = { user_id: user.id };
  if (!seller.email) patch.email = email; // 크리에이터 메일(주문·문의 알림 수신)이 비어 있으면 로그인 이메일로
  const { error } = await db.from("sellers").update(patch).eq("id", seller.id);
  if (error) fail(`연결 실패: ${error.message}`);
  // 역할 표시 — 고객으로 만들어진 profiles 행만 seller 로(관리자 계정은 건드리지 않는다)
  const { error: pErr } = await db.from("profiles").update({ role: "seller" }).eq("id", user.id).eq("role", "customer");
  if (pErr) console.warn(`[myr-creators] profiles.role 갱신 실패(무시): ${pErr.message}`);
}

async function cmdAccount() {
  const [h, e] = args;
  if (!h || !e) fail("usage: account <@handle> <email> [--password <pw>]");
  const email = normEmail(e);
  if (!email) fail(`이메일 형식이 아닙니다: ${e}`);
  const given = typeof flags.password === "string" ? flags.password : null;
  if (flags.password === true) fail("--password 다음에 비밀번호를 적어주세요");
  if (given) {
    const p = passwordProblem(given);
    if (p) fail(p);
  }
  const seller = await sellerByHandle(h);
  let user = await userByEmail(email);
  let generated = null;
  if (!user) {
    const password = given ?? (generated = generatePassword());
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { myr_creator: true } });
    if (error) fail(`계정 생성 실패: ${error.message}`);
    user = data.user;
  } else if (given) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password: given });
    if (error) fail(`비밀번호 변경 실패: ${error.message}`);
  }
  const already = seller.user_id === user.id;
  await link(seller, user, email);
  console.log(`[${where}] ${seller.handle} (${seller.name}) ← ${email} ${already ? "이미 연결됨" : "연결"}${given ? " · 비밀번호 설정" : ""}`);
  if (generated) console.log(`  임시 비밀번호: ${generated}   ← 이번 한 번만 표시합니다. 크리에이터에게 따로 전달하세요.`);
  if (!seller.active) console.log("  ⚠ 이 크리에이터는 정지 상태(active=false) — 로그인하면 /suspended. reactivate 로 해제");
}

async function cmdInvite() {
  const [h, e] = args;
  const redirectTo = inviteRedirect(flags.console);
  if (!h || !e || !redirectTo) fail("usage: invite <@handle> <email> --console <https://콘솔주소>");
  const email = normEmail(e);
  if (!email) fail(`이메일 형식이 아닙니다: ${e}`);
  const seller = await sellerByHandle(h);
  let user = await userByEmail(email);
  if (!user) {
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo, data: {} });
    if (error) fail(`초대 실패: ${error.message}`);
    user = data.user;
    await db.auth.admin.updateUserById(user.id, { app_metadata: { myr_creator: true } });
    console.log(`[${where}] 초대 메일 발송 → ${email} (링크 → ${redirectTo.split("?")[0]})`);
  } else {
    console.log(`[${where}] ${email} 계정이 이미 있어 초대 메일 없이 연결만 합니다 — 비밀번호를 모르면 콘솔 "비밀번호 찾기"`);
  }
  await link(seller, user, email);
  console.log(`  ${seller.handle} (${seller.name}) ← ${email} 연결`);
}

async function cmdUnlink() {
  const seller = await sellerByHandle(args[0] ?? fail("usage: unlink <@handle>"));
  if (!seller.user_id) return console.log(`${seller.handle} 은 연결된 계정이 없습니다`);
  const { error } = await db.from("sellers").update({ user_id: null }).eq("id", seller.id);
  if (error) fail(error.message);
  console.log(`[${where}] ${seller.handle} 계정 연결을 끊었습니다(계정은 남아 있음 — 다시 account 로 연결 가능)`);
}

async function setActive(active) {
  const seller = await sellerByHandle(args[0] ?? fail(`usage: ${active ? "reactivate" : "suspend"} <@handle>`));
  const { error } = await db.from("sellers").update({ active }).eq("id", seller.id);
  if (error) fail(error.message);
  console.log(`[${where}] ${seller.handle} ${active ? "정지 해제" : "정지"}${active ? "" : " — 콘솔 접근 차단 · 샵 상품 노출 중단"}`);
}

async function cmdList() {
  const { data, error } = await db.from("myr_products").select("status, sellers(id, name, handle, user_id, active)").is("deleted_at", null);
  if (error) fail(error.message);
  const map = new Map();
  for (const r of data ?? []) {
    const s = r.sellers;
    if (!s) continue;
    const m = map.get(s.id) ?? { ...s, total: 0, listed: 0, email: null };
    m.total++;
    if (r.status === "listed") m.listed++;
    map.set(s.id, m);
  }
  for (const m of map.values()) {
    if (!m.user_id) continue;
    const { data: u } = await db.auth.admin.getUserById(m.user_id);
    m.email = u?.user?.email ?? "(계정 없음)";
  }
  console.log(`[${where}]`);
  console.log(formatCreatorsTable([...map.values()]));
}

async function cmdSettleInfo() {
  const { data, error } = await db.rpc("myr_app_admin_settle_infos", { p_status: flags.all ? null : "pending" });
  if (error) fail(error.message);
  console.log(`[${where}] 사업자 · 정산 정보 ${flags.all ? "(전부)" : "확인 대기"} ${data.length}건`);
  for (const r of data) {
    console.log(`\n${r.handle}  ${r.name}  [${r.status}]  제출 ${r.submitted_at ?? "—"}`);
    console.log(`  상호 ${r.company ?? "—"} · 대표자 ${r.ceo ?? "—"} · 사업자번호 ${r.biz_no ? r.biz_no.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3") : "—"}`);
    console.log(`  계좌 ${r.bank ?? "—"} ${r.account ?? ""} · 예금주 ${r.holder ?? "—"} · 세금계산서 ${r.tax_email ?? "—"}`);
    if (r.note) console.log(`  요청 사유: ${r.note}`);
    if (r.status === "pending" && r.submitted_at) {
      console.log(`  확인 완료:   node packages/db/scripts/myr-creators.mjs settle-verify ${r.handle} --at ${r.submitted_at}`);
      console.log(`  다시 입력:   node packages/db/scripts/myr-creators.mjs settle-reject ${r.handle} "사유" --at ${r.submitted_at}`);
    }
  }
}

async function settleCheck(decision) {
  const seller = await sellerByHandle(args[0] ?? fail(`usage: settle-${decision} <@handle>${decision === "reject" ? ' "<사유>"' : ""} --at <제출 시각>`));
  const note = decision === "reject" ? (args[1] ?? fail('usage: settle-reject <@handle> "<사유>" --at <제출 시각>')) : null;
  const at = typeof flags.at === "string" ? flags.at : fail(`--at <제출 시각> 이 필요합니다 — settle-info 로 지금 값을 본 뒤 그 줄에 찍힌 명령을 그대로 쓰세요`);
  const { data, error } = await db.rpc("myr_app_admin_settle_info_check", { p_seller: seller.id, p_decision: decision, p_submitted_at: at, p_note: note, p_admin: null });
  if (error) fail(error.message);
  if (data?.code === "STALE") fail(`그사이 크리에이터가 정보를 다시 저장했어요(지금 제출 ${data.submitted_at ?? "—"}) — settle-info 로 새 값을 보고 다시 확인하세요`);
  if (!data?.ok) fail(`거부: ${data?.code}${data?.status ? ` (지금 ${data.status})` : ""}`);
  console.log(`[${where}] ${seller.handle} 정산 정보 → ${data.status === "verified" ? "확인 완료" : "다시 입력 요청"}`);
}

const commands = { "settle-info": cmdSettleInfo, "settle-verify": () => settleCheck("verify"), "settle-reject": () => settleCheck("reject"), list: cmdList, account: cmdAccount, invite: cmdInvite, unlink: cmdUnlink, suspend: () => setActive(false), reactivate: () => setActive(true) };
if (!cmd || !commands[cmd]) {
  console.error(
    "usage: node packages/db/scripts/myr-creators.mjs list | account <@handle> <email> [--password pw] | invite <@handle> <email> --console <url> | unlink <@handle> | suspend <@handle> | reactivate <@handle> | settle-info [--all] | settle-verify <@handle> --at <제출 시각> | settle-reject <@handle> \"사유\" --at <제출 시각>"
  );
  process.exit(2);
}
await commands[cmd]();
