/**
 * 판매 일정 제안 · 초대 응답 · 인플루언서 차례 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽). DB 호출은 `../server/partner/schedule.server.ts`.
 * 원본: docs/brand-console-plan.md §1(TESTING · INVITED 는 인플루언서 차례) · §4 "0016" · docs/period-policy.md · 프로토타입 ScheduleModal(기간 3/5/7 · 배정 재고) ·
 *       actions.ts proposeSchedule / passCamp / acceptInvite / declineInvite · helpers.ts periodBlock / stockLeft.
 *
 * 판정(우선 기간 · 재고 · 상태)은 **DB 함수(0016 app_propose_schedule 등)** 가 한다. 여기서는
 *   parseScheduleInput(form, today)        폼(시작일 + 기간 or 종료일 + 수량) → { start, end, len, qty } — 0016 과 같은 조건(오늘 이후 · len 1~PERIOD_LEN_MAX · qty > 0)
 *   endOfPeriod · periodLen · periodOverlaps · daysBetween   날짜 산술 (KST 달력일, ../dates)
 *   scheduleLine(start, end, qty)           "9/24 – 9/28 · 재고 50" (프로토타입 pushSys 원문의 일정부)
 *   parseScheduleContext(json)              app_seller_schedule_context jsonb → 타입 (폼의 잔여 재고 · 선택지 · 이미 잡힌 기간)
 *   parseScheduleResult · parseSellerActionResult   RPC 결과 파서 · SCHEDULE_FAIL_MESSAGES · scheduleFailMessage · SELLER_ACTION_FAIL_MESSAGES
 *   parseDeclineInput(form)                 거절 사유 ≤ 200
 *   sellerNextAction(status)                상태 → 인플루언서 액션 패널 (브랜드의 brandNextAction 짝)
 */
import { ST } from "@sellery/core/constants";
import type { Status } from "@sellery/core/types";
import { fmtNum } from "../campaign";
import { addDays, daysBetween, md, toKstYmd } from "../dates";
import { cleanText } from "../text";

export { addDays, daysBetween, md } from "../dates";

/* ---------------- 기간 상수 (프로토타입 ScheduleModal · platform_settings.period_len_days = [3,5,7]) ---------------- */

/** 기간 선택지(일) — DB 컨텍스트(`len_choices`)가 있으면 그 값을 우선한다 */
export const PERIOD_LEN_CHOICES: readonly number[] = [3, 5, 7];
/** 기간 상한(일) — 0016 period_len_max() 의 기본값과 같은 값 */
export const PERIOD_LEN_MAX = 7;
/** 배정 재고 입력 step(프로토타입 min=50 step=50) — 표시용. 함수는 1 이상이면 받는다 */
export const QTY_STEP = 50;
export const DECLINE_REASON_MAX = 200;

/* ---------------- 날짜 산술 ---------------- */

/** 시작일 + 기간 → 종료일(포함). len 1 → 시작일 그대로 (proposeSchedule `en = addD(st, len − 1)`) */
export function endOfPeriod(start: string, len: number): string {
  return addDays(start, Math.max(1, Math.trunc(len)) - 1);
}

/** 포함 기간의 길이(일). 형식이 어긋나면 NaN */
export function periodLen(start: string, end: string): number {
  const d = daysBetween(start, end);
  return Number.isNaN(d) ? NaN : d + 1;
}

/** 두 포함 기간이 겹치는가 — periodHolders 의 `!(e < c.start || s > c.end)` 그대로 */
export function periodOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = toKstYmd(aStart);
  const ae = toKstYmd(aEnd);
  const bs = toKstYmd(bStart);
  const be = toKstYmd(bEnd);
  if (!as || !ae || !bs || !be) return false;
  return !(ae < bs || as > be);
}

/** "9/24 – 9/28 · 재고 50" · qty 가 null 이면 기간만 */
export function scheduleLine(start: string, end: string, qty: number | null = null): string {
  const s = `${md(start)} – ${md(end)}`;
  return qty === null ? s : `${s} · 재고 ${fmtNum(qty)}`;
}

/* ---------------- 폼 → 입력 ---------------- */

export type ScheduleField = "start" | "end" | "len" | "qty";

export const SCHEDULE_FIELD_MESSAGES: Record<ScheduleField, string> = {
  start: "시작일을 선택하세요 — 오늘 이후여야 해요",
  end: "종료일이 시작일보다 앞설 수 없어요",
  len: `판매 기간은 최대 ${PERIOD_LEN_MAX}일이에요`,
  qty: "배정 재고를 입력하세요 (1개 이상)",
};

export type ParsedSchedule =
  | { ok: true; start: string; end: string; len: number; qty: number }
  | { ok: false; field: ScheduleField; message: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const intOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const int = (v: unknown, d = 0): number => intOrNull(v) ?? d;
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

function formToObj(raw: unknown): Obj | null {
  return typeof FormData !== "undefined" && raw instanceof FormData
    ? Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"))
    : obj(raw);
}

/**
 * FormData · 객체 → 일정 입력. 키: `start`(YYYY-MM-DD 필수) · `len`(일) 또는 `end`(YYYY-MM-DD) 중 하나 · `qty`.
 * 검사 순서 = 0016 app_propose_schedule: 시작일(오늘 이후) → 종료일 → 기간(1~maxLen) → 수량(> 0). 잔여 재고·우선 기간은 DB 가 판정한다.
 * `today` 는 KST 'YYYY-MM-DD' (기본 kstToday 는 호출자가 넘긴다 — 순수 함수).
 */
export function parseScheduleInput(raw: unknown, today: string, maxLen = PERIOD_LEN_MAX): ParsedSchedule {
  const src = formToObj(raw);
  const start = toKstYmd(str(src?.start).trim());
  if (!start || start.length !== 10 || (today && start < today)) return { ok: false, field: "start", message: SCHEDULE_FIELD_MESSAGES.start };
  let end: string | null = null;
  const lenIn = intOrNull(src?.len);
  const endIn = toKstYmd(str(src?.end).trim());
  if (lenIn !== null && lenIn > 0) end = endOfPeriod(start, lenIn);
  else if (endIn && endIn.length === 10) end = endIn;
  if (!end) return { ok: false, field: "end", message: SCHEDULE_FIELD_MESSAGES.end };
  if (end < start) return { ok: false, field: "end", message: SCHEDULE_FIELD_MESSAGES.end };
  const len = periodLen(start, end);
  if (!Number.isFinite(len) || len < 1 || len > maxLen) return { ok: false, field: "len", message: `판매 기간은 최대 ${maxLen}일이에요` };
  const qty = intOrNull(src?.qty);
  if (qty === null || qty <= 0) return { ok: false, field: "qty", message: SCHEDULE_FIELD_MESSAGES.qty };
  return { ok: true, start, end, len, qty };
}

/** 거절 사유 — 선택 · cleanText · ≤ 200자 (넘치면 자른다) */
export function parseDeclineInput(raw: unknown): { reason: string | null } {
  const src = formToObj(raw);
  const reason = cleanText(str(src?.reason)).slice(0, DECLINE_REASON_MAX);
  return { reason: reason || null };
}

/* ---------------- app_seller_schedule_context ---------------- */

export type PeriodHolder = {
  campaign_id: string;
  campaign_code: string;
  status: string;
  start: string;
  end: string;
  qty: number;
  seller_id: string;
  name: string;
  handle: string;
  grade: string | null;
  is_priority: boolean;
};

export type ScheduleContext = {
  campaign_id: string;
  campaign_code: string;
  status: string;
  today: string;
  len_choices: number[];
  max_len: number;
  stock: number;
  allocated: number;
  stock_left: number;
  is_priority: boolean;
  proposed: { start: string; end: string; qty: number } | null;
  /** 같은 상품의 확정·진행 중 기간 전부(자기 캠페인 제외) — 폼의 "이미 잡힌 기간" · 우선권 표시 */
  holders: PeriodHolder[];
  price_locked: number | null;
  rate_locked: number | null;
};

export function parsePeriodHolder(json: unknown): PeriodHolder | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.campaign_id);
  const start = strOrNull(o.start);
  const end = strOrNull(o.end);
  if (!id || !start || !end) return null;
  return {
    campaign_id: id,
    campaign_code: str(o.campaign_code),
    status: str(o.status),
    start,
    end,
    qty: int(o.qty),
    seller_id: str(o.seller_id),
    name: str(o.name),
    handle: str(o.handle),
    grade: strOrNull(o.grade),
    is_priority: o.is_priority === true,
  };
}

/** jsonb → ScheduleContext. ok:false(NOT_FOUND) · 형식 위반은 null */
export function parseScheduleContext(json: unknown): ScheduleContext | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  const id = strOrNull(o.campaign_id);
  const code = strOrNull(o.campaign_code);
  if (!id || !code) return null;
  const choicesRaw = Array.isArray(o.len_choices) ? o.len_choices.map(intOrNull).filter((n): n is number => n !== null && n > 0) : [];
  const proposed = obj(o.proposed);
  const ps = proposed ? strOrNull(proposed.start) : null;
  const pe = proposed ? strOrNull(proposed.end) : null;
  return {
    campaign_id: id,
    campaign_code: code,
    status: str(o.status),
    today: str(o.today),
    len_choices: choicesRaw.length ? choicesRaw : [...PERIOD_LEN_CHOICES],
    max_len: int(o.max_len, PERIOD_LEN_MAX),
    stock: int(o.stock),
    allocated: int(o.allocated),
    stock_left: int(o.stock_left),
    is_priority: o.is_priority === true,
    proposed: ps && pe ? { start: ps, end: pe, qty: int(proposed!.qty) } : null,
    holders: Array.isArray(o.holders) ? o.holders.map(parsePeriodHolder).filter((h): h is PeriodHolder => h !== null) : [],
    price_locked: intOrNull(o.price_locked),
    rate_locked: numOrNull(o.rate_locked),
  };
}

/** 우선권 인플루언서가 잡은 기간만 (내가 우선권이 아니면 이 기간은 피해야 한다) */
export function priorityHolders(ctx: Pick<ScheduleContext, "holders" | "is_priority">): PeriodHolder[] {
  return ctx.is_priority ? [] : ctx.holders.filter((h) => h.is_priority);
}

/* ---------------- app_propose_schedule 결과 ---------------- */

export type ScheduleCode = "NOT_FOUND" | "WRONG_STATUS" | "BAD_PERIOD" | "BAD_QTY" | "QTY_EXCEEDS_STOCK" | "PERIOD_BLOCKED" | "DB_ERROR";

export const SCHEDULE_CODES: readonly ScheduleCode[] = ["NOT_FOUND", "WRONG_STATUS", "BAD_PERIOD", "BAD_QTY", "QTY_EXCEEDS_STOCK", "PERIOD_BLOCKED", "DB_ERROR"];

export function isScheduleCode(v: unknown): v is ScheduleCode {
  return typeof v === "string" && (SCHEDULE_CODES as readonly string[]).includes(v);
}

export type ScheduleResult =
  | { ok: true; campaignId: string; campaignCode: string; status: string; start: string; end: string; len: number; qty: number; left: number; reproposed: boolean }
  | {
      ok: false;
      code: ScheduleCode;
      status?: string | null;
      /** BAD_PERIOD */
      field?: ScheduleField | null;
      maxLen?: number | null;
      /** QTY_EXCEEDS_STOCK */
      left?: number | null;
      /** PERIOD_BLOCKED — 선점한 인플루언서 */
      by?: string | null;
      grade?: string | null;
      start?: string | null;
      end?: string | null;
    };

export function parseScheduleResult(json: unknown): ScheduleResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = strOrNull(o.campaign_id);
    const campaignCode = strOrNull(o.campaign_code);
    const start = strOrNull(o.start);
    const end = strOrNull(o.end);
    if (!campaignId || !campaignCode || !start || !end) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      campaignId,
      campaignCode,
      status: str(o.status, "SCHEDULE_PROPOSED"),
      start,
      end,
      len: int(o.len, periodLen(start, end)),
      qty: int(o.qty),
      left: int(o.left),
      reproposed: o.reproposed === true,
    };
  }
  const f = strOrNull(o.field);
  return {
    ok: false,
    code: isScheduleCode(o.code) ? o.code : "DB_ERROR",
    status: strOrNull(o.status),
    field: f === "start" || f === "end" || f === "len" || f === "qty" ? f : null,
    maxLen: intOrNull(o.max_len),
    left: intOrNull(o.left),
    by: strOrNull(o.by),
    grade: strOrNull(o.grade),
    start: strOrNull(o.start),
    end: strOrNull(o.end),
  };
}

/** 실패 코드 → 문구 (프로토타입 proposeSchedule 토스트 원문). PERIOD_BLOCKED · QTY_EXCEEDS_STOCK 은 `scheduleFailMessage()` 가 값을 채운다. */
export const SCHEDULE_FAIL_MESSAGES: Record<ScheduleCode, string> = {
  NOT_FOUND: "캠페인을 찾을 수 없어요",
  WRONG_STATUS: "지금 상태에서는 일정을 제안할 수 없어요 — 화면을 새로고침해주세요",
  BAD_PERIOD: "판매 기간을 확인해주세요",
  BAD_QTY: SCHEDULE_FIELD_MESSAGES.qty,
  QTY_EXCEEDS_STOCK: "배정 가능한 재고를 초과했어요 — 수량을 줄여주세요",
  PERIOD_BLOCKED: "이 기간은 상위 등급 인플루언서가 선점했습니다 — 플래티넘 이상만 함께 판매할 수 있어요. 다른 날짜를 선택해주세요",
  DB_ERROR: "처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function scheduleFailMessage(r: Extract<ScheduleResult, { ok: false }>): string {
  switch (r.code) {
    case "BAD_PERIOD":
      return r.field === "len" && r.maxLen ? `판매 기간은 최대 ${r.maxLen}일이에요` : r.field ? SCHEDULE_FIELD_MESSAGES[r.field] : SCHEDULE_FAIL_MESSAGES.BAD_PERIOD;
    case "QTY_EXCEEDS_STOCK":
      return `배정 가능한 재고를 초과했어요 (잔여 ${fmtNum(r.left ?? 0)}개) — 수량을 줄여주세요`;
    case "PERIOD_BLOCKED":
      return `이 기간은 ${r.grade ?? "상위"} 등급 인플루언서${r.by ? `(${r.by})` : ""}가 선점했습니다${r.start && r.end ? ` · ${md(r.start)} – ${md(r.end)}` : ""} — 플래티넘 이상만 함께 판매할 수 있어요. 다른 날짜를 선택해주세요`;
    case "WRONG_STATUS":
      return r.status && r.status in ST ? `지금 상태(${ST[r.status as Status].l})에서는 일정을 제안할 수 없어요 — 화면을 새로고침해주세요` : SCHEDULE_FAIL_MESSAGES.WRONG_STATUS;
    default:
      return SCHEDULE_FAIL_MESSAGES[r.code];
  }
}

/** 성공 토스트 (프로토타입 원문) */
export const SCHEDULE_DONE_MESSAGE = "일정 제안 완료 — 브랜드 승인 대기";
export const SCHEDULE_REPROPOSED_MESSAGE = "일정을 다시 제안했어요 — 브랜드 승인 대기";

/* ---------------- app_pass_campaign · app_accept_invite · app_decline_invite 결과 (공통 꼴) ---------------- */

export type SellerActionCode = "NOT_FOUND" | "WRONG_STATUS" | "NOT_LISTED" | "EXCLUSIVE_LOCKED" | "BAD_SHIPPING" | "DB_ERROR";

export const SELLER_ACTION_CODES: readonly SellerActionCode[] = ["NOT_FOUND", "WRONG_STATUS", "NOT_LISTED", "EXCLUSIVE_LOCKED", "BAD_SHIPPING", "DB_ERROR"];

export function isSellerActionCode(v: unknown): v is SellerActionCode {
  return typeof v === "string" && (SELLER_ACTION_CODES as readonly string[]).includes(v);
}

export type SellerActionResult =
  | { ok: true; already: boolean; campaignId: string; campaignCode: string; status: string }
  | { ok: false; code: SellerActionCode; status?: string | null; field?: string | null };

export function parseSellerActionResult(json: unknown): SellerActionResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = strOrNull(o.campaign_id);
    const campaignCode = strOrNull(o.campaign_code);
    const status = strOrNull(o.status);
    if (!campaignId || !campaignCode || !status) return { ok: false, code: "DB_ERROR" };
    return { ok: true, already: o.already === true, campaignId, campaignCode, status };
  }
  return { ok: false, code: isSellerActionCode(o.code) ? o.code : "DB_ERROR", status: strOrNull(o.status), field: strOrNull(o.field) };
}

export const SELLER_ACTION_FAIL_MESSAGES: Record<SellerActionCode, string> = {
  NOT_FOUND: "캠페인을 찾을 수 없어요",
  WRONG_STATUS: "지금 상태에서는 처리할 수 없어요 — 화면을 새로고침해주세요",
  NOT_LISTED: "현재 노출 중단된 상품입니다 — 브랜드에 문의하세요",
  EXCLUSIVE_LOCKED: "이 상품은 다른 인플루언서의 독점권이 확정되어 진행할 수 없습니다",
  BAD_SHIPPING: "배송지를 확인해주세요 — 수취인 · 연락처 · 우편번호 · 주소는 필수예요",
  DB_ERROR: "처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function sellerActionFailMessage(r: { code: string; status?: string | null }): string {
  if (r.code === "WRONG_STATUS" && r.status && r.status in ST) return `지금 상태(${ST[r.status as Status].l})에서는 처리할 수 없어요 — 화면을 새로고침해주세요`;
  return isSellerActionCode(r.code) ? SELLER_ACTION_FAIL_MESSAGES[r.code] : SELLER_ACTION_FAIL_MESSAGES.DB_ERROR;
}

/** 성공 토스트 (프로토타입 passCamp · acceptInvite · declineInvite 원문) */
export const SELLER_ACTION_DONE_MESSAGES = {
  pass: "패스 처리",
  accept: "제안 수락 — 브랜드가 샘플을 발송하면 운송장이 표시됩니다",
  decline: "제안을 거절했습니다",
} as const;

/* ---------------- 인플루언서 차례 · 액션 패널 (brand/campaign-rules brandNextAction 의 짝) ---------------- */

/** ST[*].turn === 'seller' */
export const SELLER_TURN_STATUSES: readonly Status[] = (Object.keys(ST) as Status[]).filter((s) => ST[s].turn === "seller");

export type SellerActionKind = "accept_invite" | "receive_sample" | "propose_schedule" | "wait" | "live" | "ended";

export type SellerNextAction = { kind: SellerActionKind; label: string; hint: string };

/**
 * 상태 → 인플루언서 액션 패널 (§1 표 인플루언서 열 · 프로토타입 detActions seller 분기).
 * accept_invite: [수락(배송지)] [거절] · receive_sample: [수령 확인](0011) · propose_schedule: [일정 제안] [패스] · 그 외는 대기·진행·종결 표시.
 */
export function sellerNextAction(status: string): SellerNextAction {
  switch (status) {
    case "INVITED":
      return { kind: "accept_invite", label: "브랜드 제안 · 수락 · 거절", hint: "수락하면 샘플 요청 없이 바로 샘플 발송 단계로 넘어가요 (배송지가 브랜드에 전달됩니다)" };
    case "SAMPLE_SHIPPED":
      return { kind: "receive_sample", label: "샘플 수령 확인", hint: "받으셨으면 수령 확인을 눌러 테스트를 시작하세요 (기한 14일)" };
    case "TESTING":
      return { kind: "propose_schedule", label: "판매 일정 제안 · 패스", hint: "테스트 뒤 시작일 · 기간(3/5/7일) · 배정 재고를 제안하세요 — 브랜드가 승인하면 판매 링크가 열려요" };
    case "SCHEDULE_PROPOSED":
      return { kind: "wait", label: "브랜드 일정 승인 대기", hint: "브랜드가 제안한 일정을 검토 중이에요 — 다른 기간으로 다시 제안할 수도 있어요" };
    case "SAMPLE_REQUESTED":
      return { kind: "wait", label: "브랜드 승인 대기", hint: "브랜드가 샘플 요청을 검토하면 발송 대기로 넘어가요" };
    case "SAMPLE_APPROVED":
    case "SAMPLE_PURCHASED":
      return { kind: "wait", label: "브랜드 샘플 발송 대기", hint: "브랜드가 발송하면 운송장이 표시돼요" };
    case "SCHEDULE_CONFIRMED":
      return { kind: "wait", label: "판매 시작 대기", hint: "확정된 시작일에 판매 링크가 열려요" };
    case "LIVE":
      return { kind: "live", label: "판매 진행 중", hint: "실시간 매출은 매출 탭에서" };
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
