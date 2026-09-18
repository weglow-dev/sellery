// 인플루언서 운영 스크립트 — 관리자 화면 없이 운영하는 최소 구현 (docs/inf-console-plan.md §4.7). service role · production 허용.
//
//   cd web && node scripts/partner-admin.mjs <cmd> [args]
//
//   list [--inactive]                       인플루언서 표 (code · 활동명 · 이메일 · 플랫폼 · 핸들 · 등급 · active · 계정 연결 · 가입일)
//   suspend <seller> ["<사유>"]             sellers.active=false — 다음 요청부터 requireSeller() 가 /suspended 로 보낸다. 사유는 stdout·Slack 한 줄만
//   reactivate <seller>                     sellers.active=true
//   link <seller> <user_id>                 create_seller_from_signup(p_link_id) 연결 경로 — 대상 행 user_id null · 그 user 로 만든 행 없음이 전제
//   invite <email> --link <seller>          auth.admin.inviteUserByEmail + app_metadata.link_seller_id → 초대 메일 링크(type=invite) → /auth/confirm
//                                           → 시드 행 연결 → /password/new. 시드 8명(*@sellery.demo)은 실제 메일을 못 받으므로 실제 계약자 메일로
//   channels [--pending]                    seller_channels 표 — --pending = vcode_confirmed_at is not null and not verified ([인증 확인] 누른 채널)
//   verify-channel <channel>                운영자가 프로필 bio / @sellery.official DM 에서 코드를 확인한 뒤 → verified=true, vcode=null
//   unverify-channel <channel>              사칭 발견 시 → verified=false, vcode_confirmed_at=null (메인 채널이면 primary 는 유지)
//
//   <seller> · <channel> 은 code('s1' · 'ch1') 또는 uuid. 이메일은 마스킹하지 않지만 키·비밀은 절대 출력하지 않는다.
//   .env.local 은 자동으로 읽는다(web/.env.local · 값 미출력). 대안은 언제나 `npx supabase db query --linked "…"`.
//   Slack 알림(SLACK_WEBHOOK_URL 있을 때만): suspend/reactivate/verify-channel 한 줄 — 이메일·핸들·URL 없이.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 값 미출력 — 아래에서 누락 안내 */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[partner-admin] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — web/.env.local 을 확인하세요.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {};
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  } else positional.push(a);
}

function usage(code = 2) {
  console.error(
    [
      "usage: node scripts/partner-admin.mjs <cmd>",
      "  list [--inactive] | suspend <seller> [reason] | reactivate <seller> | link <seller> <user_id>",
      "  invite <email> --link <seller> | channels [--pending] | verify-channel <channel> | unverify-channel <channel>",
    ].join("\n"),
  );
  process.exit(code);
}

async function notifySlack(text) {
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return;
  try {
    await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  } catch {
    /* best-effort */
  }
}

async function findSeller(ref) {
  if (!ref) usage();
  const q = admin.from("sellers").select("id, code, name, email, platform, handle, grade, active, user_id, created_at");
  const { data, error } = UUID_RE.test(ref) ? await q.eq("id", ref).maybeSingle() : await q.eq("code", ref).maybeSingle();
  if (error) throw new Error(`sellers read failed: ${error.message}`);
  if (!data) {
    console.error(`[partner-admin] 인플루언서 없음: ${ref}`);
    process.exit(1);
  }
  return data;
}

async function findChannel(ref) {
  if (!ref) usage();
  const q = admin
    .from("seller_channels")
    .select("id, code, seller_id, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at, sellers(code, name)");
  const { data, error } = UUID_RE.test(ref) ? await q.eq("id", ref).maybeSingle() : await q.eq("code", ref).maybeSingle();
  if (error) throw new Error(`seller_channels read failed: ${error.message}`);
  if (!data) {
    console.error(`[partner-admin] 채널 없음: ${ref}`);
    process.exit(1);
  }
  return data;
}

/** 콘솔 오리진·경로 — lib/hosts.ts 와 같은 규칙(호스트 모드: NEXT_PUBLIC_INF_HOST, 경로 모드: SITE_URL + /influencer) */
function consoleRedirectTo(path) {
  const inf = (process.env.NEXT_PUBLIC_INF_HOST || "").trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/.*$/, "");
  if (inf) {
    const bare = inf.replace(/:\d+$/, "");
    const scheme = bare === "localhost" || bare.endsWith(".localhost") || bare === "127.0.0.1" ? "http" : "https";
    return `${scheme}://${inf}/auth/confirm?next=${encodeURIComponent(path)}`;
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${site}/auth/confirm?next=${encodeURIComponent(`/influencer${path}`)}`;
}

function fmtDate(s) {
  return s ? String(s).slice(0, 10) : "";
}

async function cmdList() {
  let q = admin
    .from("sellers")
    .select("code, name, email, platform, handle, grade, active, user_id, created_at")
    .order("created_at", { ascending: true });
  if (flags.inactive) q = q.eq("active", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  console.table(
    (data ?? []).map((s) => ({
      code: s.code,
      활동명: s.name,
      이메일: s.email ?? "",
      플랫폼: s.platform,
      핸들: s.handle,
      등급: s.grade ?? "",
      active: s.active,
      계정: s.user_id ? `연결 (${s.user_id.slice(0, 8)}…)` : "미연결",
      가입일: fmtDate(s.created_at),
    })),
  );
}

async function cmdSuspend(active) {
  const s = await findSeller(positional[0]);
  const reason = positional[1] ?? "";
  const { error } = await admin.from("sellers").update({ active }).eq("id", s.id);
  if (error) throw new Error(error.message);
  const verb = active ? "복귀" : "정지";
  console.log(`[partner-admin] ${verb}: ${s.code ?? s.id} ${s.name}${reason ? ` — ${reason}` : ""}`);
  await notifySlack(`[셀러리] 인플루언서 ${verb} · ${s.code ?? s.id} · ${s.name}${reason ? ` · ${reason}` : ""}`);
}

async function cmdLink() {
  const s = await findSeller(positional[0]);
  const userId = positional[1];
  if (!userId || !UUID_RE.test(userId)) usage();
  const { data, error } = await admin.rpc("create_seller_from_signup", {
    p_user_id: userId,
    p_name: "",
    p_platform: "",
    p_handle: "",
    p_link_id: s.id,
  });
  if (error) throw new Error(error.message);
  console.log(`[partner-admin] link ${s.code ?? s.id} ← ${userId}:`, JSON.stringify(data));
  if (data && data.ok === false) process.exit(1);
}

async function cmdInvite() {
  const email = (positional[0] ?? "").trim().toLowerCase();
  const linkRef = flags.link;
  if (!email || !email.includes("@") || !linkRef || linkRef === true) usage();
  const s = await findSeller(linkRef);
  if (s.user_id) {
    console.error(`[partner-admin] ${s.code ?? s.id} 는 이미 계정에 연결돼 있습니다 (user ${s.user_id}).`);
    process.exit(1);
  }
  const redirectTo = consoleRedirectTo("/password/new");
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { partner_role: "seller" }, redirectTo });
  if (error) {
    if (error.code === "email_exists" || /already/i.test(error.message)) {
      console.error(`[partner-admin] 이미 가입된 이메일입니다 — 그 계정의 user_id 로 \`link ${s.code ?? s.id} <user_id>\` 를 쓰세요.`);
      process.exit(1);
    }
    throw new Error(`inviteUserByEmail failed: ${error.message}`);
  }
  const uid = data.user.id;
  const { error: metaError } = await admin.auth.admin.updateUserById(uid, { app_metadata: { link_seller_id: s.id } });
  if (metaError) throw new Error(`updateUserById failed: ${metaError.message}`);
  console.log(`[partner-admin] 초대 메일 발송: ${email} → ${s.code ?? s.id} ${s.name} (user ${uid}) · redirectTo ${redirectTo}`);
  console.log("  메일의 링크(type=invite) → /auth/confirm → 시드 행 연결 → /password/new 에서 비밀번호 설정.");
}

async function cmdChannels() {
  let q = admin
    .from("seller_channels")
    .select("code, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at, sellers(code, name)")
    .order("created_at", { ascending: true });
  if (flags.pending) q = q.not("vcode_confirmed_at", "is", null).eq("verified", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  console.table(
    (data ?? []).map((c) => ({
      channel: c.code,
      seller: c.sellers ? `${c.sellers.code ?? ""} ${c.sellers.name ?? ""}`.trim() : "",
      플랫폼: c.platform,
      핸들: c.handle,
      URL: c.url ?? "",
      verified: c.verified,
      primary: c.is_primary,
      vcode: c.vcode ?? "",
      확인요청: c.vcode_confirmed_at ? String(c.vcode_confirmed_at).slice(0, 16).replace("T", " ") : "",
    })),
  );
}

async function cmdVerify(verified) {
  const c = await findChannel(positional[0]);
  const patch = verified ? { verified: true, vcode: null } : { verified: false, vcode_confirmed_at: null };
  const { error } = await admin.from("seller_channels").update(patch).eq("id", c.id);
  if (error) throw new Error(error.message);
  const who = c.sellers ? `${c.sellers.code ?? ""} ${c.sellers.name ?? ""}`.trim() : c.seller_id;
  console.log(`[partner-admin] ${verified ? "인증 완료" : "인증 해제"}: ${c.code ?? c.id} (${c.platform} · ${who})`);
  await notifySlack(`[셀러리] 채널 ${verified ? "인증 완료" : "인증 해제"} · ${c.code ?? c.id} · ${c.platform}`);
}

try {
  switch (cmd) {
    case "list":
      await cmdList();
      break;
    case "suspend":
      await cmdSuspend(false);
      break;
    case "reactivate":
      await cmdSuspend(true);
      break;
    case "link":
      await cmdLink();
      break;
    case "invite":
      await cmdInvite();
      break;
    case "channels":
      await cmdChannels();
      break;
    case "verify-channel":
      await cmdVerify(true);
      break;
    case "unverify-channel":
      await cmdVerify(false);
      break;
    default:
      usage();
  }
} catch (e) {
  console.error("[partner-admin]", e instanceof Error ? e.message : e);
  process.exit(1);
}
