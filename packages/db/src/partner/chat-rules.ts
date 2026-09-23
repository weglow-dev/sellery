/**
 * 캠페인 스레드 채팅 규칙 — 순수 모듈 (두 콘솔의 `.svelte` 와 서버 양쪽). DB 호출은 `../server/partner/chat.server.ts` (`sendCampaignChat` — 인플루언서·브랜드 공용).
 * 원본: 프로토타입 helpers.ts pushChat(연락처/카톡 감지 → warn 행) · actions.ts sendChat · 0003 campaign_events(kind chat · leak_flag) · 0016 app_campaign_chat / campaign_leak_detected.
 *
 *   LEAK_RE · detectLeak(body)     감지 정규식 — packages/core helpers.ts pushChat 과 0016 campaign_leak_detected 와 **같은 값** (바꾸면 셋 다)
 *   CHAT_MAX · parseChatInput(form) 본문 1~1000자 · 제어문자 제거(개행 유지)
 *   LEAK_WARNING                    경고 문구 (0016 이 leak_warned 시스템 행으로도 남긴다 — 화면은 행을 그리면 되고 이 상수는 전송 전 미리보기용)
 *   parseChatResult(json) · CHAT_FAIL_MESSAGES · chatFailMessage
 *   senderLabel(sender, names)      발신자 표시명 (프로토타입 L3564: brand → 브랜드명 · admin → 셀러리 운영팀)
 */

/** 프로토타입 pushChat: `/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|카카오톡|kakao/i` */
export const LEAK_RE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|카카오톡|kakao/i;

/** 연락처(휴대전화) · 카톡/카카오/kakao 언급 감지 */
export function detectLeak(body: string): boolean {
  return typeof body === "string" && LEAK_RE.test(body);
}

/** 프로토타입 warn 행 원문 (⚠ 이모지 제외 — 0016 leak_warned body 와 같은 값) */
export const LEAK_WARNING = "연락처/외부 메신저 공유가 감지되었습니다. 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.";

export const CHAT_MAX = 1000;

/** 제어문자 제거(탭·개행은 유지) + 앞뒤 공백 제거 — 0016 과 같은 정규화. 이모지는 남긴다(채팅은 CSV·택배사로 흐르지 않는다). */
export function normalizeChatBody(s: string): string {
  if (typeof s !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/\r\n?/g, "\n").trim();
}

export type ParsedChat = { ok: true; body: string; leak: boolean } | { ok: false; field: "body"; message: string };

export const CHAT_FIELD_MESSAGES = {
  empty: "내용을 입력해주세요",
  long: `메시지는 ${CHAT_MAX}자까지 보낼 수 있어요`,
} as const;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

/** FormData · 객체(`body`) → 본문. 비면 empty · 1000자 초과면 long. `leak` 는 전송 전 안내용(판정은 DB 가 다시 한다). */
export function parseChatInput(raw: unknown): ParsedChat {
  const src: Obj | null =
    typeof FormData !== "undefined" && raw instanceof FormData
      ? Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"))
      : obj(raw);
  const body = normalizeChatBody(str(src?.body));
  if (!body) return { ok: false, field: "body", message: CHAT_FIELD_MESSAGES.empty };
  if (body.length > CHAT_MAX) return { ok: false, field: "body", message: CHAT_FIELD_MESSAGES.long };
  return { ok: true, body, leak: detectLeak(body) };
}

/* ---------------- app_campaign_chat 결과 ---------------- */

export type ChatEvent = {
  id: string;
  campaign_id: string | null;
  kind: "chat" | "system";
  sender: "seller" | "brand" | "admin" | "system";
  actor_role: string | null;
  body: string;
  event_type: string | null;
  payload: unknown;
  leak_flag: boolean;
  created_at: string;
};

export type ChatCode = "BAD_ROLE" | "NOT_FOUND" | "BAD_BODY" | "DB_ERROR";

export const CHAT_CODES: readonly ChatCode[] = ["BAD_ROLE", "NOT_FOUND", "BAD_BODY", "DB_ERROR"];

export function isChatCode(v: unknown): v is ChatCode {
  return typeof v === "string" && (CHAT_CODES as readonly string[]).includes(v);
}

export type ChatResult =
  | { ok: true; campaignId: string; campaignCode: string; event: ChatEvent; leak: boolean; warnEventId: string | null }
  | { ok: false; code: ChatCode };

export function parseChatEvent(json: unknown): ChatEvent | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  if (!id) return null;
  return {
    id,
    campaign_id: strOrNull(o.campaign_id),
    kind: o.kind === "chat" ? "chat" : "system",
    sender: o.sender === "seller" || o.sender === "brand" || o.sender === "admin" ? o.sender : "system",
    actor_role: strOrNull(o.actor_role),
    body: str(o.body),
    event_type: strOrNull(o.event_type),
    payload: o.payload ?? null,
    leak_flag: o.leak_flag === true,
    created_at: str(o.created_at),
  };
}

export function parseChatResult(json: unknown): ChatResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = strOrNull(o.campaign_id);
    const campaignCode = strOrNull(o.campaign_code);
    const event = parseChatEvent(o.event);
    if (!campaignId || !campaignCode || !event) return { ok: false, code: "DB_ERROR" };
    return { ok: true, campaignId, campaignCode, event, leak: o.leak_flag === true, warnEventId: strOrNull(o.warn_event_id) };
  }
  return { ok: false, code: isChatCode(o.code) ? o.code : "DB_ERROR" };
}

export const CHAT_FAIL_MESSAGES: Record<ChatCode, string> = {
  BAD_ROLE: "보낼 수 없는 계정이에요 — 다시 로그인해주세요",
  NOT_FOUND: "캠페인을 찾을 수 없어요",
  BAD_BODY: CHAT_FIELD_MESSAGES.long,
  DB_ERROR: "전송 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function chatFailMessage(r: { code: string }): string {
  return isChatCode(r.code) ? CHAT_FAIL_MESSAGES[r.code] : CHAT_FAIL_MESSAGES.DB_ERROR;
}

/**
 * 발신자 표시명 — 프로토타입 L3564: seller → 인플루언서 이름 · brand → 브랜드명 · system → 시스템.
 *
 * `admin` 은 **"셀러리 관리자"**. 프로토타입은 관리자 발신을 브랜드 이름으로 위장했지만(`sendChat` 이
 * `S.role !== 'seller'` 를 모두 `'brand'` 로 저장), 브랜드가 쓰지 않은 말이 브랜드 이름으로 남으면
 * 브랜드 콘솔에서 분쟁이 된다. 운영 결정(2026-09-23)으로 **드러내고 인증 배지를 붙인다**.
 * `isOfficialSender()` 가 배지를 달 자리를 알려준다.
 */
export function senderLabel(sender: string, names: { seller?: string | null; brand?: string | null } = {}): string {
  switch (sender) {
    case "seller":
      return names.seller || "인플루언서";
    case "brand":
      return names.brand || "브랜드";
    case "admin":
      return "셀러리 관리자";
    default:
      return "시스템";
  }
}

/** 셀러리 공식 발신인가 — true 면 화면이 인증 배지를 붙인다(관리자 대행 발신을 숨기지 않는다) */
export function isOfficialSender(sender: string): boolean {
  return sender === "admin";
}

/** 내가 보낸 말풍선인가 (오른쪽 정렬) */
export function isMine(sender: string, myRole: "seller" | "brand"): boolean {
  return sender === myRole;
}
