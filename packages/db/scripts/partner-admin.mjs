// 파트너(인플루언서 · 브랜드) 운영 스크립트 — 관리자 화면 없이 운영하는 최소 구현 (docs/inf-console-plan.md §4.7 · brand-console-plan.md §3). service role · production 허용.
//
//   node packages/db/scripts/partner-admin.mjs <cmd> [args]   (저장소 루트에서)
//
//   list [--inactive]                       인플루언서 표 (code · 활동명 · 이메일 · 플랫폼 · 핸들 · 등급 · active · 계정 연결 · 가입일)
//   suspend <seller> ["<사유>"]             sellers.active=false — 다음 요청부터 requireSeller() 가 /suspended 로 보낸다. 사유는 stdout·Slack 한 줄만
//   reactivate <seller>                     sellers.active=true
//   link <seller> <user_id>                 create_seller_from_signup(p_link_id) 연결 경로 — 대상 행 user_id null · 그 user 로 만든 행 없음이 전제
//   invite <email> --link <seller>          auth.admin.inviteUserByEmail + app_metadata.link_seller_id → 초대 메일 링크(type=invite) → /influencer/auth/confirm
//                                           → 시드 행 연결 → /password/new. 시드 8명(*@sellery.demo)은 실제 메일을 못 받으므로 실제 계약자 메일로
//   channels [--pending]                    seller_channels 표 — --pending = vcode_confirmed_at is not null and not verified ([인증 확인] 누른 채널)
//   verify-channel <channel>                운영자가 프로필 bio / @sellery.official DM 에서 코드를 확인한 뒤 → verified=true, vcode=null
//   unverify-channel <channel>              사칭 발견 시 → verified=false, vcode_confirmed_at=null (메인 채널이면 primary 는 유지)
//
//   ── 4단계 샘플 결제 (0012 partner_payments · docs/inf-console-plan.md §5.7 "결제 후 취소 요청") ──
//   payments [--pending] [--seller <seller>] [--limit N]   partner_payments 표(최신순 50) — --pending = PENDING · CONFIRMING · FAILED(CANCEL_PENDING) 만 (운영 큐)
//   refund-sample <payment id | slrp_ orderId> ["<사유>"]  결제 후·브랜드 발송 전 취소 = @sellery/payments refundSamplePurchase 와 같은 두 단계를 인라인으로:
//                                           (1) 현금분이 있으면 토스 전액 취소(POST /v1/payments/{paymentKey}/cancel · Idempotency-Key `${id}:refund` · TOSS_SECRET_KEY)
//                                           (2) app_partner_payment_refund → 🥬 복구 · 캠페인 DECLINED · 주문 CANCELED · REFUNDED + payment_events(sample_refund)
//                                           두 번 실행해도 원장 1행(already). 발송 뒤(캠페인이 SAMPLE_PURCHASED 가 아님)면 함수가 거부 — 수동 조정.
//
//   ── 브랜드 콘솔 1단계 (0014 create_brand_from_signup · docs/brand-console-plan.md §3 · §6) ──
//   brands [--inactive]                     브랜드 표 (code · 상호 · 카테고리 · 담당자 · 이메일 · 사업자번호 · 등급 · active · 계정 연결 · 입점일)
//   suspend-brand <brand> ["<사유>"]        brands.active=false — 다음 요청부터 requireBrand() 가 /brand/suspended 로 보낸다. listed 상품은 자동으로 내리지 않는다(경고 출력 — §8)
//   reactivate-brand <brand>                brands.active=true
//   link-brand <brand> <user_id>            create_brand_from_signup(p_link_id) 연결 경로 — 대상 행 user_id null · 그 user 로 만든 행 없음이 전제
//   invite-brand <email> --link <brand>     auth.admin.inviteUserByEmail(partner_role:'brand') + app_metadata.link_brand_id → 초대 메일 링크(type=invite) → /brand/auth/confirm
//                                           → 시드 행 연결 → /brand/password/new. 시드 b1·b2(*.example)는 실제 메일을 못 받으므로 실제 담당자 메일로
//
//   <seller> · <channel> · <brand> 는 code('s1' · 'ch1' · 'b1') 또는 uuid. 이메일은 마스킹하지 않지만 키·비밀은 절대 출력하지 않는다.
//   .env.local 은 자동으로 읽는다(저장소 루트 .env.local · 값 미출력 — PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · refund-sample 은 TOSS_SECRET_KEY). 대안은 언제나 `npx supabase db query --linked "…"`.
//   Slack 알림(SLACK_WEBHOOK_URL 있을 때만): suspend/reactivate/verify-channel/refund-sample/suspend-brand/reactivate-brand 한 줄 — 이메일·핸들·URL·사업자번호 없이.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if ((process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.TOSS_SECRET_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local"); // 저장소 루트 (4 앱 공용, 결정 11)
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 값 미출력 — 아래에서 누락 안내 */
  }
}
loadEnv();

const url = process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[partner-admin] PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — 루트 .env.local 을 확인하세요.");
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
      "  payments [--pending] [--seller <seller>] [--limit N] | refund-sample <payment id | slrp_ orderId> [reason]",
      "  brands [--inactive] | suspend-brand <brand> [reason] | reactivate-brand <brand> | link-brand <brand> <user_id> | invite-brand <email> --link <brand>",
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

/** 콘솔 오리진·경로 — 경로 모드만(PUBLIC_SITE_URL + /influencer, docs/monorepo-migration.md 결정 11·15). 호스트 모드(NEXT_PUBLIC_INF_HOST)는 폐기. */
function consoleRedirectTo(path, prefix = "/influencer") {
  // 초대 링크는 콘솔 전용 `/influencer/auth/confirm` · `/brand/auth/confirm` 으로 (결정 15 · §5.4) — 각 앱이 받는다(sellery.life 는 shop 의 rewrite 를 거쳐, Preview 는 자기 오리진).
  const site = (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:5176").replace(/\/$/, "");
  return `${site}${prefix}/auth/confirm?next=${encodeURIComponent(`${prefix}${path}`)}`;
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
  console.log("  메일의 링크(type=invite) → /influencer/auth/confirm → 시드 행 연결 → /influencer/password/new 에서 비밀번호 설정.");
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

/* ------------------------------------------------------------ 브랜드 콘솔 1단계 (0014) ------------------------------------------------------------ */

async function findBrand(ref) {
  if (!ref) usage();
  const q = admin.from("brands").select("id, code, name, category, manager_name, email, biz_no, grade, active, user_id, created_at");
  const { data, error } = UUID_RE.test(ref) ? await q.eq("id", ref).maybeSingle() : await q.eq("code", ref).maybeSingle();
  if (error) throw new Error(`brands read failed: ${error.message}`);
  if (!data) {
    console.error(`[partner-admin] 브랜드 없음: ${ref}`);
    process.exit(1);
  }
  return data;
}

async function cmdBrands() {
  let q = admin
    .from("brands")
    .select("code, name, category, manager_name, email, biz_no, grade, active, user_id, created_at")
    .order("created_at", { ascending: true });
  if (flags.inactive) q = q.eq("active", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  console.table(
    (data ?? []).map((b) => ({
      code: b.code,
      상호: b.name,
      카테고리: b.category,
      담당자: b.manager_name ?? "",
      이메일: b.email ?? "",
      사업자번호: b.biz_no ?? "",
      등급: b.grade ?? "",
      active: b.active,
      계정: b.user_id ? `연결 (${b.user_id.slice(0, 8)}…)` : "미연결",
      입점일: fmtDate(b.created_at),
    })),
  );
}

async function cmdSuspendBrand(active) {
  const b = await findBrand(positional[0]);
  const reason = positional[1] ?? "";
  const { error } = await admin.from("brands").update({ active }).eq("id", b.id);
  if (error) throw new Error(error.message);
  const verb = active ? "복귀" : "정지";
  console.log(`[partner-admin] 브랜드 ${verb}: ${b.code ?? b.id} ${b.name}${reason ? ` — ${reason}` : ""}`);
  if (!active) {
    // 정지된 브랜드의 listed 상품은 자동으로 내리지 않는다(진행 중 캠페인·주문이 있을 수 있다 — brand-console-plan §8). 운영자가 판단해 review-product(2단계) 로 paused.
    const { count } = await admin.from("products").select("id", { count: "exact", head: true }).eq("brand_id", b.id).eq("status", "listed").is("deleted_at", null);
    if (count) console.warn(`[partner-admin] 경고: 이 브랜드의 listed 상품 ${count}개는 그대로 노출됩니다 — 필요하면 상품 상태를 따로 내리세요.`);
  }
  await notifySlack(`[셀러리] 브랜드 ${verb} · ${b.code ?? b.id} · ${b.name}${reason ? ` · ${reason}` : ""}`);
}

async function cmdLinkBrand() {
  const b = await findBrand(positional[0]);
  const userId = positional[1];
  if (!userId || !UUID_RE.test(userId)) usage();
  const { data, error } = await admin.rpc("create_brand_from_signup", {
    p_user_id: userId,
    p_name: "",
    p_biz_no: "",
    p_manager_name: "",
    p_manager_phone: "",
    p_category: "",
    p_link_id: b.id,
  });
  if (error) throw new Error(error.message);
  console.log(`[partner-admin] link-brand ${b.code ?? b.id} ← ${userId}:`, JSON.stringify(data));
  if (data && data.ok === false) process.exit(1);
}

async function cmdInviteBrand() {
  const email = (positional[0] ?? "").trim().toLowerCase();
  const linkRef = flags.link;
  if (!email || !email.includes("@") || !linkRef || linkRef === true) usage();
  const b = await findBrand(linkRef);
  if (b.user_id) {
    console.error(`[partner-admin] ${b.code ?? b.id} 는 이미 계정에 연결돼 있습니다 (user ${b.user_id}).`);
    process.exit(1);
  }
  const redirectTo = consoleRedirectTo("/password/new", "/brand");
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { partner_role: "brand" }, redirectTo });
  if (error) {
    if (error.code === "email_exists" || /already/i.test(error.message)) {
      console.error(`[partner-admin] 이미 가입된 이메일입니다 — 그 계정의 user_id 로 \`link-brand ${b.code ?? b.id} <user_id>\` 를 쓰세요.`);
      process.exit(1);
    }
    throw new Error(`inviteUserByEmail failed: ${error.message}`);
  }
  const uid = data.user.id;
  const { error: metaError } = await admin.auth.admin.updateUserById(uid, { app_metadata: { link_brand_id: b.id } });
  if (metaError) throw new Error(`updateUserById failed: ${metaError.message}`);
  console.log(`[partner-admin] 초대 메일 발송: ${email} → ${b.code ?? b.id} ${b.name} (user ${uid}) · redirectTo ${redirectTo}`);
  console.log("  메일의 링크(type=invite) → /brand/auth/confirm → 시드 행 연결 → /brand/password/new 에서 비밀번호 설정.");
}

/* ------------------------------------------------------------ 4단계 샘플 결제 ------------------------------------------------------------ */

const PAYMENT_COLS =
  "id, status, kind, seller_id, product_id, campaign_id, toss_order_id, payment_key, order_name, amount_total, amount_cel, amount_cash, use_cel, fail_code, fail_message, approved_at, expires_at, created_at, sellers(code, name), products(code, name)";

async function findPayment(ref) {
  if (!ref) usage();
  const q = admin.from("partner_payments").select(PAYMENT_COLS);
  const { data, error } = UUID_RE.test(ref)
    ? await q.eq("id", ref).maybeSingle()
    : ref.startsWith("slrp_")
      ? await q.eq("toss_order_id", ref).maybeSingle()
      : { data: null, error: null };
  if (error) throw new Error(`partner_payments read failed: ${error.message}`);
  if (!data) {
    console.error(`[partner-admin] 결제 없음: ${ref} (uuid 또는 slrp_ orderId)`);
    process.exit(1);
  }
  return data;
}

function fmtPay(p) {
  const cel = p.amount_cel > 0 ? `🥬${p.amount_cel}+₩${p.amount_cash}` : `₩${p.amount_cash}`;
  return { status: p.status, fail: p.fail_code ?? "", amount: `${p.amount_total} (${cel})` };
}

async function cmdPayments() {
  const limit = Math.min(Number(flags.limit) || 50, 500);
  let q = admin.from("partner_payments").select(PAYMENT_COLS).order("created_at", { ascending: false }).limit(limit);
  if (flags.pending) q = q.or("status.eq.PENDING,status.eq.CONFIRMING,and(status.eq.FAILED,fail_code.eq.CANCEL_PENDING)");
  if (flags.seller) q = q.eq("seller_id", (await findSeller(String(flags.seller))).id);
  const { data, error } = await q;
  if (error) throw new Error(`partner_payments read failed: ${error.message}`);
  console.table(
    (data ?? []).map((p) => ({
      id: p.id,
      orderId: p.toss_order_id,
      ...fmtPay(p),
      seller: p.sellers ? `${p.sellers.code ?? ""} ${p.sellers.name ?? ""}`.trim() : p.seller_id,
      product: p.products ? `${p.products.code ?? ""} ${p.products.name ?? ""}`.trim() : p.product_id,
      campaign: p.campaign_id ? "✓" : "",
      created: String(p.created_at).slice(0, 16).replace("T", " "),
    })),
  );
}

/** @sellery/payments toss.server tossCancel 과 같은 호출 (Basic base64(`${secret}:`) · Idempotency-Key). 응답 본문은 그대로 돌려준다. */
async function tossCancel(paymentKey, reason, idempotencyKey) {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error("TOSS_SECRET_KEY 가 없습니다 — 루트 .env.local 을 확인하세요 (값은 출력하지 않습니다).");
  const res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ cancelReason: reason.slice(0, 200) }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

async function logEvent(ev) {
  const { error } = await admin.from("payment_events").insert({
    source: "cancel",
    event_type: "sample_refund",
    toss_order_id: ev.orderId,
    payment_key: ev.paymentKey ?? null,
    payload: ev.payload ?? {},
    handled: ev.handled,
    result: ev.result,
  });
  if (error) console.error("[partner-admin] payment_events insert failed:", error.message);
}

async function cmdRefundSample() {
  const p = await findPayment(positional[0]);
  const reason = (positional[1] ?? "샘플 구매 취소 (브랜드 발송 전)").slice(0, 200);
  const who = p.sellers ? `${p.sellers.code ?? ""} ${p.sellers.name ?? ""}`.trim() : p.seller_id;
  console.log(`[partner-admin] 결제 ${p.id} · ${p.toss_order_id} · ${p.status}${p.fail_code ? `(${p.fail_code})` : ""} · ${fmtPay(p).amount} · ${who} · ${p.products?.name ?? p.product_id}`);
  if (p.status === "REFUNDED") {
    console.log("[partner-admin] 이미 환불된 결제입니다 (already).");
    return;
  }
  if (p.status !== "CONFIRMED") {
    console.error(`[partner-admin] 결제 완료(CONFIRMED) 상태가 아니라 환불할 수 없습니다: ${p.status}`);
    process.exit(1);
  }

  // (1) 토스 현금분 전액 취소 — 실패하면 DB 는 건드리지 않는다 (refundSamplePurchase 와 같은 순서)
  let raw = null;
  let tossCanceled = p.amount_cash === 0;
  if (p.amount_cash > 0 && p.payment_key) {
    const r = await tossCancel(p.payment_key, reason, `${p.id}:refund`);
    const already = !r.ok && r.body && r.body.code === "ALREADY_CANCELED_PAYMENT";
    if (!r.ok && !already) {
      const code = r.body?.code ?? `HTTP_${r.status}`;
      await logEvent({ orderId: p.toss_order_id, paymentKey: p.payment_key, payload: { partner_payment_id: p.id, cancel: r.body, status: r.status, script: true }, handled: false, result: "error: cancel failed" });
      console.error(`[partner-admin] 토스 취소 실패: ${code} ${r.body?.message ?? ""} — DB 는 변경하지 않았습니다. 잠시 후 같은 명령으로 재시도(같은 Idempotency-Key).`);
      process.exit(1);
    }
    raw = r.body;
    tossCanceled = true;
    console.log(`[partner-admin] 토스 취소 ${already ? "이미 됨" : "완료"}: ₩${p.amount_cash}`);
  }

  // (2) DB 환불 — 🥬 복구 · 캠페인 DECLINED · 주문 CANCELED · REFUNDED
  const { data, error } = await admin.rpc("app_partner_payment_refund", { p_payment_id: p.id, p_reason: reason, p_raw: raw ?? undefined });
  if (error) {
    await logEvent({ orderId: p.toss_order_id, paymentKey: p.payment_key, payload: { partner_payment_id: p.id, error: error.message, toss_canceled: tossCanceled, script: true }, handled: false, result: "error: db refund failed" });
    throw new Error(`app_partner_payment_refund failed: ${error.message} (토스 취소는 ${tossCanceled ? "완료됨 — 수동 조정 필요" : "안 함"})`);
  }
  const ok = data && data.ok === true;
  await logEvent({
    orderId: p.toss_order_id,
    paymentKey: p.payment_key,
    payload: { partner_payment_id: p.id, result: data, toss_canceled: tossCanceled, script: true },
    handled: !!ok,
    result: ok ? (data.already ? "noop" : "refunded") : `needs_manual_adjust: ${data?.code ?? "BAD_RESULT"}`.slice(0, 200),
  });
  if (!ok) {
    console.error(`[partner-admin] 환불 기록 실패: ${data?.code ?? "BAD_RESULT"} ${data?.message ?? ""} (토스 취소는 ${tossCanceled ? "완료됨 — 수동 조정 필요" : "안 함"})`);
    process.exit(1);
  }
  console.log(`[partner-admin] 환불 ${data.already ? "이미 됨" : "완료"}: 🥬 복구 ${p.amount_cel} · 잔액 ${data.balance ?? "?"} · 캠페인 ${data.campaign_id ?? p.campaign_id ?? "-"} → DECLINED`);
  await notifySlack(`[셀러리] 샘플 결제 환불 · ${p.toss_order_id} · 🥬${p.amount_cel} + ₩${p.amount_cash}`);
}

try {
  switch (cmd) {
    case "list":
      await cmdList();
      break;
    case "payments":
      await cmdPayments();
      break;
    case "refund-sample":
      await cmdRefundSample();
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
    case "brands":
      await cmdBrands();
      break;
    case "suspend-brand":
      await cmdSuspendBrand(false);
      break;
    case "reactivate-brand":
      await cmdSuspendBrand(true);
      break;
    case "link-brand":
      await cmdLinkBrand();
      break;
    case "invite-brand":
      await cmdInviteBrand();
      break;
    default:
      usage();
  }
} catch (e) {
  console.error("[partner-admin]", e instanceof Error ? e.message : e);
  process.exit(1);
}
