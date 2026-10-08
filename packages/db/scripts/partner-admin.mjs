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
//   ── 브랜드 콘솔 2단계 (0015 app_admin_review_product · docs/brand-console-plan.md §0 결정 9 — 상품 검수는 관리자 콘솔 전까지 여기서) ──
//   products [--pending] [--brand <brand>] [--limit N]   상품 표(최신순 100 · 삭제 제외) — --pending = 검수 대기(status 'pending') 만 (운영 큐)
//   review-product <product> approve|reject|pause ["<사유>"]   approve: pending/rejected/paused → listed(재고 0 이면 platform_settings.default_stock_on_approve)
//                                           · reject: → rejected + 사유(필수 · 브랜드 상품 화면에 표시) · pause: listed → paused(정지 브랜드 상품 내리기 §8). Slack 한 줄
//
//   ── 브랜드 콘솔 3단계 (0016 — 조회만 · 전이는 두 콘솔이 RPC 로) ──
//   campaign <campaign>                     캠페인 1건: 상태 · 인플루언서 · 상품 · 제안/확정 일정 · 잠금 가격 · 잔여 재고 · 스레드(campaign_events 시간순, chat 은 leak 표시)
//
//   ── 브랜드 콘솔 4단계 (0018 — 스케줄러 · 주문 · CS · docs/brand-console-plan.md §4 "0018") ──
//   tick                                    app_campaign_tick() — SCHEDULE_CONFIRMED→LIVE(시작일 도래) · LIVE→CLEARING(종료일 경과) 전체 · 멱등 (프로덕션은 shop /api/cron/campaign-tick 이 매시 실행)
//   tick-campaign <campaign>                app_campaign_tick_one — 1건만
//   orders [--campaign <campaign>] [--brand <brand>] [--unshipped|--shipped|--refunded] [--limit N]   브랜드 주문 표(app_brand_orders · 샘플 제외 · 수취인은 이름만) — --brand 없으면 캠페인의 브랜드
//   cs [--open] [--brand <brand>] [--limit N]   고객 문의 표(cs_conversations 최신순 50) — --open = OPEN 만 · --brand 로 한 브랜드만. 답변·종료는 브랜드 콘솔에서
//
//   ── 관리자 콘솔 "정산 · 돈" PR-A (0020 — docs/admin-console-plan.md · settlement-policy §8 · 화면(PR-B) 전까지 여기서) ──
//   settle-preview <campaign>               app_admin_settle_preview — calc() 전체 라인 · 보류 예고 · 실행 가능 여부 (LIVE/CLEARING 실시간 · SETTLED 스냅샷)
//   settle-run <campaign> [--force --reason "…"]   app_admin_settle_run_v2 — CLEARING · 기준일(D+21) 도래분만.
//                                           --force 는 기준일 전 강제 — **사유 필수**(settlements.memo 에 남는다).
//                                           관리자 화면에서는 강제 실행을 할 수 없다(0047) — 지급 리허설 전용.
//                                           한 트랜잭션 · SETTLED 면 already
//   settle-due                              app_admin_settle_run_due — 기준일 도래 CLEARING 전부 (runSettleAll · 크론 후보)
//   settlements [--status pending|held|paid] [--limit N]   app_admin_settlements — 대기 큐(CLEARING) + 스냅샷 표 + 카운트
//   payouts [--status pending|held|paid|all]               지급 표(payouts · 계좌는 마스킹 스냅샷) — 이체 파일은 payouts-export
//   payouts-export [--status pending] --purpose "지급 배치 2026-10" [--out 파일.csv]   app_admin_payout_export — 계좌 **원문** CSV(BOM+CRLF). 건마다 sensitive_access_log. actor = ADMIN_ACTOR env 또는 OS 사용자
//   payout-paid <payout id> ["메모"]        app_admin_payout_mark_paid — 이체 후 지급 완료(pending → paid · 양측 paid 면 정산 paid)
//   payout-hold <payout id> ["사유"] · payout-release <payout id>   운영자 보류 / 해제(정보 완비 재검사 · STILL_INCOMPLETE 면 거부)
//   payments-health                         app_admin_payments_health — 결제 정합성 카운트(만료 세션 · 미처리 이벤트 · 부분취소 · 정산 후 조정 큐 …)
//   admin-orders [--filter all|paid|unshipped|shipped|refunded|sample|manual|partial] [--q 검색] [--limit N]   전 브랜드 주문 표
//
//   ── 토스 지급대행 (0040 · docs/admin-console-plan.md "정산·돈" §7 · deploy.md §5.3.1 — TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY 필요) ──
//   payout-mode [manual|toss]               platform_settings.payout_mode 보기/바꾸기 — toss 로 바꾸면 보류 조건에 토스 셀러 상태가 더해지고 전체 지급을 재검사(app_payout_mode_set)
//   toss-balance                            GET /v2/balances — 지급 가능/대기 잔액
//   toss-queue                              app_admin_payouts_toss_queue — 지급 대기·보류·최근 지급 행 + 셀러 상태 · requestable · reason
//   toss-seller-sync <seller> [--brand]     정산 정보 → 토스 셀러 등록/수정(JWE) → app_partner_seller_sync. 계좌 원문을 읽으므로 sensitive_access_log 1행
//   toss-seller-delete <seller> [--brand]   토스 셀러 삭제 + 로컬 toss_seller_* 비움(테스트 정리)
//   payout-cap [<원>]                       platform_settings.payout_daily_cap 보기/바꾸기 — 하루(KST) 토스 지급 요청 상한(기본 5,000,000 · 공유 잔액 보호, 2026-10-08)
//   toss-payout-request [--all | --id <payout id>] [--express | --date YYYY-MM-DD]   requestable 행을 100건씩 POST /v2/payouts(JWE · Idempotency-Key) → app_payout_mark_requested. 기본 --express
//                                           보내기 전에 공유 잔액 가드(토스 잔액 · 셀러리 지급 대기 합계 · 오늘 요청 + 이번 ≤ payout_daily_cap)를 검사해 걸리면 한 건도 보내지 않는다(앱 requestDuePayouts 와 같은 규칙)
//   toss-payout-refresh <payout id>         GET /v2/payouts/{toss id} → app_payout_sync_status (웹훅을 놓쳤을 때)
//   toss-payout-cancel <payout id>          POST /v2/payouts/{toss id}/cancel (REQUESTED 만) → app_payout_sync_status
//
//   <seller> · <channel> · <brand> · <product> · <campaign> 는 code('s1' · 'ch1' · 'b1' · 'p1' · 'c3') 또는 uuid. 이메일은 마스킹하지 않지만 키·비밀은 절대 출력하지 않는다.
//   .env.local 은 자동으로 읽는다(저장소 루트 .env.local · 값 미출력 — PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · refund-sample 은 TOSS_SECRET_KEY · toss-* 는 TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY). 대안은 언제나 `npx supabase db query --linked "…"`.
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
      "  products [--pending] [--brand <brand>] [--limit N] | review-product <product> approve|reject|pause [\"사유\"]",
      "  campaign <campaign>",
      "  tick | tick-campaign <campaign> | orders [--campaign c] [--brand b] [--unshipped|--shipped|--refunded] [--limit N] | cs [--open] [--brand b] [--limit N]",
      "  settle-preview <campaign> | settle-run <campaign> [--force --reason \"사유\"] | settle-due | settlements [--status pending|held|paid] [--limit N]",
      "  payouts [--status pending|held|paid|all] | payouts-export [--status pending] --purpose \"…\" [--out file.csv] | payout-paid <id> [\"메모\"] | payout-hold <id> [\"사유\"] | payout-release <id>",
      "  payments-health | admin-orders [--filter all|paid|unshipped|shipped|refunded|sample|manual|partial] [--q 검색] [--limit N]",
      "  payout-mode [manual|toss] | payout-cap [<원>] | toss-balance | toss-queue | toss-seller-sync <seller> [--brand] | toss-seller-delete <seller> [--brand]",
      "  toss-payout-request [--all | --id <payout id>] [--express | --date YYYY-MM-DD] | toss-payout-refresh <payout id> | toss-payout-cancel <payout id>",
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

/* ------------------------------------------------------------ 브랜드 2단계 — 상품 검수 (0015 app_admin_review_product) ------------------------------------------------------------ */

async function findProduct(ref) {
  if (!ref) usage();
  const q = admin.from("products").select("id, code, name, status, stock, reject_reason, deleted_at, brands(code, name)");
  const { data, error } = UUID_RE.test(ref) ? await q.eq("id", ref).maybeSingle() : await q.eq("code", ref).maybeSingle();
  if (error) throw new Error(`products read failed: ${error.message}`);
  if (!data) {
    console.error(`[partner-admin] 상품 없음: ${ref}`);
    process.exit(1);
  }
  return data;
}

async function cmdProducts() {
  let q = admin
    .from("products")
    .select("code, name, category, sale_price, commission_rate, stock, status, reject_reason, created_at, updated_at, brands(code, name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Number(flags.limit) || 100);
  if (flags.pending) q = q.eq("status", "pending");
  if (typeof flags.brand === "string") {
    const b = await findBrand(flags.brand);
    q = q.eq("brand_id", b.id);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  console.table(
    (data ?? []).map((p) => ({
      code: p.code,
      상품: p.name,
      브랜드: p.brands ? `${p.brands.code ?? ""} ${p.brands.name}`.trim() : "",
      카테고리: p.category,
      판매가: p.sale_price,
      "인플 수수료": `${Math.round(Number(p.commission_rate) * 1000) / 10}%`,
      재고: p.stock,
      상태: p.status,
      "반려 사유": p.reject_reason ?? "",
      등록: fmtDate(p.created_at),
      수정: fmtDate(p.updated_at),
    })),
  );
}

async function cmdCampaign() {
  const ref = positional[0];
  if (!ref) usage();
  const sel =
    "id, code, status, invited, purchased, regongu, test_due, proposed_start, proposed_end, proposed_qty, start_date, end_date, qty, sold_qty, price_locked, rate_locked, decision_reason, sample_courier, tracking_no, created_at, updated_at, " +
    "sellers(code, name, handle, grade), products(id, code, name, sale_price, commission_rate, stock, status), brands(code, name)";
  const q = UUID_RE.test(ref) ? admin.from("campaigns").select(sel).eq("id", ref) : admin.from("campaigns").select(sel).eq("code", ref);
  const { data: c, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error(`캠페인을 찾을 수 없습니다: ${ref}`);
  const { data: alloc } = await admin.rpc("product_allocated", { p_product_id: c.products?.id, p_except_campaign_id: c.id });
  const stockLeft = Math.max(0, (c.products?.stock ?? 0) - (alloc ?? 0));
  console.table([
    {
      code: c.code,
      상태: c.status,
      인플루언서: c.sellers ? `${c.sellers.code} ${c.sellers.name} ${c.sellers.handle} (${c.sellers.grade ?? "-"})` : "",
      브랜드: c.brands ? `${c.brands.code ?? ""} ${c.brands.name}`.trim() : "",
      상품: c.products ? `${c.products.code} ${c.products.name} ₩${c.products.sale_price} · ${Math.round(Number(c.products.commission_rate) * 1000) / 10}% · 재고 ${c.products.stock} (${c.products.status})` : "",
      "잔여 재고": stockLeft,
      "제안 일정": c.proposed_start ? `${c.proposed_start} ~ ${c.proposed_end} · ${c.proposed_qty}` : "",
      "확정 일정": c.start_date ? `${c.start_date} ~ ${c.end_date} · ${c.qty} (판매 ${c.sold_qty})` : "",
      "잠금 가격": c.price_locked !== null ? `₩${c.price_locked} · ${Math.round(Number(c.rate_locked) * 1000) / 10}%` : "",
      "테스트 기한": c.test_due ?? "",
      "샘플 송장": c.sample_courier ? `${c.sample_courier} ${c.tracking_no}` : "",
      플래그: [c.invited ? "invited" : "", c.purchased ? "purchased" : "", c.regongu ? "regongu" : ""].filter(Boolean).join(" "),
      "종결 사유": c.decision_reason ?? "",
      생성: fmtDate(c.created_at),
      수정: fmtDate(c.updated_at),
    },
  ]);
  const { data: ev, error: evErr } = await admin
    .from("campaign_events")
    .select("kind, sender, actor_role, event_type, body, leak_flag, created_at")
    .eq("campaign_id", c.id)
    .order("created_at", { ascending: true });
  if (evErr) throw new Error(evErr.message);
  console.table(
    (ev ?? []).map((e) => ({
      시각: fmtDate(e.created_at),
      종류: e.kind === "chat" ? `chat(${e.sender})${e.leak_flag ? " ⚠leak" : ""}` : (e.event_type ?? "system"),
      발신: e.actor_role ?? "",
      본문: (e.body ?? "").replace(/[\r\n]+/g, " ").slice(0, 90),
    })),
  );
}

async function cmdReviewProduct() {
  const p = await findProduct(positional[0]);
  const decision = (positional[1] ?? "").toLowerCase();
  const reason = positional[2] ?? "";
  if (!["approve", "reject", "pause"].includes(decision)) usage();
  if (decision === "reject" && !reason.trim()) {
    console.error("[partner-admin] reject 는 사유가 필요합니다 (브랜드 화면에 표시됩니다) — 예: \"건강·웰니스 카테고리 범위 밖\"");
    process.exit(2);
  }
  const { data, error } = await admin.rpc("app_admin_review_product", { p_product_id: p.id, p_decision: decision, p_reason: reason || undefined });
  if (error) throw new Error(`app_admin_review_product failed: ${error.message}`);
  if (!data?.ok) {
    console.error(`[partner-admin] 검수 실패: ${data?.code ?? "BAD_RESULT"}${data?.status ? ` (현재 ${data.status})` : ""}`);
    process.exit(1);
  }
  const verb = decision === "approve" ? "승인 → listed" : decision === "reject" ? "반려 → rejected" : "노출 중단 → paused";
  const brand = p.brands ? `${p.brands.code ?? ""} ${p.brands.name}`.trim() : "";
  console.log(
    `[partner-admin] 상품 검수 ${data.already ? "(이미 됨) " : ""}${verb}: ${p.code ?? p.id} ${p.name} · ${brand}` +
      (decision === "approve" ? ` · 재고 ${data.stock}` : "") +
      (reason ? ` — ${reason}` : ""),
  );
  if (!data.already) await notifySlack(`[셀러리] 상품 검수 ${verb} · ${p.code ?? p.id} · ${p.name} · ${brand}${reason ? ` · ${reason}` : ""}`);
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

/* ------------------------------------------------------------ 브랜드 콘솔 4단계 (0018) ------------------------------------------------------------ */

async function cmdTick() {
  const { data, error } = await admin.rpc("app_campaign_tick");
  if (error) throw new Error(`app_campaign_tick failed: ${error.message}`);
  console.log(`[partner-admin] 스케줄러 틱 (오늘 ${data?.today}) — LIVE ${data?.went_live ?? 0}건 ${JSON.stringify(data?.went_live_codes ?? [])} · CLEARING ${data?.ended ?? 0}건 ${JSON.stringify(data?.ended_codes ?? [])}`);
}

async function cmdTickCampaign() {
  const ref = positional[0];
  if (!ref) usage();
  const q = UUID_RE.test(ref) ? admin.from("campaigns").select("id, code, status").eq("id", ref) : admin.from("campaigns").select("id, code, status").eq("code", ref);
  const { data: c, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error(`캠페인을 찾을 수 없습니다: ${ref}`);
  const { data, error: e2 } = await admin.rpc("app_campaign_tick_one", { p_campaign_id: c.id });
  if (e2) throw new Error(`app_campaign_tick_one failed: ${e2.message}`);
  if (!data?.ok) throw new Error(`틱 실패: ${data?.code ?? "BAD_RESULT"}`);
  console.log(`[partner-admin] ${data.campaign_code}: ${data.from} → ${data.to}${data.from === data.to ? " (변화 없음)" : ""} · 오늘 ${data.today}`);
}

async function cmdOrders() {
  const limit = Math.min(Number(flags.limit) || 50, 2000);
  const filter = flags.unshipped ? "unshipped" : flags.shipped ? "shipped" : flags.refunded ? "refunded" : "all";
  let campaignId = null;
  let brandId = null;
  if (flags.campaign) {
    const ref = String(flags.campaign);
    const q = UUID_RE.test(ref) ? admin.from("campaigns").select("id, brand_id").eq("id", ref) : admin.from("campaigns").select("id, brand_id").eq("code", ref);
    const { data: c, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error(`캠페인을 찾을 수 없습니다: ${ref}`);
    campaignId = c.id;
    brandId = c.brand_id;
  }
  if (flags.brand) brandId = (await findBrand(String(flags.brand))).id;
  if (!brandId) {
    console.error("[partner-admin] --campaign 또는 --brand 가 필요합니다.");
    process.exit(2);
  }
  const { data, error } = await admin.rpc("app_brand_orders", { p_brand_id: brandId, p_filter: filter, p_campaign_id: campaignId ?? undefined, p_limit: limit });
  if (error) throw new Error(`app_brand_orders failed: ${error.message}`);
  if (!data?.ok) throw new Error(`주문 조회 실패: ${data?.code ?? "BAD_RESULT"}`);
  const t = data.totals ?? {};
  console.log(`[partner-admin] 주문 ${t.count ?? 0}건 — 미발송 ${t.unshipped ?? 0} · 발송 ${t.shipped ?? 0} · 환불 ${t.refunded ?? 0} · 결제 ₩${t.paid_amount ?? 0} · 환불 ₩${t.refund_amount ?? 0} (필터 ${filter} · 표시 ${(data.rows ?? []).length})`);
  console.table(
    (data.rows ?? []).map((o) => ({
      code: o.code,
      캠페인: o.campaign?.code ?? "",
      상품: o.campaign?.product?.name ?? "",
      인플루언서: o.campaign?.seller?.handle ?? "",
      구매자: o.buyer_name,
      수량: o.qty,
      금액: o.amount,
      상태: o.status,
      운송장: o.tracking_no ? `${o.courier ?? ""} ${o.tracking_no}` : "",
      주문일: fmtDate(o.paid_at),
      환불: o.refunded_at ? `${o.refund_actor ?? ""} ₩${o.refund_amount ?? o.amount}` : "",
    })),
  );
}

async function cmdCs() {
  const limit = Math.min(Number(flags.limit) || 50, 500);
  let q = admin
    .from("cs_conversations")
    .select("id, code, status, type, buyer_name, order_code, order_id, last_preview, last_message_at, replied_at, created_at, brands(code, name), campaigns(code)")
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (flags.open) q = q.eq("status", "OPEN");
  if (flags.brand) q = q.eq("brand_id", (await findBrand(String(flags.brand))).id);
  const { data, error } = await q;
  if (error) throw new Error(`cs_conversations read failed: ${error.message}`);
  console.table(
    (data ?? []).map((x) => ({
      code: x.code,
      상태: x.status,
      유형: x.type,
      브랜드: x.brands ? `${x.brands.code ?? ""} ${x.brands.name}`.trim() : "",
      캠페인: x.campaigns?.code ?? "",
      고객: x.buyer_name,
      주문번호: x.order_code ? `${x.order_code}${x.order_id ? "" : " (미해석)"}` : "",
      "최근 메시지": (x.last_preview ?? "").replace(/[\r\n]+/g, " ").slice(0, 40),
      시각: fmtDate(x.last_message_at),
      답변: x.replied_at ? fmtDate(x.replied_at) : "",
    })),
  );
}

/* ------------------------------------------------------------ 관리자 콘솔 "정산 · 돈" PR-A (0020) ------------------------------------------------------------ */

const won = (v) => (v === null || v === undefined ? "" : `₩${Number(v).toLocaleString("ko-KR")}`);
const adminActor = () => process.env.ADMIN_ACTOR || process.env.USERNAME || process.env.USER || "partner-admin.mjs";

async function campaignIdOf(ref) {
  if (!ref) usage();
  const q = UUID_RE.test(ref) ? admin.from("campaigns").select("id, code, status").eq("id", ref) : admin.from("campaigns").select("id, code, status").eq("code", ref);
  const { data: c, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error(`캠페인을 찾을 수 없습니다: ${ref}`);
  return c;
}

function holdText(h) {
  return h ? `${h.code} (${h.label})` : "";
}

function printPreview(k) {
  console.log(`[partner-admin] ${k.campaign_code} · ${k.campaign_status} · ${k.source} · ${k.title ?? ""}`);
  if (k.source === "none") {
    console.log("  스냅샷 없는 SETTLED (이관 데이터) — 금액 없음");
    return;
  }
  console.table([
    { 항목: "확정 매출 net", 값: won(k.net), 비고: `gross ${won(k.gross)} − refunds ${won(k.refunds)} · 샘플분 ${won(k.sample_net)} · 결제 ${k.paid_count} / 환불 ${k.refund_count}` },
    { 항목: "PG", 값: won(k.pg_fee), 비고: `${k.pg_rate}` },
    { 항목: "인플루언서 기본 sf", 값: won(k.seller_fee), 비고: `${k.seller_rate} · ${k.seller_grade ?? ""} +${k.seller_bonus_pp}%p` },
    { 항목: "등급 보너스", 값: won(k.seller_bonus), 비고: "플랫폼 부담" },
    { 항목: "추천 부스트 / 추천인 보상", 값: `${won(k.ref_boost)} / ${won(k.ref_reward)}`, 비고: k.ref_boost_applied ? "적용" : "미적용" },
    { 항목: "브랜드 추천 할인 / 보상", 값: `${won(k.brand_ref_boost)} / ${won(k.brand_ref_reward)}`, 비고: k.brand_ref_applied ? "적용" : "미적용" },
    { 항목: "브랜드 등급 할인", 값: won(k.brand_discount), 비고: `${k.brand_grade ?? ""} ${k.brand_discount_rate}` },
    { 항목: "플랫폼 10% / costs / pf", 값: `${won(k.platform_fee_gross)} / ${won(k.costs)} / ${won(k.platform_fee)}`, 비고: `vat ${won(k.vat)} · 순수익 ${won(k.platform_net)}` },
    { 항목: "인플루언서 세전 / 원천징수 / 실수령", 값: `${won(k.seller_fee_total)} / ${won(k.seller_wht)} / ${won(k.seller_payout)}`, 비고: `wht ${k.wht_rate} · 샘플 환급 🥬${k.sample_refund_cel} + ${won(k.sample_refund_cash)}` },
    { 항목: "브랜드 정산액", 값: won(k.brand_payout), 비고: `🥬 보전 ${won(k.sample_cel_cover)}` },
    { 항목: "보류 예고", 값: [k.hold_seller ? `인플 ${holdText(k.holds?.seller)}` : "", k.hold_brand ? `브랜드 ${holdText(k.holds?.brand)}` : ""].filter(Boolean).join(" · ") || "없음", 비고: "" },
    { 항목: "기준일 · 실행 가능", 값: `${k.due_on ?? "-"} · ${k.eligible ? "가능" : `불가 (${k.reason ?? ""})`}`, 비고: k.settlement ? `정산 ${k.settlement.status} · ${fmtDate(k.settlement.settled_at)}` : "" },
  ]);
  if (k.payouts?.seller || k.payouts?.brand) {
    console.table(
      [k.payouts.seller, k.payouts.brand].filter(Boolean).map((p) => ({
        id: p.id,
        대상: p.payee_type,
        상태: p.status,
        금액: won(p.amount),
        원천징수: won(p.wht),
        보류: p.hold_code ? `${p.hold_code} · ${p.hold_reason ?? ""}` : "",
        계좌: p.bank_snapshot ? `${p.bank_snapshot.bank ?? ""} ${p.bank_snapshot.account_masked ?? ""} ${p.bank_snapshot.holder ?? ""}` : "",
        지급일: fmtDate(p.paid_at),
      })),
    );
  }
}

async function cmdSettlePreview() {
  const c = await campaignIdOf(positional[0]);
  const { data, error } = await admin.rpc("app_admin_settle_preview", { p_campaign_id: c.id });
  if (error) throw new Error(`app_admin_settle_preview failed: ${error.message}`);
  if (!data?.ok) throw new Error(`미리보기 실패: ${data?.code ?? "BAD_RESULT"}${data?.status ? ` (${data.status})` : ""}`);
  printPreview(data);
}

function printRun(r) {
  if (!r.ok) {
    console.error(`[partner-admin] 정산 실행 거부: ${r.code}${r.status ? ` (${r.status})` : ""}${r.due_on ? ` (기준일 ${r.due_on} · 오늘 ${r.today})` : ""}`);
    return false;
  }
  if (r.already) {
    console.log(`[partner-admin] ${r.campaign_code}: 이미 정산 완료 (settlement ${r.settlement_id ?? "없음"})`);
    return true;
  }
  const holds = [r.holds?.seller ? `인플 보류 ${holdText(r.holds.seller)}` : "", r.holds?.brand ? `브랜드 보류 ${holdText(r.holds.brand)}` : ""].filter(Boolean).join(" · ");
  console.log(
    `[partner-admin] ${r.campaign_code}: 정산 완료 — 확정 ${won(r.net)} → 브랜드 ${won(r.brand_payout)} · 인플루언서 ${won(r.seller_payout)} (세전 ${won(r.seller_fee_total)} − 원천징수 ${won(r.seller_wht)})` +
      ` · 플랫폼 ${won(r.platform_fee)}${holds ? ` · ${holds}` : ""}${r.forced ? " · 기준일 전 강제" : ""}`,
  );
  console.log(
    `  🥬 획득 인플 ${r.celery?.seller_earned ?? 0} / 브랜드 ${r.celery?.brand_earned ?? 0} · 샘플 환급 🥬${r.celery?.sample_refund_cel ?? 0} + ${won(r.celery?.sample_refund_cash ?? 0)}` +
      ` · 추천 보상 ${won(r.referral?.seller_reward ?? 0)} / 브랜드 ${won(r.referral?.brand_reward ?? 0)}` +
      ` · 등급 인플 ${r.grades?.seller?.previous_grade ?? "-"}→${r.grades?.seller?.grade ?? "-"} (m3 ${won(r.grades?.seller?.m3_sales)}) · 브랜드 ${r.grades?.brand?.previous ?? "-"}→${r.grades?.brand?.grade ?? "-"}`,
  );
  console.log(`  payouts: seller ${r.payouts?.seller?.id} (${r.payouts?.seller?.status}) · brand ${r.payouts?.brand?.id} (${r.payouts?.brand?.status}) · settlement ${r.settlement_id}`);
  return true;
}

async function cmdSettleRun() {
  const c = await campaignIdOf(positional[0]);
  // 기준일 전 강제 실행은 **스크립트에서만** 가능하고 사유가 필수다(0047 · 관리자 화면에서는 제거).
  //   실제 업무는 지급 리허설(docs/launch-checklist.md §8-13). 사유는 settlements.memo 에 남는다.
  const force = !!flags.force;
  const reason = typeof flags.reason === "string" ? flags.reason.trim() : "";
  if (force && !reason) {
    console.error('[partner-admin] --force 에는 --reason "사유" 가 필요합니다 (정산 명세에 남습니다 — 예: 지급 리허설)');
    process.exit(1);
  }
  const { data, error } = await admin.rpc("app_admin_settle_run_v2", {
    p_campaign_id: c.id,
    p_force: force,
    ...(force ? { p_force_reason: reason } : {}),
  });
  if (error) throw new Error(`app_admin_settle_run_v2 failed: ${error.message}`);
  if (!printRun(data)) process.exit(1);
  if (data?.ok && !data.already) await notifySlack(`[셀러리] 정산 실행 · ${data.campaign_code} · 브랜드 ${won(data.brand_payout)} · 인플루언서 ${won(data.seller_payout)}${data.holds?.seller || data.holds?.brand ? " · 지급 보류 있음" : ""}`);
}

async function cmdSettleDue() {
  const { data, error } = await admin.rpc("app_admin_settle_run_due", {});
  if (error) throw new Error(`app_admin_settle_run_due failed: ${error.message}`);
  console.log(`[partner-admin] 정산 실행(도래분) 오늘 ${data?.today} — 대상 ${data?.count ?? 0}건 · 완료 ${data?.settled ?? 0} · 실패 ${data?.failed ?? 0}`);
  for (const r of data?.results ?? []) printRun(r);
  if ((data?.settled ?? 0) > 0) await notifySlack(`[셀러리] 정산 실행(도래분) ${data.settled}건 완료 (${data.today})`);
}

async function cmdSettlements() {
  const limit = Math.min(Number(flags.limit) || 50, 1000);
  const { data, error } = await admin.rpc("app_admin_settlements", { p_status: flags.status ? String(flags.status) : undefined, p_limit: limit });
  if (error) throw new Error(`app_admin_settlements failed: ${error.message}`);
  if (!data?.ok) throw new Error(`조회 실패: ${data?.code ?? "BAD_RESULT"}`);
  const c = data.counts ?? {};
  console.log(`[partner-admin] 오늘 ${data.today} — 기준일 도래 ${c.due_now} / CLEARING ${c.clearing} · 정산 pending ${c.pending} · held ${c.held} · paid ${c.paid} · 지급 대기 ${c.payouts_pending}건 ${won(c.payouts_pending_amount)} · 보류 ${c.payouts_held}`);
  console.log("대기 큐 (CLEARING):");
  console.table(
    (data.queue ?? []).map((q) => ({
      code: q.campaign_code,
      제목: q.title,
      인플루언서: `${q.seller?.code ?? ""} ${q.seller?.grade ?? ""}`,
      브랜드: q.brand?.code ?? "",
      종료: q.end_date,
      기준일: q.due_on,
      실행: q.eligible ? "가능" : (q.reason ?? ""),
      확정: won(q.net),
      브랜드정산: won(q.brand_payout),
      인플실수령: won(q.seller_payout),
      보류예고: [q.hold_seller ? "인플" : "", q.hold_brand ? "브랜드" : ""].filter(Boolean).join("·"),
    })),
  );
  console.log("정산 완료 (스냅샷):");
  console.table(
    (data.rows ?? []).map((r) => ({
      code: r.campaign_code,
      정산일: fmtDate(r.settlement?.settled_at),
      상태: r.settlement?.status,
      확정: won(r.net),
      브랜드: `${won(r.brand_payout)} ${r.payouts?.brand?.status ?? ""}`,
      인플루언서: `${won(r.seller_payout)} ${r.payouts?.seller?.status ?? ""}`,
      플랫폼: won(r.platform_fee),
      보류: [r.hold_seller ? "인플" : "", r.hold_brand ? "브랜드" : ""].filter(Boolean).join("·"),
      지급일: fmtDate(r.settlement?.paid_at),
    })),
  );
}

async function cmdPayouts() {
  const status = flags.status ? String(flags.status) : "pending";
  let q = admin
    .from("payouts")
    .select("id, settlement_id, payee_type, status, amount, wht, hold_code, hold_reason, bank_snapshot, paid_at, memo, created_at, settlements(campaign_id, title, due_on, settled_at, campaigns(code))")
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(flags.limit) || 100, 1000));
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`payouts read failed: ${error.message}`);
  console.table(
    (data ?? []).map((p) => ({
      id: p.id,
      캠페인: p.settlements?.campaigns?.code ?? "",
      제목: p.settlements?.title ?? "",
      대상: p.payee_type,
      상태: p.status,
      금액: won(p.amount),
      원천징수: won(p.wht),
      보류: p.hold_code ? `${p.hold_code}` : "",
      계좌: p.bank_snapshot ? `${p.bank_snapshot.bank ?? ""} ${p.bank_snapshot.account_masked ?? ""}` : "",
      기준일: p.settlements?.due_on ?? "",
      정산일: fmtDate(p.settlements?.settled_at),
      지급일: fmtDate(p.paid_at),
    })),
  );
}

async function cmdPayoutsExport() {
  const status = flags.status ? String(flags.status) : "pending";
  const purpose = flags.purpose && flags.purpose !== true ? String(flags.purpose) : "";
  if (!purpose) {
    console.error("[partner-admin] --purpose \"지급 배치 2026-10\" 가 필요합니다 (열람 로그에 남습니다).");
    process.exit(2);
  }
  const { data, error } = await admin.rpc("app_admin_payout_export", { p_status: status, p_actor: adminActor(), p_purpose: purpose });
  if (error) throw new Error(`app_admin_payout_export failed: ${error.message}`);
  if (!data?.ok) throw new Error(`이체 파일 실패: ${data?.code ?? "BAD_RESULT"}`);
  const header = ["지급ID", "정산ID", "캠페인", "제목", "대상", "코드", "이름", "정산유형", "은행", "계좌번호", "예금주", "사업자번호", "지급액", "원천징수", "상태", "보류사유", "기준일", "정산일", "지급일", "메모"];
  const cell = (v) => (v === null || v === undefined ? "" : /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = (data.rows ?? []).map((r) => [
    r.payout_id, r.settlement_id, r.campaign_code, r.title, r.payee_type === "seller" ? "인플루언서" : "브랜드", r.payee_code, r.payee_name,
    r.settle_type === "biz" ? "사업자" : r.settle_type === "personal" ? "개인" : "", r.bank, r.account ? `="${r.account}"` : "", r.holder, r.biz_no,
    r.amount, r.wht, r.status, r.hold_code ?? "", r.due_on, fmtDate(r.settled_at), fmtDate(r.paid_at), r.memo,
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const out = flags.out && flags.out !== true ? String(flags.out) : `payouts-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, csv, { encoding: "utf8" });
  console.log(`[partner-admin] 이체 파일 ${out} — ${data.count}건 · 열람 로그 ${data.logged}행 (actor ${adminActor()} · ${purpose}). 계좌 원문이 들어 있으니 전송 후 파일을 지우세요.`);
}

async function cmdPayoutPaid() {
  const id = positional[0];
  if (!id || !UUID_RE.test(id)) usage();
  const { data, error } = await admin.rpc("app_admin_payout_mark_paid", { p_payout_id: id, p_memo: positional[1] ?? undefined });
  if (error) throw new Error(`app_admin_payout_mark_paid failed: ${error.message}`);
  if (!data?.ok) throw new Error(`지급 완료 실패: ${data?.code ?? "BAD_RESULT"}${data?.hold_code ? ` (${data.hold_code})` : ""}`);
  console.log(`[partner-admin] payout ${id}: ${data.already ? "이미 지급 완료" : `지급 완료 · ${won(data.payout?.amount)}`} · 정산 상태 ${data.settlement_status}`);
}

async function cmdPayoutHold(release) {
  const id = positional[0];
  if (!id || !UUID_RE.test(id)) usage();
  const { data, error } = release
    ? await admin.rpc("app_admin_payout_release", { p_payout_id: id })
    : await admin.rpc("app_admin_payout_hold", { p_payout_id: id, p_reason: positional[1] ?? undefined });
  if (error) throw new Error(`${release ? "app_admin_payout_release" : "app_admin_payout_hold"} failed: ${error.message}`);
  if (!data?.ok) throw new Error(`${release ? "해제" : "보류"} 실패: ${data?.code ?? "BAD_RESULT"}${data?.hold_code ? ` (${data.hold_code} · ${data.label ?? ""})` : ""}`);
  console.log(`[partner-admin] payout ${id}: ${data.already ? "변화 없음" : release ? "보류 해제 → pending" : `보류 → held (${data.payout?.hold_reason ?? ""})`} · 정산 상태 ${data.settlement_status}`);
}

async function cmdPaymentsHealth() {
  const { data, error } = await admin.rpc("app_admin_payments_health");
  if (error) throw new Error(`app_admin_payments_health failed: ${error.message}`);
  const flat = [];
  for (const [group, vals] of Object.entries(data ?? {})) {
    if (vals && typeof vals === "object") for (const [k, v] of Object.entries(vals)) flat.push({ 구분: group, 항목: k, 값: v ?? "" });
  }
  console.table(flat);
}

async function cmdAdminOrders() {
  const { data, error } = await admin.rpc("app_admin_orders", {
    p_filter: flags.filter ? String(flags.filter) : "all",
    p_q: flags.q && flags.q !== true ? String(flags.q) : undefined,
    p_limit: Math.min(Number(flags.limit) || 50, 2000),
  });
  if (error) throw new Error(`app_admin_orders failed: ${error.message}`);
  if (!data?.ok) throw new Error(`주문 조회 실패: ${data?.code ?? "BAD_RESULT"}`);
  const t = data.totals ?? {};
  console.log(`[partner-admin] 전체 주문 ${t.count}건 — 결제 ${t.paid} · 미발송 ${t.unshipped} · 발송 ${t.shipped} · 환불·취소 ${t.refunded} · 샘플 ${t.sample} · 결제키 없음 ${t.manual} · 부분취소 ${t.partial} · 결제 ${won(t.paid_amount)} · 환불 ${won(t.refund_amount)} (필터 ${data.filter} · 표시 ${(data.rows ?? []).length})`);
  console.table(
    (data.rows ?? []).map((o) => ({
      code: o.code,
      브랜드: o.brand?.code ?? "",
      캠페인: o.campaign?.code ?? "",
      상품: o.campaign?.product?.name ?? "",
      인플루언서: o.campaign?.seller?.handle ?? "",
      구매자: o.buyer_name,
      금액: won(o.amount),
      상태: o.status,
      결제키: o.has_payment_key ? "있음" : "없음",
      샘플: o.is_sample ? "샘플" : "",
      운송장: o.tracking_no ? `${o.courier ?? ""} ${o.tracking_no}` : "",
      주문일: fmtDate(o.paid_at),
      환불: o.refunded_at ? `${o.refund_actor ?? ""} ${won(o.refund_amount ?? o.amount)}` : o.refund_amount ? `부분 ${won(o.refund_amount)}` : "",
    })),
  );
}


/* ---------------- 토스 지급대행 (0040) — @sellery/payments jwe.ts · payout-rules.ts · toss-payouts.server.ts 를 스크립트용으로 인라인 ---------------- */

const PAYOUT_BASE = "https://api.tosspayments.com";
const TOSS_BANK_CODES = { 국민: "004", 신한: "088", 우리: "020", 하나: "081", 농협: "011", 카카오뱅크: "090", 토스뱅크: "092", 기업: "003", SC제일: "023" };
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));

function payoutKeys() {
  const secretKey = process.env.TOSS_PAYOUT_SECRET_KEY;
  const securityKey = process.env.TOSS_PAYOUT_SECURITY_KEY;
  if (!secretKey || !securityKey) {
    console.error("[partner-admin] TOSS_PAYOUT_SECRET_KEY / TOSS_PAYOUT_SECURITY_KEY 가 없습니다 — 루트 .env.local 을 확인하세요.");
    process.exit(1);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(securityKey)) {
    console.error("[partner-admin] TOSS_PAYOUT_SECURITY_KEY 는 64자 16진수여야 합니다.");
    process.exit(1);
  }
  return { secretKey, securityKey };
}

function tossIat() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}T${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:${p(kst.getUTCSeconds())}+09:00`;
}

async function jweKey(hex) {
  return crypto.subtle.importKey("raw", Buffer.from(hex, "hex"), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function jweEncrypt(plain, hex) {
  const header = b64u(Buffer.from(JSON.stringify({ alg: "dir", enc: "A256GCM", iat: tossIat(), nonce: crypto.randomUUID() })));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: Buffer.from(header), tagLength: 128 }, await jweKey(hex), Buffer.from(plain)));
  return `${header}..${b64u(iv)}.${b64u(sealed.slice(0, -16))}.${b64u(sealed.slice(-16))}`;
}

async function jweDecrypt(compact, hex) {
  const [header, , iv, ct, tag] = compact.trim().split(".");
  const sealed = Buffer.concat([unb64u(ct), unb64u(tag)]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv), additionalData: Buffer.from(header), tagLength: 128 }, await jweKey(hex), sealed);
  return Buffer.from(plain).toString("utf8");
}

/** v2 봉투 { entityBody, error } 를 푼 { ok, status, body } — 암호화 엔드포인트는 encrypt:true */
async function tossPayoutApi(path, { method = "GET", body, encrypt = false, headers = {} } = {}) {
  const { secretKey, securityKey } = payoutKeys();
  const h = { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`, "Content-Type": "application/json", ...headers };
  let payload;
  if (body !== undefined) {
    payload = encrypt ? await jweEncrypt(JSON.stringify(body), securityKey) : JSON.stringify(body);
    if (encrypt) {
      h["TossPayments-api-security-mode"] = "ENCRYPTION";
      h["Content-Type"] = "text/plain";
    }
  }
  const res = await fetch(`${PAYOUT_BASE}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  if (text.trim()) {
    const parts = text.trim().split(".");
    json = JSON.parse(parts.length === 5 && !text.trim().startsWith("{") ? await jweDecrypt(text, securityKey) : text);
  }
  const envelope = json && typeof json === "object" && "entityBody" in json ? json : null;
  const err = envelope?.error ?? (json && typeof json?.code === "string" ? json : null);
  if (!res.ok || err) return { ok: false, status: res.status, body: err ?? { code: `HTTP_${res.status}`, message: text.slice(0, 200) } };
  return { ok: true, status: res.status, body: envelope ? envelope.entityBody : json };
}

const digitsOf = (v) => String(v ?? "").replace(/\D/g, "");
const tossRefId = (prefix, uuid) => `${prefix}${String(uuid).replace(/-/g, "").slice(0, 18)}`;
function businessTypeOfBizNo(bizNo) {
  const d = digitsOf(bizNo);
  if (!/^\d{10}$/.test(d)) return null;
  const mid = Number(d.slice(3, 5));
  return mid >= 80 && mid <= 89 ? "CORPORATE" : "INDIVIDUAL_BUSINESS";
}

async function cmdPayoutMode() {
  const want = positional[0];
  if (!want) {
    const { data, error } = await admin.rpc("payout_mode");
    if (error) throw new Error(`payout_mode failed: ${error.message}`);
    console.log(`payout_mode = ${data}`);
    return;
  }
  if (want !== "manual" && want !== "toss") usage();
  const { data, error } = await admin.rpc("app_payout_mode_set", { p_mode: want });
  if (error) throw new Error(`app_payout_mode_set failed: ${error.message}`);
  console.log(JSON.stringify(data));
}

/* 공유 잔액 가드(2026-10-08) — packages/payments/src/payout-rules.ts checkPayoutGuard 와 같은 규칙을 스크립트용으로 인라인. 숫자의 정답은 그 파일. */
const PAYOUT_DAILY_CAP_DEFAULT = 5_000_000;
const PAYOUT_DAILY_CAP_KEY = "payout_daily_cap";
const normalizeDailyCap = (v) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : PAYOUT_DAILY_CAP_DEFAULT;
};
const countsTowardDailyCap = (st) => st === "REQUESTED" || st === "IN_PROGRESS" || st === "COMPLETED";
const kstDayStartIso = (now = new Date()) => new Date(`${new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString();
const sumAmounts = (rows) => rows.reduce((a, r) => a + (Number.isFinite(Number(r.amount)) ? Math.round(Number(r.amount)) : 0), 0);

async function readDailyCap() {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", PAYOUT_DAILY_CAP_KEY).maybeSingle();
  if (error) throw new Error(`platform_settings read failed: ${error.message}`);
  return normalizeDailyCap(data?.value);
}

async function cmdPayoutCap() {
  const want = positional[0];
  if (!want) {
    console.log(`payout_daily_cap = ${won(await readDailyCap())} (하루 KST 토스 지급 요청 상한 · 없으면 기본 ${won(PAYOUT_DAILY_CAP_DEFAULT)})`);
    return;
  }
  const n = Number(String(want).replace(/[,_₩\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n !== Math.round(n)) usage();
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key: PAYOUT_DAILY_CAP_KEY, value: n, description: "하루(KST) 토스 지급 요청 상한(원) — 지급대행 상점 잔액이 다른 서비스와 공유되므로 셀러리 쪽 버그가 남의 돈을 쓰지 못하게. partner-admin.mjs payout-cap · 앱 requestDuePayouts 가드" }, { onConflict: "key" });
  if (error) throw new Error(`platform_settings upsert failed: ${error.message}`);
  await admin.from("payout_events").insert({ source: "mode", event_type: "daily_cap", payload: { daily_cap: n, actor: adminActor() }, handled: true, result: `payout_daily_cap=${n}` });
  console.log(`payout_daily_cap = ${won(n)}`);
}

/** 가드 값 — { queueTotal, inFlightTotal, requestedToday, dailyCap, available } (앱 payoutGuardSnapshot 과 같은 정의) */
async function payoutGuardSnapshot(rows) {
  const dayStart = kstDayStartIso();
  const dailyCap = await readDailyCap();
  const { data: today, error } = await admin.from("payouts").select("amount, toss_payout_status").gte("toss_requested_at", dayStart);
  if (error) throw new Error(`payouts read failed: ${error.message}`);
  const bal = await tossPayoutApi("/v2/balances");
  return {
    queueTotal: sumAmounts(rows.filter((r) => r.requestable)),
    inFlightTotal: sumAmounts(rows.filter((r) => r.toss_payout_status === "REQUESTED" || r.toss_payout_status === "IN_PROGRESS")),
    requestedToday: sumAmounts((today ?? []).filter((r) => countsTowardDailyCap(r.toss_payout_status))),
    dailyCap,
    available: bal.ok ? (bal.body.availableAmount?.value ?? null) : null,
    balanceError: bal.ok ? null : `${bal.body.code} ${bal.body.message}`,
  };
}

function checkPayoutGuard({ batchTotal, queueTotal, available, requestedToday, dailyCap }) {
  const cap = normalizeDailyCap(dailyCap);
  const remaining = Math.max(0, cap - requestedToday);
  if (batchTotal > queueTotal) return { ok: false, code: "QUEUE_EXCEEDED", message: `요청 합계 ${won(batchTotal)} 가 셀러리 지급 대기 합계 ${won(queueTotal)} 를 넘습니다` };
  if (available === null || available === undefined || !Number.isFinite(available)) return { ok: false, code: "BALANCE_UNKNOWN", message: "토스 잔액을 읽지 못했습니다 — 공유 잔액이라 확인 없이는 요청하지 않습니다" };
  if (batchTotal > available) return { ok: false, code: "BALANCE_EXCEEDED", message: `요청 합계 ${won(batchTotal)} 가 토스 지급 가능 잔액 ${won(available)} 을 넘습니다(잔액은 다른 서비스와 공유)` };
  if (requestedToday + batchTotal > cap) return { ok: false, code: "DAILY_CAP_EXCEEDED", message: `오늘 요청 ${won(requestedToday)} + 이번 ${won(batchTotal)} 가 하루 상한 ${won(cap)} 을 넘습니다 — 남은 한도 ${won(remaining)} (payout-cap <원> 으로 변경)` };
  return { ok: true, remaining: remaining - batchTotal };
}

async function cmdTossBalance() {
  const r = await tossPayoutApi("/v2/balances");
  if (!r.ok) throw new Error(`balance failed: ${r.body.code} ${r.body.message}`);
  console.log(`지급 가능 ${won(r.body.availableAmount?.value ?? 0)} · 정산 대기 ${won(r.body.pendingAmount?.value ?? 0)}`);
  const { data } = await admin.rpc("app_admin_payouts_toss_queue");
  const g = await payoutGuardSnapshot(data?.rows ?? []);
  console.log(`셀러리 지급 대기 ${won(g.queueTotal)} · 진행 중 ${won(g.inFlightTotal)} · 오늘 요청 ${won(g.requestedToday)} / 상한 ${won(g.dailyCap)} (공유 잔액 — 셀러리 몫만 요청)`);
}

async function cmdTossQueue() {
  const { data, error } = await admin.rpc("app_admin_payouts_toss_queue");
  if (error) throw new Error(`app_admin_payouts_toss_queue failed: ${error.message}`);
  console.log(`payout_mode = ${data?.mode}`);
  console.table(
    (data?.rows ?? []).map((r) => ({
      payout_id: r.payout_id,
      캠페인: r.campaign_code,
      대상: `${r.payee_type} ${r.payee_code ?? ""} ${r.payee_name ?? ""}`,
      금액: won(r.amount),
      상태: r.status,
      보류: r.hold_code ?? "",
      셀러: r.toss_seller_status ?? (r.toss_seller_id ? "?" : "없음"),
      지급: r.toss_payout_status ?? "",
      토스id: r.toss_payout_id ?? "",
      예정일: r.toss_schedule_date ?? "",
      요청가능: r.requestable ? "Y" : r.reason ?? "",
      오류: r.toss_error?.message ?? r.toss_seller_error?.message ?? "",
    })),
  );
}

async function loadPayee() {
  const isBrand = flags.brand === true;
  if (isBrand) {
    const b = await findBrand(positional[0]);
    const { data, error } = await admin.from("brands").select("id, code, name, email, manager_name, manager_phone, bank_info, biz_no, tax_info, toss_seller_id, toss_seller_status").eq("id", b.id).single();
    if (error) throw new Error(`brands read failed: ${error.message}`);
    await admin.from("sensitive_access_log").insert({ brand_id: data.id, field: "bank_info", actor: process.env.ADMIN_ACTOR || "partner-admin.mjs", purpose: "토스 지급대행 셀러 등록" });
    return { type: "brand", row: data };
  }
  const s = await findSeller(positional[0]);
  const { data, error } = await admin.from("sellers").select("id, code, name, email, settle_type, bank_info, biz_no, tax_info, settle_phone, toss_seller_id, toss_seller_status").eq("id", s.id).single();
  if (error) throw new Error(`sellers read failed: ${error.message}`);
  await admin.from("sensitive_access_log").insert({ seller_id: data.id, field: "bank_info", actor: process.env.ADMIN_ACTOR || "partner-admin.mjs", purpose: "토스 지급대행 셀러 등록" });
  return { type: "seller", row: data };
}

function buildSellerBody(type, r) {
  const bank = r.bank_info ?? {};
  const bankCode = TOSS_BANK_CODES[String(bank.bank ?? "").replace(/\s+/g, "")];
  if (!bankCode) throw new Error(`은행 코드 없음: ${bank.bank ?? "(계좌 미등록)"}`);
  const accountNumber = digitsOf(bank.account);
  if (!/^\d{8,14}$/.test(accountNumber)) throw new Error("계좌번호 형식(숫자 8~14자리)");
  const email = String(r.email ?? r.tax_info?.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("이메일 없음");
  const phone = digitsOf(type === "brand" ? r.manager_phone : r.settle_phone);
  if (!/^\d{8,15}$/.test(phone)) throw new Error(type === "brand" ? "brands.manager_phone 없음" : "sellers.settle_phone 없음 — 인플루언서 /settle 에서 본인인증 번호 등록");
  const account = { bankCode, accountNumber, holderName: String(bank.holder ?? "").trim().slice(0, 50) };
  const refSellerId = tossRefId(type === "brand" ? "b" : "s", r.id);
  const metadata = { payee_type: type, payee_id: r.id };
  if (type === "seller" && r.settle_type !== "biz") return { refSellerId, businessType: "INDIVIDUAL", individual: { name: r.name, email, phone }, account, metadata };
  const businessType = businessTypeOfBizNo(r.biz_no);
  if (!businessType) throw new Error("사업자등록번호 형식");
  return {
    refSellerId,
    businessType,
    company: { name: r.tax_info?.company || r.name, representativeName: r.tax_info?.ceo || r.manager_name || account.holderName, businessRegistrationNumber: digitsOf(r.biz_no), email, phone },
    account,
    metadata,
  };
}

async function recordSellerSync(type, id, tossId, status, raw) {
  const { data, error } = await admin.rpc("app_partner_seller_sync", { p_payee_type: type, p_payee_id: id, p_toss_seller_id: tossId, p_status: status, p_raw: raw });
  if (error) throw new Error(`app_partner_seller_sync failed: ${error.message}`);
  return data;
}

async function cmdTossSellerSync() {
  const { type, row } = await loadPayee();
  let body;
  try {
    body = buildSellerBody(type, row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordSellerSync(type, row.id, null, null, { code: "PAYLOAD", message: msg });
    throw new Error(`본문 생성 실패 — ${msg}`);
  }
  let r = row.toss_seller_id ? await tossPayoutApi(`/v2/sellers/${encodeURIComponent(row.toss_seller_id)}`, { method: "POST", body, encrypt: true }) : await tossPayoutApi("/v2/sellers", { method: "POST", body, encrypt: true });
  if (!r.ok && row.toss_seller_id && r.status === 404) r = await tossPayoutApi("/v2/sellers", { method: "POST", body, encrypt: true });
  if (!r.ok) {
    await recordSellerSync(type, row.id, row.toss_seller_id, null, { code: r.body.code, message: r.body.message, http: r.status });
    throw new Error(`토스 거절 — ${r.body.code} ${r.body.message}`);
  }
  const { account: _a, company: _c, individual: _i, ...rest } = r.body;
  const out = await recordSellerSync(type, row.id, r.body.id, r.body.status, { eventType: "seller.synced", seller: rest });
  console.log(`${type} ${row.code} → 토스 셀러 ${r.body.id} · ${r.body.status} (이전 ${out?.previous ?? "-"})`);
}

async function cmdTossSellerDelete() {
  const { type, row } = await loadPayee();
  if (row.toss_seller_id) {
    const r = await tossPayoutApi(`/v2/sellers/${encodeURIComponent(row.toss_seller_id)}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`토스 삭제 실패 — ${r.body.code} ${r.body.message}`);
  }
  const { error } = await admin.from(type === "brand" ? "brands" : "sellers").update({ toss_seller_id: null, toss_seller_status: null, toss_seller_error: null, toss_seller_synced_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw new Error(`update failed: ${error.message}`);
  await admin.from("payout_events").insert({ source: "seller_sync", event_type: "seller.deleted", toss_seller_id: row.toss_seller_id, payload: { payee_type: type, payee_id: row.id }, handled: true, result: "deleted" });
  console.log(`${type} ${row.code} 토스 셀러 ${row.toss_seller_id ?? "(없음)"} 삭제 · 로컬 비움`);
}

async function syncPayoutStatus(tossPayoutId, status, raw) {
  const { data, error } = await admin.rpc("app_payout_sync_status", { p_toss_payout_id: tossPayoutId, p_status: status, p_raw: raw });
  if (error) throw new Error(`app_payout_sync_status failed: ${error.message}`);
  return data;
}

async function cmdTossPayoutRequest() {
  const { data, error } = await admin.rpc("app_admin_payouts_toss_queue");
  if (error) throw new Error(`app_admin_payouts_toss_queue failed: ${error.message}`);
  if (data?.mode !== "toss") throw new Error(`payout_mode 가 ${data?.mode} 입니다 — 'payout-mode toss' 먼저`);
  const scheduleType = flags.date ? "SCHEDULED" : "EXPRESS";
  const payoutDate = flags.date ? String(flags.date) : null;
  if (payoutDate && !/^\d{4}-\d{2}-\d{2}$/.test(payoutDate)) usage();
  const wanted = flags.id ? new Set([String(flags.id)]) : null;
  if (!wanted && flags.all !== true) usage();
  const rows = (data.rows ?? []).filter((r) => r.requestable && (!wanted || wanted.has(r.payout_id)));
  if (!rows.length) {
    console.log("요청 가능한 지급 건이 없습니다 (toss-queue 로 사유 확인)");
    return;
  }
  // 공유 잔액 가드(2026-10-08) — 한 건이라도 보내기 전에 배치 전체를 검사. 걸리면 payout_events 'request.refused' 만 남기고 종료.
  const g = await payoutGuardSnapshot(data.rows ?? []);
  const batchTotal = sumAmounts(rows);
  const guard = checkPayoutGuard({ batchTotal, queueTotal: g.queueTotal, available: g.available, requestedToday: g.requestedToday, dailyCap: g.dailyCap });
  console.log(`가드: 이번 ${won(batchTotal)} · 셀러리 지급 대기 ${won(g.queueTotal)} · 토스 잔액 ${g.available === null ? `? (${g.balanceError})` : won(g.available)} · 오늘 요청 ${won(g.requestedToday)} / 상한 ${won(g.dailyCap)}`);
  if (!guard.ok) {
    await admin.from("payout_events").insert({
      source: "request",
      event_type: "request.refused",
      payload: { code: guard.code, message: guard.message, batch_total: batchTotal, queue_total: g.queueTotal, available: g.available, requested_today: g.requestedToday, daily_cap: g.dailyCap, payout_ids: rows.map((r) => r.payout_id), actor: adminActor() },
      handled: true,
      result: `refused: ${guard.code}`,
    });
    throw new Error(`${guard.code} — ${guard.message}`);
  }
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const items = chunk.map((r) => ({
      refPayoutId: r.payout_id,
      destination: r.toss_seller_id,
      scheduleType,
      ...(payoutDate ? { payoutDate } : {}),
      amount: { currency: "KRW", value: Math.round(r.amount) },
      transactionDescription: "셀러리정산",
      metadata: { campaign: r.campaign_code, payee: `${r.payee_type}:${r.payee_code ?? ""}` },
    }));
    const keyText = `${scheduleType}|${payoutDate ?? ""}|${chunk.map((r) => r.payout_id).sort().join(",")}`;
    const idem = `slry-po-${Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(keyText))).toString("hex")}`;
    const r = await tossPayoutApi("/v2/payouts", { method: "POST", body: items, encrypt: true, headers: { "Idempotency-Key": idem } });
    if (!r.ok) {
      await admin.from("payout_events").insert({ source: "request", event_type: "request.failed", payload: { code: r.body.code, message: r.body.message, http: r.status, payout_ids: chunk.map((x) => x.payout_id), scheduleType, payoutDate, actor: process.env.ADMIN_ACTOR || "partner-admin.mjs" }, handled: true, result: `error: ${r.body.code}` });
      throw new Error(`토스 지급 요청 실패 — ${r.body.code} ${r.body.message}`);
    }
    const list = Array.isArray(r.body) ? r.body : (r.body?.data ?? []);
    for (const p of list) {
      const { data: mk, error: mkErr } = await admin.rpc("app_payout_mark_requested", { p_payout_id: p.refPayoutId, p_toss_payout_id: p.id, p_status: p.status, p_schedule_date: p.payoutDate ?? payoutDate ?? undefined, p_raw: { ...p, actor: process.env.ADMIN_ACTOR || "partner-admin.mjs" } });
      if (mkErr || !mk?.ok) console.error(`[partner-admin] 기록 실패 ${p.refPayoutId} → ${p.id}: ${mkErr?.message ?? mk?.code}`);
      else console.log(`${p.refPayoutId} → ${p.id} ${p.status} ${won(p.amount?.value)}`);
    }
  }
}

async function cmdTossPayoutRefresh() {
  const id = positional[0];
  if (!id || !UUID_RE.test(id)) usage();
  const { data, error } = await admin.from("payouts").select("toss_payout_id").eq("id", id).maybeSingle();
  if (error || !data?.toss_payout_id) throw new Error("토스에 요청된 지급 건이 아닙니다");
  const r = await tossPayoutApi(`/v2/payouts/${encodeURIComponent(data.toss_payout_id)}`);
  if (!r.ok) throw new Error(`재조회 실패 — ${r.body.code} ${r.body.message}`);
  console.log(JSON.stringify(await syncPayoutStatus(data.toss_payout_id, r.body.status, { eventType: "payout.refreshed", ...r.body })));
}

async function cmdTossPayoutCancel() {
  const id = positional[0];
  if (!id || !UUID_RE.test(id)) usage();
  const { data, error } = await admin.from("payouts").select("toss_payout_id, status").eq("id", id).maybeSingle();
  if (error || !data?.toss_payout_id) throw new Error("토스에 요청된 지급 건이 아닙니다");
  if (data.status === "paid") throw new Error("이미 지급 완료");
  const r = await tossPayoutApi(`/v2/payouts/${encodeURIComponent(data.toss_payout_id)}/cancel`, { method: "POST" });
  if (!r.ok) throw new Error(`취소 실패 — ${r.body.code} ${r.body.message}`);
  await admin.from("payout_events").insert({ source: "cancel", event_type: "cancel", payout_id: id, toss_payout_id: data.toss_payout_id, payload: { actor: process.env.ADMIN_ACTOR || "partner-admin.mjs" }, handled: true, result: r.body.status });
  console.log(JSON.stringify(await syncPayoutStatus(data.toss_payout_id, r.body.status, { eventType: "payout.canceled", ...r.body })));
}

try {
  switch (cmd) {
    case "payout-mode":
      await cmdPayoutMode();
      break;
    case "payout-cap":
      await cmdPayoutCap();
      break;
    case "toss-balance":
      await cmdTossBalance();
      break;
    case "toss-queue":
      await cmdTossQueue();
      break;
    case "toss-seller-sync":
      await cmdTossSellerSync();
      break;
    case "toss-seller-delete":
      await cmdTossSellerDelete();
      break;
    case "toss-payout-request":
      await cmdTossPayoutRequest();
      break;
    case "toss-payout-refresh":
      await cmdTossPayoutRefresh();
      break;
    case "toss-payout-cancel":
      await cmdTossPayoutCancel();
      break;
    case "list":
      await cmdList();
      break;
    case "settle-preview":
      await cmdSettlePreview();
      break;
    case "settle-run":
      await cmdSettleRun();
      break;
    case "settle-due":
      await cmdSettleDue();
      break;
    case "settlements":
      await cmdSettlements();
      break;
    case "payouts":
      await cmdPayouts();
      break;
    case "payouts-export":
      await cmdPayoutsExport();
      break;
    case "payout-paid":
      await cmdPayoutPaid();
      break;
    case "payout-hold":
      await cmdPayoutHold(false);
      break;
    case "payout-release":
      await cmdPayoutHold(true);
      break;
    case "payments-health":
      await cmdPaymentsHealth();
      break;
    case "admin-orders":
      await cmdAdminOrders();
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
    case "products":
      await cmdProducts();
      break;
    case "review-product":
      await cmdReviewProduct();
      break;
    case "campaign":
      await cmdCampaign();
      break;
    case "tick":
      await cmdTick();
      break;
    case "tick-campaign":
      await cmdTickCampaign();
      break;
    case "orders":
      await cmdOrders();
      break;
    case "cs":
      await cmdCs();
      break;
    default:
      usage();
  }
} catch (e) {
  console.error("[partner-admin]", e instanceof Error ? e.message : e);
  process.exit(1);
}
