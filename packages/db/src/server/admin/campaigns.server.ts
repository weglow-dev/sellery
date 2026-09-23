/**
 * 관리자 캠페인 상세 — 데모 캠페인 상세 화면(`go.camp(cid)`)의 실서비스 판.
 * 흐름 스테퍼 · 스레드(시스템 이벤트 + 당사자 대화) · 브랜드 대행 액션 · 정산 미리보기.
 *
 * **마이그레이션 없음.** 필요한 것이 다 있다:
 *   · 상태 전이 · 이벤트 문구 → 브랜드 RPC `app_brand_{approve_sample,reject_sample,ship_sample,confirm_schedule,
 *     reject_schedule}`. 전부 `p_brand_id` 를 **인자로 받고** service_role 에 grant 돼 있어 관리자가 그대로 부른다.
 *     캠페인의 `brand_id` 를 서버에서 찾아 넘기므로 규칙을 두 번 구현하지 않는다(0015 · 0016).
 *   · 관리자 발신 → `campaign_post_chat(p_campaign_id, p_role, p_actor_user_id, p_body)`(0016)에 `'admin'` 을 넘긴다.
 *     연락처 유출 감지(`campaign_leak_detected`)가 관리자 메시지에도 그대로 걸린다.
 *   · 정산 미리보기 → `app_admin_settle_preview`(0020).
 *
 * **데모와 다른 점 하나** — 데모는 "브랜드(관리자 대행)로 발신" 이라 인플루언서에게 브랜드가 말한 것처럼 보인다.
 * 여기서는 `sender='admin'` 으로 남겨 두 콘솔이 **"셀러리 운영팀"** 으로 표시한다(`senderLabel` — chat-rules.ts:127).
 * 브랜드가 쓰지 않은 말이 브랜드 이름으로 남으면 분쟁의 소지가 되고, `campaign_post_chat` 은 sender 와 actor_role 을
 * 같은 값으로 넣으므로 "브랜드로 표시 + 관리자로 감사" 를 애초에 만들 수 없다.
 *
 * 쓰기는 모두 **ref(code) → id 를 서버에서 먼저 해석**한 뒤 id 로 처리한다(파트너 관리 공통 규칙).
 */
import { createAdminClient, type Admin } from "../admin.server";
import { parseSettlePreview, type SettlePreview } from "../../admin/settle-rules";
import { normalizeRejectReason } from "../../admin/campaign-rules";
import { CHAT_MAX, parseChatInput } from "../../partner/chat-rules";

export type AdminCampaignEvent = {
  id: string;
  kind: "chat" | "system";
  /** 표시 역할 — `senderLabel()` 이 사람이 읽는 이름으로 바꾼다 */
  sender: "seller" | "brand" | "admin" | "system";
  /** 실제 발신 역할(감사) — 표시와 다를 수 있다 */
  actor_role: string | null;
  body: string;
  event_type: string | null;
  /** 연락처·외부 메신저 공유 감지(chat 만) */
  leak_flag: boolean;
  created_at: string;
};

export type AdminCampaignDetail = {
  id: string;
  code: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  qty: number | null;
  sold_qty: number | null;
  /** 인플루언서 수수료율 — 확정 시 잠긴 값(`campaigns.rate_locked`), 없으면 상품의 현재 값 */
  commission_rate: number | null;
  invited: boolean;
  auto: boolean;
  created_at: string | null;
  product: {
    id: string;
    code: string | null;
    name: string;
    sale_price: number | null;
    consumer_price: number | null;
    emoji: string | null;
    thumb_url: string | null;
    image_urls: string[];
  } | null;
  brand: { id: string; code: string | null; name: string; grade: string | null } | null;
  seller: { id: string; code: string | null; name: string; handle: string; platform: string | null; grade: string | null; followers: number | null } | null;
  events: AdminCampaignEvent[];
  /** 정산 미리보기 — 판매 전 상태에서는 RPC 가 `WRONG_STATUS` 라 null */
  preview: SettlePreview | null;
};

type Row = {
  id: string;
  code: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  qty: number | null;
  sold_qty: number | null;
  rate_locked: number | null;
  invited: boolean | null;
  auto_proposed: boolean | null;
  created_at: string | null;
  brand_id: string | null;
  products: {
    id: string;
    code: string | null;
    name: string;
    sale_price: number | null;
    consumer_price: number | null;
    commission_rate: number | null;
    emoji: string | null;
    thumb_url: string | null;
    image_urls: unknown;
  } | null;
  brands: { id: string; code: string | null; name: string; grade: string | null } | null;
  sellers: { id: string; code: string | null; name: string; handle: string; platform: string | null; grade: string | null; followers: number | null } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 코드(`c1`) 또는 UUID → 캠페인 행. 없으면 null */
async function campaignRow(admin: Admin, ref: string): Promise<Row | null> {
  const r = ref.trim();
  if (!r) return null;
  const sel = admin
    .from("campaigns")
    .select(
      "id, code, status, start_date, end_date, qty, sold_qty, rate_locked, invited, auto_proposed, created_at, brand_id, products(id, code, name, sale_price, consumer_price, commission_rate, emoji, thumb_url, image_urls), brands(id, code, name, grade), sellers(id, code, name, handle, platform, grade, followers)"
    );
  const { data, error } = await (UUID_RE.test(r) ? sel.eq("id", r) : sel.eq("code", r.toLowerCase())).maybeSingle();
  if (error) {
    console.error("[admin/campaigns] 조회 실패:", error.message);
    return null;
  }
  return (data as unknown as Row) ?? null;
}

/** 쓰기에서 쓰는 최소 조회 — 클라이언트가 보낸 ref 를 믿지 않고 brand_id 를 서버에서 찾는다 */
async function campaignTarget(admin: Admin, ref: string): Promise<{ id: string; brandId: string; status: string } | null> {
  const r = ref.trim();
  if (!r) return null;
  const sel = admin.from("campaigns").select("id, brand_id, status");
  const { data, error } = await (UUID_RE.test(r) ? sel.eq("id", r) : sel.eq("code", r.toLowerCase())).maybeSingle();
  if (error) {
    console.error("[admin/campaigns] 대상 조회 실패:", error.message);
    return null;
  }
  if (!data?.brand_id) return null;
  return { id: data.id as string, brandId: data.brand_id as string, status: data.status as string };
}

export async function getAdminCampaign(ref: string, admin: Admin = createAdminClient()): Promise<AdminCampaignDetail | null> {
  const c = await campaignRow(admin, ref);
  if (!c) return null;

  const [eventsRes, previewRes] = await Promise.all([
    admin
      .from("campaign_events")
      .select("id, kind, sender, actor_role, body, event_type, leak_flag, created_at")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: true }),
    admin.rpc("app_admin_settle_preview", { p_campaign_id: c.id }),
  ]);
  if (eventsRes.error) console.error("[admin/campaigns] 스레드 조회 실패:", eventsRes.error.message);

  const events: AdminCampaignEvent[] = (eventsRes.data ?? []).map((e) => ({
    id: e.id as string,
    kind: e.kind === "chat" ? "chat" : "system",
    sender: e.sender === "seller" || e.sender === "brand" || e.sender === "admin" ? e.sender : "system",
    actor_role: (e.actor_role as string) ?? null,
    body: e.body as string,
    event_type: (e.event_type as string) ?? null,
    leak_flag: e.leak_flag === true,
    created_at: e.created_at as string,
  }));

  const parsed = previewRes.error ? null : parseSettlePreview(previewRes.data);

  return {
    id: c.id,
    code: c.code,
    status: c.status,
    start_date: c.start_date,
    end_date: c.end_date,
    qty: c.qty,
    sold_qty: c.sold_qty,
    commission_rate: c.rate_locked ?? c.products?.commission_rate ?? null,
    invited: c.invited === true,
    auto: c.auto_proposed === true,
    created_at: c.created_at,
    product: c.products
      ? {
          id: c.products.id,
          code: c.products.code,
          name: c.products.name,
          sale_price: c.products.sale_price,
          consumer_price: c.products.consumer_price,
          emoji: c.products.emoji,
          thumb_url: c.products.thumb_url,
          image_urls: Array.isArray(c.products.image_urls) ? (c.products.image_urls as string[]) : [],
        }
      : null,
    brand: c.brands ? { id: c.brands.id, code: c.brands.code, name: c.brands.name, grade: c.brands.grade } : null,
    seller: c.sellers
      ? {
          id: c.sellers.id,
          code: c.sellers.code,
          name: c.sellers.name,
          handle: c.sellers.handle,
          platform: c.sellers.platform,
          grade: c.sellers.grade,
          followers: c.sellers.followers,
        }
      : null,
    events,
    // `source:'none'`(정산 완료인데 스냅샷 없음)은 숫자가 없으므로 null 로 둔다 — 0 을 보여주지 않는다
    preview: parsed && parsed.source !== "none" ? parsed : null,
  };
}

/* ------------------------------------------------------------ 쓰기 (브랜드 대행) ------------------------------------------------------------ */

/** 화면이 `?msg=` 로 바꿔 띄운다. `code` 는 브랜드 RPC 가 돌려주는 값 그대로 */
export type AdminCampaignActionResult = { ok: true; already: boolean; status: string } | { ok: false; code: string; status?: string | null };

function parseBrandRpc(data: unknown): AdminCampaignActionResult {
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) return { ok: true, already: o.already === true, status: typeof o.status === "string" ? o.status : "" };
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR", status: typeof o.status === "string" ? o.status : null };
}

/**
 * 브랜드 대행 기록 — 브랜드 RPC 가 남기는 이벤트는 `actor_role='brand'` 라서(0015/0016 에 박혀 있다)
 * 나중에 브랜드가 직접 한 것인지 운영이 대신한 것인지 구분할 수 없다. 그래서 성공한 뒤 한 줄을 더 남긴다.
 *   · 인플루언서·브랜드 스레드에도 보인다 — 브랜드가 직접 승인한 것처럼 보이게 두지 않는다.
 *   · 이 insert 가 실패해도 앞선 전이는 되돌리지 않는다(원자적이지 않다). 최악의 경우 기록 한 줄이 빠질 뿐이고,
 *     상태를 되돌리면 이미 통보된 인플루언서·브랜드 쪽이 더 크게 어긋난다.
 */
async function logProxyAction(admin: Admin, campaignId: string, actorUserId: string, what: string): Promise<void> {
  const { error } = await admin.from("campaign_events").insert({
    campaign_id: campaignId,
    kind: "system",
    sender: "system",
    actor_role: "admin",
    actor_user_id: actorUserId,
    body: `셀러리 운영팀이 브랜드를 대신해 ${what}`,
    event_type: "admin_proxy_action",
    payload: { what },
  });
  if (error) console.error("[admin/campaigns] 대행 기록 실패:", error.message);
}

async function callBrandRpc(
  ref: string,
  admin: Admin,
  actorUserId: string,
  fn: (t: { id: string; brandId: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string,
  /** 대행 기록에 남길 말 — "샘플 요청을 승인했습니다" 처럼 문장을 완성한다 */
  logged: string
): Promise<AdminCampaignActionResult> {
  const t = await campaignTarget(admin, ref);
  if (!t) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await fn(t);
  if (error) {
    console.error(`[admin/campaigns] ${label} 실패:`, error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const r = parseBrandRpc(data);
  // 이미 처리된 건(already)에는 남기지 않는다 — 누른 사람만 늘어난다
  if (r.ok && !r.already) await logProxyAction(admin, t.id, actorUserId, logged);
  return r;
}

/** 샘플 요청 승인 — 브랜드 대행(`app_brand_approve_sample` · 0015) */
export function approveSampleAsAdmin(ref: string, actorUserId: string, admin: Admin = createAdminClient()): Promise<AdminCampaignActionResult> {
  return callBrandRpc(
    ref,
    admin,
    actorUserId,
    (t) => admin.rpc("app_brand_approve_sample", { p_brand_id: t.brandId, p_campaign_id: t.id }),
    "샘플 승인",
    "샘플 요청을 승인했습니다"
  );
}

/** 샘플 요청 거절 — 사유는 선택(브랜드 RPC 와 같은 규칙: 공백 정리 · 200자) */
export function rejectSampleAsAdmin(
  ref: string,
  reason: string | null,
  actorUserId: string,
  admin: Admin = createAdminClient()
): Promise<AdminCampaignActionResult> {
  const r = normalizeRejectReason(reason);
  return callBrandRpc(
    ref,
    admin,
    actorUserId,
    (t) => admin.rpc("app_brand_reject_sample", { p_brand_id: t.brandId, p_campaign_id: t.id, p_reason: r ?? undefined }),
    "샘플 거절",
    "샘플 요청을 거절했습니다"
  );
}

/** 샘플 발송 등록 — 택배사·운송장(`app_brand_ship_sample` · 0015) */
export function shipSampleAsAdmin(
  ref: string,
  courier: string,
  trackingNo: string,
  actorUserId: string,
  admin: Admin = createAdminClient()
): Promise<AdminCampaignActionResult> {
  return callBrandRpc(
    ref,
    admin,
    actorUserId,
    (t) => admin.rpc("app_brand_ship_sample", { p_brand_id: t.brandId, p_campaign_id: t.id, p_courier: courier, p_tracking_no: trackingNo }),
    "샘플 발송",
    "샘플 발송을 등록했습니다"
  );
}

/** 판매 일정 승인 — 확정되면 판매 링크가 생긴다(`app_brand_confirm_schedule` · 0016 · 기간 우선권 검사 포함) */
export function confirmScheduleAsAdmin(ref: string, actorUserId: string, admin: Admin = createAdminClient()): Promise<AdminCampaignActionResult> {
  return callBrandRpc(
    ref,
    admin,
    actorUserId,
    (t) => admin.rpc("app_brand_confirm_schedule", { p_brand_id: t.brandId, p_campaign_id: t.id }),
    "일정 승인",
    "판매 일정을 확정했습니다"
  );
}

/** 판매 일정 거절 */
export function rejectScheduleAsAdmin(
  ref: string,
  reason: string | null,
  actorUserId: string,
  admin: Admin = createAdminClient()
): Promise<AdminCampaignActionResult> {
  const r = normalizeRejectReason(reason);
  return callBrandRpc(
    ref,
    admin,
    actorUserId,
    (t) => admin.rpc("app_brand_reject_schedule", { p_brand_id: t.brandId, p_campaign_id: t.id, p_reason: r ?? undefined }),
    "일정 거절",
    "판매 일정을 거절했습니다"
  );
}

export type AdminChatResult = { ok: true; leak: boolean } | { ok: false; code: "NOT_FOUND" | "BAD_BODY" | "DB_ERROR"; message?: string };

export { CHAT_MAX };

/**
 * 관리자 발신 — `sender='admin'` · `actor_role='admin'` · `actor_user_id` 기록.
 * 두 콘솔은 이것을 "셀러리 운영팀" 으로 표시한다. 연락처 감지는 관리자 메시지에도 적용된다.
 */
export async function postAdminChat(
  ref: string,
  body: string,
  /** 누가 보냈는지 — `campaign_events.actor_user_id` 에 남는다. 관리자는 항상 로그인 상태라 필수로 둔다 */
  actorUserId: string,
  admin: Admin = createAdminClient()
): Promise<AdminChatResult> {
  // 본문 검사는 두 콘솔과 같은 규칙(1~1000자 · 제어문자 제거 · 개행 유지)
  const parsed = parseChatInput({ body });
  if (!parsed.ok) return { ok: false, code: "BAD_BODY", message: parsed.message };
  const t = await campaignTarget(admin, ref);
  if (!t) return { ok: false, code: "NOT_FOUND" };

  const { data, error } = await admin.rpc("campaign_post_chat", {
    p_campaign_id: t.id,
    p_role: "admin",
    p_actor_user_id: actorUserId,
    p_body: parsed.body,
  });
  if (error) {
    console.error("[admin/campaigns] 관리자 발신 실패:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  return { ok: true, leak: o?.leak_flag === true };
}
