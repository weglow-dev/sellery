/**
 * 브랜드 시점 캠페인 규칙 — `/brand/requests` · `/brand/campaigns` · `/brand/campaigns/[code]` 의 순수 규칙 (docs/brand-console-plan.md §1 · §4 "0015" · §5).
 * 순수 모듈(브라우저 `.svelte` 와 서버 양쪽) — DB 호출은 `../server/brand/campaigns.server.ts`.
 *
 *   parseBrandCampaignRow(json) · parseBrandCampaignDetail(json)   0015 brand_campaign_json / app_brand_campaign jsonb → 타입 (계약 위반은 null)
 *   brandNextAction(status)                                        상태별 브랜드 차례(ST[*].turn) → 액션 패널 종류 · 문구 (데모 CampaignDetail 브랜드 분기)
 *   parseShipInput(form) · parseRejectInput(form)                   발송(택배사 + 송장) · 거절 사유 폼 — 0015 함수와 같은 조건
 *   SAMPLE_ACTION_FAIL_MESSAGES · sampleActionFailMessage(r)        승인·거절·발송 RPC 의 ok:false → 문구
 *   parseScheduleActionResult(json) · SCHEDULE_ACTION_FAIL_MESSAGES · scheduleActionFailMessage · periodLine   일정 승인·반려(0016 · 3단계) — 서버는 ../server/brand/schedule.server.ts
 *   상태 칩 · 스테퍼는 인플루언서와 같은 것을 재수출(campaignChip · CAMPAIGN_STEPS · stepIndex · ENDED_STATUSES · samplePaidLine).
 *   초대(0016 app_brand_invite_*)는 ./invite-rules.ts · 채팅은 ../partner/chat-rules.ts.
 */
import { ST } from "@sellery/core/constants";
import type { Status } from "@sellery/core/types";
import { COURIERS, isCourier, type Courier } from "../carriers";
import { md } from "../dates";
import { campaignChip, parseStoredShipping, type CampaignChip } from "../partner/sample-rules";
import { cleanText } from "../text";
import type { Shipping } from "../types";

export { campaignChip, CAMPAIGN_STEPS, stepIndex, ENDED_STATUSES, samplePaidLine, isCampaignStatus, type CampaignChip } from "../partner/sample-rules";
export { COURIERS, isCourier, trackingUrlOf, carrierName, type Courier } from "../carriers";

/* ---------------- 브랜드 차례 · 액션 ---------------- */

/** ST[*].turn === 'brand' — /brand/requests 기본 큐 (0015 app_brand_requests 의 기본 p_statuses 와 같은 값) */
export const BRAND_TURN_STATUSES: readonly Status[] = (Object.keys(ST) as Status[]).filter((s) => ST[s].turn === "brand");

export type BrandActionKind = "approve" | "ship" | "confirm_schedule" | "wait" | "live" | "ended";

export type BrandNextAction = {
  kind: BrandActionKind;
  /** 액션 패널 제목 */
  label: string;
  /** 부연 (누구를 기다리는지 · 무엇을 입력해야 하는지) */
  hint: string;
};

/**
 * 상태 → 브랜드 액션 패널 (§1 표). 2단계는 approve · ship 만 실제 버튼, confirm_schedule 은 3단계(표시만).
 * 낯선 상태는 wait.
 */
export function brandNextAction(status: string): BrandNextAction {
  switch (status) {
    case "SAMPLE_REQUESTED":
      return { kind: "approve", label: "샘플 요청 승인 · 거절", hint: "승인하면 인플루언서 배송지가 전달되고 발송 대기로 넘어가요" };
    case "SAMPLE_APPROVED":
      return { kind: "ship", label: "샘플 발송 처리", hint: "택배사와 송장번호를 입력해주세요 — 인플루언서가 수령 확인을 하면 테스트가 시작돼요" };
    case "SAMPLE_PURCHASED":
      return { kind: "ship", label: "샘플 발송 처리 (구매 샘플)", hint: "인플루언서가 결제한 샘플이에요 — 택배사와 송장번호를 입력해주세요" };
    case "SCHEDULE_PROPOSED":
      return { kind: "confirm_schedule", label: "일정 승인 · 반려", hint: "제안한 기간 · 배정 재고를 확인하고 승인하면 판매가 확정돼요 (판매가 · 수수료율이 이 시점 값으로 잠깁니다)" };
    case "INVITED":
      return { kind: "wait", label: "인플루언서 수락 대기", hint: "제안을 받은 인플루언서가 수락하면 배송지가 전달되고 샘플 발송 대기로 넘어가요" };
    case "SAMPLE_SHIPPED":
      return { kind: "wait", label: "인플루언서 수령 대기", hint: "인플루언서가 수령 확인을 하면 테스트(14일)가 시작돼요" };
    case "TESTING":
      return { kind: "wait", label: "테스트 · 일정 제안 대기", hint: "인플루언서가 테스트 뒤 판매 일정을 제안해요" };
    case "SCHEDULE_CONFIRMED":
      return { kind: "wait", label: "판매 시작 대기", hint: "확정된 시작일에 판매 링크가 열려요" };
    case "LIVE":
      return { kind: "live", label: "판매 진행 중", hint: "주문이 들어오면 주문 탭에서 발송해주세요" };
    case "CLEARING":
      return { kind: "live", label: "판매 종료 · 환불 기간", hint: "종료 후 21일이 지나면 정산돼요" };
    case "SETTLED":
    case "DECLINED":
    case "REJECTED":
    case "PASSED":
      return { kind: "ended", label: "종료", hint: "" };
    default:
      return { kind: "wait", label: "대기", hint: "" };
  }
}

/* ---------------- 0015 brand_campaign_json → 타입 ---------------- */

export type BrandSellerSummary = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  platform: string;
  avatar_url: string | null;
  grade: string | null;
  followers: number;
  hidden: boolean;
  /** 우선권 등급(플래티넘 이상, grade_tiers.is_priority) — 0016 */
  is_priority: boolean;
  /** 메인 채널 — verified 가 인증 여부 (없으면 null) */
  primary_channel: { platform: string; handle: string; url: string | null; followers: number; verified: boolean } | null;
};

export type BrandCampaignProduct = {
  id: string;
  code: string | null;
  name: string;
  emoji: string;
  thumb_url: string | null;
  category: string;
  sale_price: number;
  consumer_price: number;
  commission_rate: number;
  sample_text: string | null;
  status: string;
};

/** brand_campaign_json 1행 (0015) */
export type BrandCampaignRow = {
  id: string;
  code: string;
  status: string;
  chip: CampaignChip;
  action: BrandNextAction;
  created_at: string;
  updated_at: string;
  invited: boolean;
  auto_proposed: boolean;
  regongu: boolean;
  purchased: boolean;
  sample_price: number | null;
  sample_cel: number;
  sample_cash: number;
  sample_method: string | null;
  sample_courier: string | null;
  tracking_no: string | null;
  sample_shipped_at: string | null;
  received_at: string | null;
  test_due: string | null;
  proposed_start: string | null;
  proposed_end: string | null;
  proposed_qty: number | null;
  start_date: string | null;
  end_date: string | null;
  qty: number;
  sold_qty: number;
  /** 확정 시점 판매가 · 인플루언서 수수료율 스냅샷 (0016 app_brand_confirm_schedule · 확정 전 null) */
  price_locked: number | null;
  rate_locked: number | null;
  decision_reason: string | null;
  settled_at: string | null;
  /** 배송지 스냅샷 존재 여부 (원문은 상세에서만) */
  has_shipping: boolean;
  /** 상품 재고 · 잔여(재고 − 다른 캠페인 배정량) — 일정 승인 패널 (0016) */
  stock: number;
  stock_left: number;
  product: BrandCampaignProduct;
  seller: BrandSellerSummary;
};

export type BrandCampaignEvent = {
  id: string;
  kind: "chat" | "system";
  sender: "seller" | "brand" | "admin" | "system";
  body: string;
  event_type: string | null;
  payload: unknown;
  leak_flag: boolean;
  created_at: string;
};

export type BrandCampaignDetail = {
  campaign: BrandCampaignRow;
  /** 샘플 배송지 원문 — 발송 목적으로만 노출 (0011 헤더) */
  sample_shipping: Shipping | null;
  events: BrandCampaignEvent[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const intOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const int = (v: unknown, d = 0): number => intOrNull(v) ?? d;
const numOr = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : d;
};

function parseSeller(json: unknown): BrandSellerSummary | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const name = strOrNull(o.name);
  const handle = strOrNull(o.handle);
  if (!id || !name || !handle) return null;
  const ch = obj(o.primary_channel);
  return {
    id,
    code: strOrNull(o.code),
    name,
    handle,
    platform: str(o.platform, "instagram"),
    avatar_url: strOrNull(o.avatar_url),
    grade: strOrNull(o.grade),
    followers: int(o.followers),
    hidden: o.hidden === true,
    is_priority: o.is_priority === true,
    primary_channel: ch
      ? { platform: str(ch.platform), handle: str(ch.handle), url: strOrNull(ch.url), followers: int(ch.followers), verified: ch.verified === true }
      : null,
  };
}

function parseProduct(json: unknown): BrandCampaignProduct | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const name = strOrNull(o.name);
  if (!id || !name) return null;
  return {
    id,
    code: strOrNull(o.code),
    name,
    emoji: str(o.emoji) || "📦",
    thumb_url: strOrNull(o.thumb_url),
    category: str(o.category),
    sale_price: int(o.sale_price),
    consumer_price: int(o.consumer_price),
    commission_rate: numOr(o.commission_rate),
    sample_text: strOrNull(o.sample_text),
    status: str(o.status),
  };
}

/** jsonb 1행 → BrandCampaignRow. id · code · status · product · seller 가 어긋나면 null (호출자는 행을 버린다). */
export function parseBrandCampaignRow(json: unknown): BrandCampaignRow | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const code = strOrNull(o.code);
  const status = strOrNull(o.status);
  const product = parseProduct(o.product);
  const seller = parseSeller(o.seller);
  if (!id || !code || !status || !product || !seller) return null;
  return {
    id,
    code,
    status,
    chip: campaignChip(status),
    action: brandNextAction(status),
    created_at: str(o.created_at),
    updated_at: str(o.updated_at),
    invited: o.invited === true,
    auto_proposed: o.auto_proposed === true,
    regongu: o.regongu === true,
    purchased: o.purchased === true,
    sample_price: intOrNull(o.sample_price),
    sample_cel: int(o.sample_cel),
    sample_cash: int(o.sample_cash),
    sample_method: strOrNull(o.sample_method),
    sample_courier: strOrNull(o.sample_courier),
    tracking_no: strOrNull(o.tracking_no),
    sample_shipped_at: strOrNull(o.sample_shipped_at),
    received_at: strOrNull(o.received_at),
    test_due: strOrNull(o.test_due),
    proposed_start: strOrNull(o.proposed_start),
    proposed_end: strOrNull(o.proposed_end),
    proposed_qty: intOrNull(o.proposed_qty),
    start_date: strOrNull(o.start_date),
    end_date: strOrNull(o.end_date),
    qty: int(o.qty),
    sold_qty: int(o.sold_qty),
    price_locked: intOrNull(o.price_locked),
    rate_locked: Number.isFinite(numOr(o.rate_locked, Number.NaN)) ? numOr(o.rate_locked) : null,
    decision_reason: strOrNull(o.decision_reason),
    settled_at: strOrNull(o.settled_at),
    has_shipping: o.has_shipping === true,
    stock: int(o.stock),
    stock_left: int(o.stock_left),
    product,
    seller,
  };
}

/** jsonb 배열 → 행 목록 (계약 위반 행은 제외) */
export function parseBrandCampaignRows(json: unknown): BrandCampaignRow[] {
  if (!Array.isArray(json)) return [];
  return json.map(parseBrandCampaignRow).filter((r): r is BrandCampaignRow => r !== null);
}

export function parseBrandCampaignEvent(json: unknown): BrandCampaignEvent | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  if (!id) return null;
  return {
    id,
    kind: o.kind === "chat" ? "chat" : "system",
    sender: o.sender === "seller" || o.sender === "brand" || o.sender === "admin" ? o.sender : "system",
    body: str(o.body),
    event_type: strOrNull(o.event_type),
    payload: o.payload ?? null,
    leak_flag: o.leak_flag === true,
    created_at: str(o.created_at),
  };
}

/** app_brand_campaign jsonb(null 이면 남의 것·없음) → 상세 */
export function parseBrandCampaignDetail(json: unknown): BrandCampaignDetail | null {
  const o = obj(json);
  if (!o) return null;
  const campaign = parseBrandCampaignRow(o);
  if (!campaign) return null;
  const events = Array.isArray(o.events) ? o.events.map(parseBrandCampaignEvent).filter((e): e is BrandCampaignEvent => e !== null) : [];
  return { campaign, sample_shipping: parseStoredShipping(o.sample_shipping), events };
}

/* ---------------- /brand/campaigns 칩 필터 (데모 camps/+page.svelte all · live · soon · prep · done) ---------------- */

export type BrandCampaignFilter = "all" | "live" | "soon" | "prep" | "done";

export const BRAND_CAMPAIGN_FILTERS: readonly { key: BrandCampaignFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "live", label: "진행 중" },
  { key: "soon", label: "확정" },
  { key: "prep", label: "준비 중" },
  { key: "done", label: "종료" },
];

export function matchesBrandCampaignFilter(status: string, filter: BrandCampaignFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "live":
      return status === "LIVE";
    case "soon":
      return status === "SCHEDULE_CONFIRMED";
    case "done":
      return status === "CLEARING" || status === "SETTLED" || status === "DECLINED" || status === "REJECTED" || status === "PASSED";
    case "prep":
      return !matchesBrandCampaignFilter(status, "live") && !matchesBrandCampaignFilter(status, "soon") && !matchesBrandCampaignFilter(status, "done");
  }
}

/* ---------------- 발송 · 거절 폼 (0015 app_brand_ship_sample · app_brand_reject_sample 과 같은 조건) ---------------- */

/** 송장번호 — 공백 제거 뒤 영숫자·하이픈 6~30자, 숫자 1개 이상 (0015 와 동일) */
export const TRACKING_RE = /^[A-Za-z0-9-]{6,30}$/;
export const TRACKING_MAX = 30;
export const REJECT_REASON_MAX = 200;

export type ShipField = "courier" | "tracking_no";

export const SHIP_FIELD_MESSAGES: Record<ShipField, string> = {
  courier: `택배사를 선택해주세요 (${COURIERS.join(" · ")})`,
  tracking_no: "송장번호를 확인해주세요 — 숫자·영문·하이픈 6~30자",
};

export type ParsedShipInput = { ok: true; courier: Courier; trackingNo: string } | { ok: false; field: ShipField; message: string };

/** 송장 정규화 — 공백 제거 (하이픈은 유지: 조회 URL 은 trackingUrlOf 가 숫자만 뽑는다) */
export function normalizeTrackingNo(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\s/g, "");
}

export function parseShipInput(raw: unknown): ParsedShipInput {
  const src: Obj | null =
    typeof FormData !== "undefined" && raw instanceof FormData
      ? Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"))
      : obj(raw);
  const courier = str(src?.courier).trim();
  if (!isCourier(courier)) return { ok: false, field: "courier", message: SHIP_FIELD_MESSAGES.courier };
  const trackingNo = normalizeTrackingNo(str(src?.tracking_no));
  if (!TRACKING_RE.test(trackingNo) || !/\d/.test(trackingNo)) return { ok: false, field: "tracking_no", message: SHIP_FIELD_MESSAGES.tracking_no };
  return { ok: true, courier, trackingNo };
}

/** 거절 사유 — 선택 · cleanText · ≤ 200자 (넘치면 자른다 — 필수가 아니라 실패시키지 않는다) */
export function parseRejectInput(raw: unknown): { reason: string | null } {
  const src: Obj | null =
    typeof FormData !== "undefined" && raw instanceof FormData
      ? Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"))
      : obj(raw);
  const reason = cleanText(str(src?.reason)).slice(0, REJECT_REASON_MAX);
  return { reason: reason || null };
}

/* ---------------- 승인 · 거절 · 발송 RPC 결과 ---------------- */

export type SampleActionCode = "NOT_FOUND" | "WRONG_STATUS" | "BAD_COURIER" | "BAD_TRACKING" | "DB_ERROR";

export const SAMPLE_ACTION_CODES: readonly SampleActionCode[] = ["NOT_FOUND", "WRONG_STATUS", "BAD_COURIER", "BAD_TRACKING", "DB_ERROR"];

export function isSampleActionCode(v: unknown): v is SampleActionCode {
  return typeof v === "string" && (SAMPLE_ACTION_CODES as readonly string[]).includes(v);
}

export type SampleActionResult =
  | {
      ok: true;
      already: boolean;
      campaignId: string;
      campaignCode: string;
      status: string;
      /** ship 일 때 */
      courier?: string | null;
      trackingNo?: string | null;
    }
  | { ok: false; code: SampleActionCode; status?: string | null };

/** app_brand_{approve,reject,ship}_sample jsonb → 결과. 형식이 어긋나면 DB_ERROR. */
export function parseSampleActionResult(json: unknown): SampleActionResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = strOrNull(o.campaign_id);
    const campaignCode = strOrNull(o.campaign_code);
    const status = strOrNull(o.status);
    if (!campaignId || !campaignCode || !status) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      already: o.already === true,
      campaignId,
      campaignCode,
      status,
      courier: strOrNull(o.courier),
      trackingNo: strOrNull(o.tracking_no),
    };
  }
  return { ok: false, code: isSampleActionCode(o.code) ? o.code : "DB_ERROR", status: strOrNull(o.status) };
}

export const SAMPLE_ACTION_FAIL_MESSAGES: Record<SampleActionCode, string> = {
  NOT_FOUND: "캠페인을 찾을 수 없어요",
  WRONG_STATUS: "지금 상태에서는 처리할 수 없어요 — 화면을 새로고침해주세요",
  BAD_COURIER: SHIP_FIELD_MESSAGES.courier,
  BAD_TRACKING: SHIP_FIELD_MESSAGES.tracking_no,
  DB_ERROR: "처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function sampleActionFailMessage(r: { code: string; status?: string | null }): string {
  if (r.code === "WRONG_STATUS" && r.status) return `지금 상태(${campaignChip(r.status).label})에서는 처리할 수 없어요 — 화면을 새로고침해주세요`;
  return isSampleActionCode(r.code) ? SAMPLE_ACTION_FAIL_MESSAGES[r.code] : SAMPLE_ACTION_FAIL_MESSAGES.DB_ERROR;
}

/** 성공 토스트 (데모 approveSample · rejectSample · shipSample 원문) */
export const SAMPLE_ACTION_DONE_MESSAGES = {
  approve: "샘플 승인",
  reject: "거절 처리",
  ship: "발송 처리 완료",
} as const;

/** 배송지 한 줄 — 발송 패널 · 발주 라벨 (Shipping → "홍길동 · 010-1234-5678 · (06236) 서울 …") */
export function shippingLine(s: Shipping | null): string {
  if (!s) return "";
  const phone = s.phone.length === 11 ? `${s.phone.slice(0, 3)}-${s.phone.slice(3, 7)}-${s.phone.slice(7)}` : s.phone;
  return [s.recipient, phone, `(${s.postcode}) ${s.address1}${s.address2 ? " " + s.address2 : ""}`, s.memo ? `메모: ${s.memo}` : ""].filter(Boolean).join(" · ");
}

/* ---------------- 일정 승인 · 반려 RPC 결과 (0016 app_brand_confirm_schedule · app_brand_reject_schedule) — 3단계 ---------------- */

export type ScheduleActionCode = "NOT_FOUND" | "WRONG_STATUS" | "PERIOD_PAST" | "PERIOD_BLOCKED" | "STOCK_SHORT" | "DB_ERROR";

export const SCHEDULE_ACTION_CODES: readonly ScheduleActionCode[] = ["NOT_FOUND", "WRONG_STATUS", "PERIOD_PAST", "PERIOD_BLOCKED", "STOCK_SHORT", "DB_ERROR"];

export function isScheduleActionCode(v: unknown): v is ScheduleActionCode {
  return typeof v === "string" && (SCHEDULE_ACTION_CODES as readonly string[]).includes(v);
}

export type ScheduleActionResult =
  | {
      ok: true;
      already: boolean;
      campaignId: string;
      campaignCode: string;
      status: string;
      /** confirm 일 때 — 확정 기간 · 배정 · 잠금 스냅샷 */
      start?: string | null;
      end?: string | null;
      qty?: number | null;
      priceLocked?: number | null;
      rateLocked?: number | null;
      priority?: boolean;
    }
  | {
      ok: false;
      code: ScheduleActionCode;
      status?: string | null;
      /** STOCK_SHORT */
      left?: number | null;
      qty?: number | null;
      /** PERIOD_BLOCKED — 선점한 인플루언서 · PERIOD_PAST — 제안 시작일 */
      by?: string | null;
      grade?: string | null;
      start?: string | null;
      end?: string | null;
    };

/** app_brand_{confirm,reject}_schedule jsonb → 결과. 형식이 어긋나면 DB_ERROR. */
export function parseScheduleActionResult(json: unknown): ScheduleActionResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = strOrNull(o.campaign_id);
    const campaignCode = strOrNull(o.campaign_code);
    const status = strOrNull(o.status);
    if (!campaignId || !campaignCode || !status) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      already: o.already === true,
      campaignId,
      campaignCode,
      status,
      start: strOrNull(o.start),
      end: strOrNull(o.end),
      qty: intOrNull(o.qty),
      priceLocked: intOrNull(o.price_locked),
      rateLocked: Number.isFinite(numOr(o.rate_locked, Number.NaN)) ? numOr(o.rate_locked) : null,
      priority: o.priority === true,
    };
  }
  return {
    ok: false,
    code: isScheduleActionCode(o.code) ? o.code : "DB_ERROR",
    status: strOrNull(o.status),
    left: intOrNull(o.left),
    qty: intOrNull(o.qty),
    by: strOrNull(o.by),
    grade: strOrNull(o.grade),
    start: strOrNull(o.start),
    end: strOrNull(o.end),
  };
}

/** 실패 코드 → 문구 (프로토타입 confirmSchedule 토스트 원문). PERIOD_BLOCKED · STOCK_SHORT 는 `scheduleActionFailMessage()` 가 값을 채운다. */
export const SCHEDULE_ACTION_FAIL_MESSAGES: Record<ScheduleActionCode, string> = {
  NOT_FOUND: "캠페인을 찾을 수 없어요",
  WRONG_STATUS: "지금 상태에서는 처리할 수 없어요 — 화면을 새로고침해주세요",
  PERIOD_PAST: "제안된 시작일이 이미 지났어요 — 반려하고 다시 제안을 요청하세요",
  PERIOD_BLOCKED: "제안 이후 상위 등급 인플루언서가 이 기간을 선점했어요 — 반려하고 재제안을 요청하세요",
  STOCK_SHORT: "잔여 재고보다 많은 수량입니다 — 재고를 늘리거나 반려하세요",
  DB_ERROR: "처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function scheduleActionFailMessage(r: Extract<ScheduleActionResult, { ok: false }>): string {
  switch (r.code) {
    case "WRONG_STATUS":
      return r.status ? `지금 상태(${campaignChip(r.status).label})에서는 처리할 수 없어요 — 화면을 새로고침해주세요` : SCHEDULE_ACTION_FAIL_MESSAGES.WRONG_STATUS;
    case "PERIOD_BLOCKED":
      return `제안 이후 ${r.grade ?? "상위"} 등급 인플루언서${r.by ? `(${r.by})` : ""}가 이 기간을 선점했어요 — 반려하고 재제안을 요청하세요`;
    case "STOCK_SHORT":
      return `잔여 재고(${(r.left ?? 0).toLocaleString("ko-KR")}개)보다 많은 수량${r.qty ? `(${r.qty.toLocaleString("ko-KR")}개)` : ""}입니다 — 재고를 늘리거나 반려하세요`;
    default:
      return SCHEDULE_ACTION_FAIL_MESSAGES[r.code];
  }
}

/** 성공 토스트 (프로토타입 confirmSchedule · rejectSchedule 원문) */
export const SCHEDULE_ACTION_DONE_MESSAGES = {
  confirm: "일정 확정 — 캘린더 잠금",
  reject: "반려 — 인플루언서 재제안 대기",
} as const;

/** 확정 일정 한 줄 — "9/27 – 10/1 · 배정 600" (proposed_* 또는 start/end/qty 어느 쪽이든 · 비면 "") */
export function periodLine(start: string | null, end: string | null, qty: number | null = null): string {
  if (!start || !end) return "";
  return `${md(start)} – ${md(end)}${qty !== null ? ` · 배정 ${qty.toLocaleString("ko-KR")}` : ""}`;
}
