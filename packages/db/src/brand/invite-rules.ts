/**
 * 브랜드 직접 제안(초대) 규칙 — 순수 모듈 (`/brand/campaigns/invite` 폼 · 서버 양쪽). DB 호출은 `../server/brand/invite.server.ts`.
 * 원본: 프로토타입 inviteModal(노출 중 상품만 · 메시지) · actions.ts confirmInvite(독점 확정 상품 불가 · 다이아/블랙 🥬 10) · 0016 app_brand_invite_candidates / app_brand_invite_seller.
 *
 *   INVITE_MAX_GRADE · INVITE_GATED_GRADES · isInvitableGrade(grade)   **0036 이전**의 등급 게이트. 지금은 모든 등급을 제안할 수 있고
 *     다이아·블랙만 🥬 제안권(`grade_tiers.invite_cost_cel` 10)이 든다. 세 심볼은 "이 등급은 유료" 를 묻는 표시용으로만 남는다.
 *   inviteCostLine(cost) · INVITE_COST_NOTICE                            제안권 비용 안내 (후보 행의 `cost_cel`·`affordable`)
 *   INVITE_MESSAGE_MAX · parseInviteInput(form)                          seller_id(uuid) · product_id(uuid) · message ≤ 500
 *   parseInviteCandidates(json)                                          app_brand_invite_candidates jsonb → { product, candidates } (ok:false 는 null)
 *   parseInviteResult(json) · INVITE_FAIL_MESSAGES · inviteFailMessage   app_brand_invite_seller 결과
 */
import { GRADES } from "@sellery/core/constants";
import { cleanText } from "../text";

/* ---------------- 등급 게이트 ---------------- */

/** 제안권이 **무료**인 최고 등급 (`grade_tiers.invite_cost_cel = 0` 중 최상위 — 플래티넘은 기간 우선권은 있어도 제안권은 무료). */
export const INVITE_MAX_GRADE = "플래티넘";

/** 제안권이 **유료**인 등급(다이아·블랙 · `invite_cost_cel` 10). 0036 부터 차단이 아니라 과금이다. */
export const INVITE_GATED_GRADES: readonly string[] = GRADES.slice(0, GRADES.findIndex((g) => g.g === INVITE_MAX_GRADE)).map((g) => g.g);

/** 제안권이 무료인 등급인가. 0036 부터 "초대 가능" 이 아니라 "무료" 를 뜻한다. */
export function isInvitableGrade(grade: string | null | undefined): boolean {
  return !!grade && !INVITE_GATED_GRADES.includes(grade);
}

/** 제안권 안내 (0036) */
export const INVITE_COST_NOTICE = "다이아 · 블랙 인플루언서 제안에는 🥬 제안권 10개가 들어요 — 거절되면 전액 환급됩니다";

/** 후보 행의 비용 한 줄. 무료면 null(표시하지 않는다). */
export function inviteCostLine(costCel: number | null | undefined, affordable = true): string | null {
  if (!costCel || costCel <= 0) return null;
  return affordable ? `제안권 🥬 ${costCel}` : `제안권 🥬 ${costCel} — 잔액 부족`;
}

/* ---------------- 폼 ---------------- */

export const INVITE_MESSAGE_MAX = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InviteField = "seller_id" | "product_id" | "message";

export const INVITE_FIELD_MESSAGES: Record<InviteField, string> = {
  seller_id: "제안할 인플루언서를 선택하세요",
  product_id: "제안할 상품을 선택하세요 (노출 중인 상품만)",
  message: `메시지는 ${INVITE_MESSAGE_MAX}자까지예요`,
};

export type ParsedInvite = { ok: true; sellerId: string; productId: string; message: string | null } | { ok: false; field: InviteField; message: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const intOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const int = (v: unknown, d = 0): number => intOrNull(v) ?? d;

/**
 * FormData · 객체 → 초대 입력. 메시지는 제어문자만 제거하고 개행은 남긴다(채팅 본문과 같은 규칙 — cleanText 는 이모지까지 지우므로 쓰지 않는다);
 * 넘치면 실패(잘라서 보내지 않는다 — 브랜드가 쓴 문장을 임의로 자르지 않기 위해).
 */
export function parseInviteInput(raw: unknown): ParsedInvite {
  const src: Obj | null =
    typeof FormData !== "undefined" && raw instanceof FormData
      ? Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"))
      : obj(raw);
  const sellerId = str(src?.seller_id).trim();
  if (!UUID_RE.test(sellerId)) return { ok: false, field: "seller_id", message: INVITE_FIELD_MESSAGES.seller_id };
  const productId = str(src?.product_id).trim();
  if (!UUID_RE.test(productId)) return { ok: false, field: "product_id", message: INVITE_FIELD_MESSAGES.product_id };
  // eslint-disable-next-line no-control-regex
  const message = str(src?.message).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/\r\n?/g, "\n").trim();
  if (message.length > INVITE_MESSAGE_MAX) return { ok: false, field: "message", message: INVITE_FIELD_MESSAGES.message };
  return { ok: true, sellerId, productId, message: message || null };
}

/** 초대 화면의 인플루언서 검색 — 이름·핸들 부분 일치(대소문자 무시 · 공백 정리) */
export function matchesCandidateQuery(c: Pick<InviteCandidate, "name" | "handle">, q: string): boolean {
  const k = cleanText(q).toLowerCase();
  if (!k) return true;
  return c.name.toLowerCase().includes(k) || c.handle.toLowerCase().includes(k);
}

/* ---------------- app_brand_invite_candidates ---------------- */

export type InviteCandidate = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  platform: string;
  avatar_url: string | null;
  grade: string | null;
  followers: number;
  category: string | null;
  /** 상품 카테고리와 같은 그룹(건강기능식품 / 이너뷰티) — 프로토타입 catFit */
  category_fit: boolean;
  /** 비공개 프로필인데 레퍼런스를 열람해서 보이는 인플루언서 (0036). 화면이 배지를 단다. */
  hidden: boolean;
  /** 제안권 비용 🥬 (0036 · `grade_tiers.invite_cost_cel`). 0 이면 무료. */
  cost_cel: number;
  /** 브랜드 잔액으로 이 제안이 가능한가 (0036). false 면 화면이 버튼을 막는다. */
  affordable: boolean;
  primary_channel: { platform: string; handle: string; url: string | null; followers: number; verified: boolean } | null;
};

export type InviteCandidates = {
  product: { id: string; code: string | null; name: string; category: string; status: string; exclusive_seller_id: string | null };
  candidates: InviteCandidate[];
  /** 브랜드 🥬 잔액 (0036) — 제안권 안내에 쓴다. */
  balance: number;
};

export function parseInviteCandidate(json: unknown): InviteCandidate | null {
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
    category: strOrNull(o.category),
    category_fit: o.category_fit === true,
    hidden: o.hidden === true,
    cost_cel: int(o.cost_cel),
    // 0036 이전 응답에는 없다 — 그때는 "가능" 으로 본다(게이트가 RPC 안에 있었다)
    affordable: o.affordable !== false,
    primary_channel: ch
      ? { platform: str(ch.platform), handle: str(ch.handle), url: strOrNull(ch.url), followers: int(ch.followers), verified: ch.verified === true }
      : null,
  };
}

/** jsonb → 후보 목록. ok:false(NOT_FOUND · NOT_LISTED) 나 형식 위반은 null — 라우트는 "노출 중인 상품이 아니에요" 로. */
export function parseInviteCandidates(json: unknown): InviteCandidates | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  const p = obj(o.product);
  const pid = p ? strOrNull(p.id) : null;
  const pname = p ? strOrNull(p.name) : null;
  if (!p || !pid || !pname) return null;
  return {
    product: { id: pid, code: strOrNull(p.code), name: pname, category: str(p.category), status: str(p.status), exclusive_seller_id: strOrNull(p.exclusive_seller_id) },
    candidates: Array.isArray(o.candidates) ? o.candidates.map(parseInviteCandidate).filter((c): c is InviteCandidate => c !== null) : [],
    balance: int(o.balance),
  };
}

/* ---------------- app_brand_invite_seller 결과 ---------------- */

export type InviteCode =
  | "NOT_FOUND"
  | "NOT_LISTED"
  | "SELLER_NOT_FOUND"
  | "SELLER_HIDDEN"
  | "PRIORITY_INVITE_GATED"
  | "REF_NOT_UNLOCKED"
  | "CEL_INSUFFICIENT"
  | "EXCLUSIVE_LOCKED"
  | "ALREADY_ACTIVE"
  | "BAD_MESSAGE"
  | "DB_ERROR";

export const INVITE_CODES: readonly InviteCode[] = [
  "NOT_FOUND",
  "NOT_LISTED",
  "SELLER_NOT_FOUND",
  "SELLER_HIDDEN",
  "PRIORITY_INVITE_GATED",
  "REF_NOT_UNLOCKED",
  "CEL_INSUFFICIENT",
  "EXCLUSIVE_LOCKED",
  "ALREADY_ACTIVE",
  "BAD_MESSAGE",
  "DB_ERROR",
];

export function isInviteCode(v: unknown): v is InviteCode {
  return typeof v === "string" && (INVITE_CODES as readonly string[]).includes(v);
}

export type InviteResult =
  | {
      ok: true;
      campaignId: string;
      campaignCode: string;
      status: string;
      /** 쓴 제안권 🥬 (0036). 0 이면 무료 등급. 거절되면 전액 환급된다. */
      celUsed: number;
      seller: { id: string; name: string; handle: string; grade: string | null } | null;
    }
  | {
      ok: false;
      code: InviteCode;
      /** NOT_LISTED */
      status?: string | null;
      /** PRIORITY_INVITE_GATED · CEL_INSUFFICIENT · REF_NOT_UNLOCKED */
      grade?: string | null;
      /** 제안권 비용(CEL_INSUFFICIENT) 또는 레퍼런스 열람가(REF_NOT_UNLOCKED) */
      costCel?: number | null;
      /** ALREADY_ACTIVE */
      campaignCode?: string | null;
      campaignStatus?: string | null;
    };

export function parseInviteResult(json: unknown): InviteResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = strOrNull(o.campaign_id);
    const campaignCode = strOrNull(o.campaign_code);
    if (!campaignId || !campaignCode) return { ok: false, code: "DB_ERROR" };
    const s = obj(o.seller);
    const sid = s ? strOrNull(s.id) : null;
    return {
      ok: true,
      campaignId,
      campaignCode,
      status: str(o.status, "INVITED"),
      celUsed: int(o.cel_used),
      seller: s && sid ? { id: sid, name: str(s.name), handle: str(s.handle), grade: strOrNull(s.grade) } : null,
    };
  }
  return {
    ok: false,
    code: isInviteCode(o.code) ? o.code : "DB_ERROR",
    status: strOrNull(o.status),
    grade: strOrNull(o.grade),
    // CEL_INSUFFICIENT · PRIORITY_INVITE_GATED 는 제안권 비용, REF_NOT_UNLOCKED 는 열람가를 준다
    costCel: intOrNull(o.cost_cel) ?? intOrNull(o.price_cel),
    campaignCode: strOrNull(o.campaign_code),
    campaignStatus: strOrNull(o.campaign_status),
  };
}

/** 실패 코드 → 문구 (프로토타입 confirmInvite · inviteModal 토스트 원문) */
export const INVITE_FAIL_MESSAGES: Record<InviteCode, string> = {
  NOT_FOUND: "상품을 찾을 수 없어요",
  NOT_LISTED: "노출 중인 상품만 제안할 수 있어요 — 상품을 먼저 노출하세요",
  SELLER_NOT_FOUND: "인플루언서를 찾을 수 없어요",
  // 0036 이전 코드 — 이제 RPC 가 내지 않지만 배포 순서상 섞일 수 있어 문구는 남긴다
  SELLER_HIDDEN: "익명 인플루언서는 갤러리에서 레퍼런스를 열람한 뒤에 제안할 수 있어요",
  PRIORITY_INVITE_GATED: INVITE_COST_NOTICE,
  // 0036
  REF_NOT_UNLOCKED: "익명 인플루언서예요 — 갤러리에서 레퍼런스를 열람하면 제안할 수 있어요",
  CEL_INSUFFICIENT: "셀러리가 부족해요 — 판매가 쌓이면 자동으로 적립됩니다",
  EXCLUSIVE_LOCKED: "이 상품은 독점 인플루언서가 확정되어 다른 인플루언서에게 제안할 수 없습니다",
  ALREADY_ACTIVE: "이 인플루언서와는 같은 상품으로 진행 중인 캠페인이 있어요",
  BAD_MESSAGE: INVITE_FIELD_MESSAGES.message,
  DB_ERROR: "처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function inviteFailMessage(r: Extract<InviteResult, { ok: false }>): string {
  if (r.code === "CEL_INSUFFICIENT" && r.costCel)
    return `${r.grade ?? ""} 등급 제안에는 🥬 제안권 ${r.costCel}개가 필요해요 — 판매가 쌓이면 자동으로 적립됩니다`.trim();
  if (r.code === "REF_NOT_UNLOCKED")
    return `익명 인플루언서예요 — 갤러리에서 레퍼런스를 열람하면(🥬 ${r.costCel ?? ""}) 제안할 수 있어요`.replace("(🥬 )", "");
  if (r.code === "PRIORITY_INVITE_GATED" && r.grade) return `${r.grade} 등급 인플루언서 제안은 🥬 제안권${r.costCel ? ` ${r.costCel}개` : ""}과 함께 다음 단계에서 열려요`;
  if (r.code === "ALREADY_ACTIVE" && r.campaignCode) return `이 인플루언서와는 같은 상품으로 진행 중인 캠페인(${r.campaignCode})이 있어요`;
  return INVITE_FAIL_MESSAGES[r.code];
}

/** 성공 토스트 (프로토타입 confirmInvite 원문) */
export function inviteDoneMessage(sellerName: string | null): string {
  return `${sellerName ? sellerName + "님" : "인플루언서"}에게 제안 발송 — 수락 대기`;
}
