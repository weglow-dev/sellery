/**
 * 고객 문의(CS) 규칙 — shop 접수 폼 · 고객 스레드 · 브랜드 `/brand/cs` 의 순수 규칙 (docs/brand-console-plan.md §4 "0018" · §5 `/brand/cs` · §8 "고객 CS 접수 화면 위치").
 * 순수 모듈(브라우저 `.svelte` 와 서버 양쪽) — DB 호출은 `../server/cs.server.ts`(고객) · `../server/brand/cs.server.ts`(브랜드).
 * 프로토타입 원본: constants.ts CS_TYPES · actions.ts submitCS / saveCSReply / csClose · helpers.ts csOf / csOpen · 데모 cs/+page.svelte 칩(M).
 *
 *   CS_TYPES · isCsType · CS_BODY_MAX(2000) · CS_BUYER_NAME_MAX(40)   0005 제약 · 0018 app_cs_open 과 같은 값
 *   parseCsOpenInput(form) · parseCsReplyInput(form)                    접수 폼(type · body · buyer_name · order_code) · 답글/추가 문의 폼(body)
 *   parseCsConversation(s) · parseCsThread                              cs_conversation_json / cs_thread_json → 타입
 *   parseCsOpenResult · parseCsActionResult                             app_cs_open · app_brand_cs_reply/close · app_cs_customer_reply 결과
 *   csStatusChip(status) · csSenderLabel(sender, brandName)             칩(답변 대기 · 답변 완료 · 처리 종료) · 말풍선 라벨
 *   CS_FAIL_MESSAGES · csFailMessage · CS_DONE_MESSAGES                  코드 → 문구
 *   CS_TOKEN_COOKIE · csTokenCookieName(code)                            비회원 client_token 보관 쿠키 이름(shop)
 */
import { CS_TYPES as CORE_CS_TYPES } from "@sellery/core/constants";

/** '배송 문의' · '교환·반품' · '상품 문의' · '기타' — 0005 cs_conversations.type 제약과 같은 4개 */
export const CS_TYPES: readonly string[] = CORE_CS_TYPES;
export type CsType = (typeof CS_TYPES)[number];

export function isCsType(v: unknown): v is CsType {
  return typeof v === "string" && CS_TYPES.includes(v);
}

export const CS_BODY_MAX = 2000;
export const CS_BUYER_NAME_MAX = 40;
export const CS_ORDER_CODE_MAX = 32;

export type CsStatus = "OPEN" | "ANSWERED" | "CLOSED";

export function isCsStatus(v: unknown): v is CsStatus {
  return v === "OPEN" || v === "ANSWERED" || v === "CLOSED";
}

/* ---------------- 폼 ---------------- */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const intOr = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

function formToObj(raw: unknown): Obj | null {
  if (typeof FormData !== "undefined" && raw instanceof FormData) {
    return Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"));
  }
  return obj(raw);
}

/** 본문 정규화 — 0018 cs_normalize_body 와 같은 결과: 제어문자 제거(개행·탭 유지) · 앞뒤 공백 · 빈 줄 3개 이상 → 2개 */
export function normalizeCsBody(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type CsOpenField = "type" | "body" | "buyer_name" | "order_code";

export const CS_OPEN_FIELD_MESSAGES: Record<CsOpenField, string> = {
  type: "문의 유형을 선택해주세요",
  body: `문의 내용을 입력해주세요 (${CS_BODY_MAX}자까지)`,
  buyer_name: `이름은 ${CS_BUYER_NAME_MAX}자까지예요`,
  order_code: "주문번호 형식을 확인해주세요 (예: O2001)",
};

export type ParsedCsOpenInput =
  | { ok: true; type: CsType; body: string; buyerName: string | null; orderCode: string | null }
  | { ok: false; field: CsOpenField; message: string };

const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function parseCsOpenInput(raw: unknown): ParsedCsOpenInput {
  const src = formToObj(raw);
  const type = str(src?.type).trim();
  if (!isCsType(type)) return { ok: false, field: "type", message: CS_OPEN_FIELD_MESSAGES.type };
  const body = normalizeCsBody(str(src?.body));
  if (!body || body.length > CS_BODY_MAX) return { ok: false, field: "body", message: CS_OPEN_FIELD_MESSAGES.body };
  const buyerName = str(src?.buyer_name).replace(/\s+/g, " ").trim();
  if (buyerName.length > CS_BUYER_NAME_MAX) return { ok: false, field: "buyer_name", message: CS_OPEN_FIELD_MESSAGES.buyer_name };
  const orderCode = str(src?.order_code).trim();
  if (orderCode && !ORDER_CODE_RE.test(orderCode)) return { ok: false, field: "order_code", message: CS_OPEN_FIELD_MESSAGES.order_code };
  return { ok: true, type, body, buyerName: buyerName || null, orderCode: orderCode || null };
}

export type ParsedCsReplyInput = { ok: true; body: string } | { ok: false; field: "body"; message: string };

export function parseCsReplyInput(raw: unknown): ParsedCsReplyInput {
  const src = formToObj(raw);
  const body = normalizeCsBody(str(src?.body));
  if (!body || body.length > CS_BODY_MAX) return { ok: false, field: "body", message: CS_OPEN_FIELD_MESSAGES.body };
  return { ok: true, body };
}

/* ---------------- 행 · 스레드 ---------------- */

export type CsOrderSummary = {
  code: string;
  status: string;
  qty: number;
  amount: number;
  option_name: string | null;
  courier: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  paid_at: string | null;
};

export type CsConversation = {
  id: string;
  /** cs100~ (시드 cs1 · cs2) */
  code: string;
  status: CsStatus;
  type: string;
  buyer_name: string;
  /** 고객 입력 원문 */
  order_code: string | null;
  order_id: string | null;
  /** order_code 가 같은 캠페인 주문으로 해석됐을 때 */
  order: CsOrderSummary | null;
  is_member: boolean;
  last_preview: string | null;
  last_message_at: string;
  replied_at: string | null;
  closed_at: string | null;
  created_at: string;
  message_count: number;
  campaign: {
    id: string;
    code: string;
    status: string;
    brand: { id: string; code: string; name: string } | null;
    product: { id: string; code: string; name: string; emoji: string; thumb_url: string | null } | null;
    seller: { id: string; code: string; name: string; handle: string } | null;
  };
};

export type CsMessage = {
  id: string;
  sender: "customer" | "brand" | "admin";
  actor_role: string;
  body: string;
  created_at: string;
};

export type CsThread = { conversation: CsConversation; messages: CsMessage[] };

export function parseCsConversation(json: unknown): CsConversation | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const code = strOrNull(o.code);
  const status = o.status;
  const c = obj(o.campaign);
  if (!id || !code || !isCsStatus(status) || !c || !strOrNull(c.id) || !strOrNull(c.code)) return null;
  const ord = obj(o.order);
  const b = obj(c.brand);
  const p = obj(c.product);
  const s = obj(c.seller);
  return {
    id,
    code,
    status,
    type: str(o.type, "기타"),
    buyer_name: str(o.buyer_name, "고객"),
    order_code: strOrNull(o.order_code),
    order_id: strOrNull(o.order_id),
    order:
      ord && strOrNull(ord.code)
        ? {
            code: str(ord.code),
            status: str(ord.status),
            qty: intOr(ord.qty, 1),
            amount: intOr(ord.amount),
            option_name: strOrNull(ord.option_name),
            courier: strOrNull(ord.courier),
            tracking_no: strOrNull(ord.tracking_no),
            shipped_at: strOrNull(ord.shipped_at),
            paid_at: strOrNull(ord.paid_at),
          }
        : null,
    is_member: o.is_member === true,
    last_preview: strOrNull(o.last_preview),
    last_message_at: str(o.last_message_at, str(o.created_at)),
    replied_at: strOrNull(o.replied_at),
    closed_at: strOrNull(o.closed_at),
    created_at: str(o.created_at),
    message_count: intOr(o.message_count),
    campaign: {
      id: str(c.id),
      code: str(c.code),
      status: str(c.status),
      brand: b && strOrNull(b.id) ? { id: str(b.id), code: str(b.code), name: str(b.name) } : null,
      product: p && strOrNull(p.id) ? { id: str(p.id), code: str(p.code), name: str(p.name), emoji: str(p.emoji, "📦"), thumb_url: strOrNull(p.thumb_url) } : null,
      seller: s && strOrNull(s.id) ? { id: str(s.id), code: str(s.code), name: str(s.name), handle: str(s.handle) } : null,
    },
  };
}

export function parseCsConversations(json: unknown): CsConversation[] {
  return Array.isArray(json) ? json.map(parseCsConversation).filter((x): x is CsConversation => x !== null) : [];
}

export function parseCsMessage(json: unknown): CsMessage | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const sender = o.sender;
  const body = strOrNull(o.body);
  const created_at = strOrNull(o.created_at);
  if (!id || (sender !== "customer" && sender !== "brand" && sender !== "admin") || body === null || !created_at) return null;
  return { id, sender, actor_role: str(o.actor_role, sender), body, created_at };
}

export function parseCsThread(json: unknown): CsThread | null {
  const o = obj(json);
  if (!o) return null;
  const conversation = parseCsConversation(o.conversation);
  if (!conversation) return null;
  const messages = Array.isArray(o.messages) ? o.messages.map(parseCsMessage).filter((m): m is CsMessage => m !== null) : [];
  return { conversation, messages };
}

/* ---------------- RPC 결과 ---------------- */

export type CsFailCode = "NOT_FOUND" | "WRONG_STATUS" | "BAD_TYPE" | "BAD_BODY" | "CLOSED" | "RATE_LIMITED" | "DB_ERROR";

export const CS_FAIL_CODES: readonly CsFailCode[] = ["NOT_FOUND", "WRONG_STATUS", "BAD_TYPE", "BAD_BODY", "CLOSED", "RATE_LIMITED", "DB_ERROR"];

export function isCsFailCode(v: unknown): v is CsFailCode {
  return (CS_FAIL_CODES as readonly unknown[]).includes(v);
}

export type CsOpenResult =
  | { ok: true; conversationId: string; conversationCode: string; clientToken: string; brandId: string; brandName: string | null; orderId: string | null; orderMatched: boolean }
  | { ok: false; code: CsFailCode; status?: string | null };

export function parseCsOpenResult(json: unknown): CsOpenResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const conversationId = strOrNull(o.conversation_id);
    const conversationCode = strOrNull(o.conversation_code);
    const clientToken = strOrNull(o.client_token);
    const brandId = strOrNull(o.brand_id);
    if (!conversationId || !conversationCode || !clientToken || !brandId) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      conversationId,
      conversationCode,
      clientToken,
      brandId,
      brandName: strOrNull(o.brand_name),
      orderId: strOrNull(o.order_id),
      orderMatched: o.order_matched === true,
    };
  }
  return { ok: false, code: isCsFailCode(o.code) ? o.code : "DB_ERROR", status: strOrNull(o.status) };
}

export type CsActionResult =
  | { ok: true; already: boolean; conversationId: string; conversationCode: string; status: CsStatus; message: CsMessage | null }
  | { ok: false; code: CsFailCode };

export function parseCsActionResult(json: unknown): CsActionResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const conversationId = strOrNull(o.conversation_id);
    const conversationCode = strOrNull(o.conversation_code);
    const status = o.status;
    if (!conversationId || !conversationCode || !isCsStatus(status)) return { ok: false, code: "DB_ERROR" };
    return { ok: true, already: o.already === true, conversationId, conversationCode, status, message: parseCsMessage(o.message) };
  }
  return { ok: false, code: isCsFailCode(o.code) ? o.code : "DB_ERROR" };
}

/* ---------------- 문구 · 칩 ---------------- */

export const CS_FAIL_MESSAGES: Record<CsFailCode, string> = {
  NOT_FOUND: "문의를 찾을 수 없어요",
  WRONG_STATUS: "판매 중이거나 판매가 끝난 캠페인에만 문의를 남길 수 있어요",
  BAD_TYPE: CS_OPEN_FIELD_MESSAGES.type,
  BAD_BODY: CS_OPEN_FIELD_MESSAGES.body,
  CLOSED: "처리 종료된 문의예요 — 추가 문의는 새로 접수해주세요",
  RATE_LIMITED: "요청이 많아요 — 잠시 후 다시 시도해주세요",
  DB_ERROR: "잠시 후 다시 시도해주세요",
};

export function csFailMessage(r: { code: string }): string {
  return isCsFailCode(r.code) ? CS_FAIL_MESSAGES[r.code] : CS_FAIL_MESSAGES.DB_ERROR;
}

/** 데모 submitCS · saveCSReply · csClose 의 toast 원문 */
export const CS_DONE_MESSAGES = {
  // 알림 채널은 이메일(2026-09-22 · packages/db/src/mail) — 이메일이 없는 고객(비회원 미입력 · 카카오)은 화면에서만 확인한다
  opened: (brandName: string | null) => `문의가 ${brandName ?? "브랜드"}에 접수되었습니다 — 답변이 달리면 이메일로 안내됩니다`,
  replied: "답변 전송 — 고객에게 이메일로 안내됩니다(이메일이 있는 경우)",
  closed: "처리 종료로 변경했습니다",
  customerReplied: "추가 문의를 보냈어요 — 브랜드가 확인하면 답변이 달립니다",
} as const;

export type CsChipTone = "amber" | "green" | "gray";

/** 데모 cs/+page.svelte 의 M 표 그대로 */
export const CS_STATUS_CHIPS: Record<CsStatus, { label: string; tone: CsChipTone }> = {
  OPEN: { label: "답변 대기", tone: "amber" },
  ANSWERED: { label: "답변 완료", tone: "green" },
  CLOSED: { label: "처리 종료", tone: "gray" },
};

export function csStatusChip(status: string): { label: string; tone: CsChipTone } {
  return isCsStatus(status) ? CS_STATUS_CHIPS[status] : { label: status, tone: "gray" };
}

export function csSenderLabel(sender: CsMessage["sender"], brandName?: string | null): string {
  if (sender === "customer") return "고객";
  if (sender === "admin") return "셀러리 운영팀";
  return brandName || "브랜드";
}

/** 브랜드 문의함 정렬 — OPEN → ANSWERED → CLOSED, 같은 상태는 최근 메시지순 (RPC 도 같은 순서 · 클라이언트 재정렬용) */
export function sortCsConversations(list: readonly CsConversation[]): CsConversation[] {
  const rank: Record<CsStatus, number> = { OPEN: 0, ANSWERED: 1, CLOSED: 2 };
  return [...list].sort((a, b) => rank[a.status] - rank[b.status] || (a.last_message_at < b.last_message_at ? 1 : a.last_message_at > b.last_message_at ? -1 : 0));
}

export function countCsOpen(list: readonly CsConversation[]): number {
  return list.filter((x) => x.status === "OPEN").length;
}

/* ---------------- 비회원 토큰 쿠키 (shop) ---------------- */

/** `slry_cs_<code>` = client_token — 접수 응답에서 1회 받아 HttpOnly 쿠키로 보관, 스레드 조회·추가 문의에 사용. 회원은 user_id 로 조회하므로 쿠키가 없어도 된다 */
export const CS_TOKEN_COOKIE = "slry_cs_";
export const CS_TOKEN_COOKIE_DAYS = 90;

export function csTokenCookieName(conversationCode: string): string {
  return `${CS_TOKEN_COOKIE}${conversationCode.toLowerCase()}`;
}
