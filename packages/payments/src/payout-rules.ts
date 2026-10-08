/**
 * 토스페이먼츠 지급대행(Payouts) 규칙 — 순수 모듈 (브라우저 `.svelte` · 서버 · 테스트 공용 · 비밀 없음). HTTP 는 `server/toss-payouts.server.ts`, DB 글루는 `server/payouts.server.ts`.
 * 문서: docs.tosspayments.com/guides/v2/payouts · /reference/additional (2026-10-07 확인).
 *
 *   셀러 등록 본문  buildTossSellerPayload({ payeeType, refSellerId, settleType, name, email, phone, bizNo, company, ceo, bank })
 *                  → { ok:true, body } | { ok:false, code: BANK_MISSING | BANK_CODE_UNKNOWN | BAD_ACCOUNT | HOLDER_REQUIRED | NAME_REQUIRED | EMAIL_REQUIRED | PHONE_MISSING | BIZ_NO_REQUIRED | BAD_REF }
 *     businessType  INDIVIDUAL(개인 인플루언서) · INDIVIDUAL_BUSINESS / CORPORATE(사업자 — 사업자등록번호 가운데 2자리로 판별 `businessTypeOfBizNo`)
 *     company       { name, representativeName, businessRegistrationNumber(10자리), email, phone(숫자만) } · individual { name, email, phone }
 *     account       { bankCode(3자리 · @sellery/db/partner/bank-codes), accountNumber(숫자만 ≤14), holderName(≤50) }
 *     refSellerId   7~20자 — `tossRefId('s'|'b', uuid)` = 접두 + uuid 앞 18자(하이픈 제거) → 20자
 *   지급 요청 본문  buildTossPayoutItem({ payoutId, tossSellerId, amount, scheduleType, payoutDate, description, metadata }) → 1건 · refPayoutId = payouts.id(36자 ≤ 50)
 *                  chunkPayouts(items, 100) · TOSS_PAYOUT_MAX_PER_REQUEST 100 · TOSS_PAYOUT_MAX_AMOUNT 10억 미만 · transactionDescription ≤ 7자('셀러리정산')
 *   웹훅           parseSellerWebhook(json) · parsePayoutWebhook(json) → { eventType, createdAt, data } | null — 본문은 **재조회 전까지 믿지 않는다**(서명 없음)
 *   상태           TOSS_SELLER_STATUSES · TOSS_PAYOUT_STATUSES · tossSellerReady(status) · payoutInFlight(status) · payoutRequestable(status)
 *   문구           tossSellerStatusLine(status, error, settleType) — 파트너 /settle 의 "계좌 확인" 줄 · TOSS_SELLER_STATUS_LABEL · TOSS_PAYOUT_STATUS_LABEL
 *   영업일         nextBusinessDay(ymd) — SCHEDULED 기본값(주말만 건너뜀 · 공휴일은 토스가 거절하므로 재요청)
 */
import { tossBankCodeOf } from "@sellery/db/partner/bank-codes";

/* ---------------- 상태 ---------------- */

export const TOSS_SELLER_STATUSES = ["APPROVAL_REQUIRED", "PARTIALLY_APPROVED", "KYC_REQUIRED", "APPROVED"] as const;
export type TossSellerStatus = (typeof TOSS_SELLER_STATUSES)[number];

export const TOSS_PAYOUT_STATUSES = ["REQUESTED", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELED", "REJECTED", "DELETED"] as const;
export type TossPayoutStatus = (typeof TOSS_PAYOUT_STATUSES)[number];

export const TOSS_BUSINESS_TYPES = ["INDIVIDUAL", "INDIVIDUAL_BUSINESS", "CORPORATE"] as const;
export type TossBusinessType = (typeof TOSS_BUSINESS_TYPES)[number];

export function isTossSellerStatus(v: unknown): v is TossSellerStatus {
  return typeof v === "string" && (TOSS_SELLER_STATUSES as readonly string[]).includes(v);
}
export function isTossPayoutStatus(v: unknown): v is TossPayoutStatus {
  return typeof v === "string" && (TOSS_PAYOUT_STATUSES as readonly string[]).includes(v);
}

/** 지급 가능한 셀러 상태 — PARTIALLY_APPROVED(주 1천만 이하) · APPROVED */
export function tossSellerReady(status: string | null | undefined): boolean {
  return status === "PARTIALLY_APPROVED" || status === "APPROVED";
}
/** 토스가 처리 중 — 재요청 · 취소 외 손대지 않는다 */
export function payoutInFlight(status: string | null | undefined): boolean {
  return status === "REQUESTED" || status === "IN_PROGRESS";
}
/** 다시 요청할 수 있는 토스 상태(없음 · 실패 · 취소 · 거절 · 삭제) */
export function payoutRequestable(status: string | null | undefined): boolean {
  return !status || status === "FAILED" || status === "CANCELED" || status === "REJECTED" || status === "DELETED";
}

export const TOSS_SELLER_STATUS_LABEL: Record<TossSellerStatus, string> = {
  APPROVAL_REQUIRED: "본인인증 필요",
  PARTIALLY_APPROVED: "지급 가능 (주 1천만 원 한도)",
  KYC_REQUIRED: "KYC 심사 중",
  APPROVED: "지급 가능",
};

export const TOSS_PAYOUT_STATUS_LABEL: Record<TossPayoutStatus, string> = {
  REQUESTED: "지급 요청됨",
  IN_PROGRESS: "이체 진행 중",
  COMPLETED: "이체 완료",
  FAILED: "이체 실패",
  CANCELED: "요청 취소",
  REJECTED: "토스 거절",
  DELETED: "삭제됨",
};

export type TossSellerError = { code?: string | null; message?: string | null; at?: string | null } | null;

/**
 * 파트너 /settle 의 한 줄 — 정산 정보 저장 뒤 토스 셀러 상태.
 *   없음(null · 오류 없음)   "계좌 확인 중 — 저장하면 토스에 계좌를 등록해요"(tone info)
 *   오류                    "계좌 오류: <토스 메시지>"(danger)
 *   APPROVAL_REQUIRED       개인: "계좌 확인됨 · 본인인증 필요 — 토스에서 보낸 문자를 확인해주세요" · 사업자: "계좌 확인됨 · 대표자 본인인증 필요 …"
 *   PARTIALLY_APPROVED      "지급 가능 (주 1천만 원까지 · 초과 시 토스 KYC)"
 *   KYC_REQUIRED            "토스 KYC 심사 중 — 완료되면 지급이 이어집니다"
 *   APPROVED                "지급 가능"
 */
export function tossSellerStatusLine(
  status: string | null | undefined,
  error: TossSellerError,
  settleType?: string | null,
): { label: string; tone: "green" | "amber" | "red" | "blue" | "gray"; sub: string | null } {
  if (error && (error.code || error.message)) {
    return { label: "계좌 오류", tone: "red", sub: error.message ? `${error.message}${error.code ? ` (${error.code})` : ""}` : (error.code ?? null) };
  }
  switch (status) {
    case "APPROVED":
      return { label: "지급 가능", tone: "green", sub: null };
    case "PARTIALLY_APPROVED":
      return { label: "지급 가능", tone: "green", sub: "주 1천만 원까지 · 초과분은 토스 KYC 심사 뒤" };
    case "KYC_REQUIRED":
      return { label: "토스 KYC 심사 중", tone: "amber", sub: "심사가 끝나면 지급이 이어집니다 — 토스에서 안내 문자를 보내요" };
    case "APPROVAL_REQUIRED":
      return {
        label: "계좌 확인됨 · 본인인증 필요",
        tone: "amber",
        sub: settleType === "biz" ? "토스에서 대표자 휴대폰으로 보낸 본인인증 문자를 확인해주세요" : "토스에서 보낸 본인인증 문자를 확인해주세요 — 인증 전에는 지급이 보류돼요",
      };
    default:
      return { label: "계좌 확인 중", tone: "blue", sub: "정산 정보를 저장하면 토스 지급대행에 계좌를 등록해요" };
  }
}

/* ---------------- 셀러 등록 본문 ---------------- */

export const TOSS_REF_SELLER_ID_RE = /^[A-Za-z0-9_-]{7,20}$/;

/** refSellerId — 접두('s' 인플루언서 · 'b' 브랜드) + uuid 하이픈 제거 앞 18자 = 19자 (7~20자 제약) */
export function tossRefId(prefix: "s" | "b", uuid: string): string {
  return `${prefix}${String(uuid).replace(/-/g, "").slice(0, 18)}`;
}

/**
 * 사업자등록번호 가운데 2자리(개인/법인 구분 코드)로 토스 businessType 을 고른다.
 *   01~79 개인 과세 · 90~99 개인 면세 → INDIVIDUAL_BUSINESS · 80~89(법인 · 비영리 · 단체) → CORPORATE. 형식이 아니면 null.
 */
export function businessTypeOfBizNo(bizNo: string | null | undefined): "INDIVIDUAL_BUSINESS" | "CORPORATE" | null {
  const d = String(bizNo ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(d)) return null;
  const mid = Number(d.slice(3, 5));
  return mid >= 80 && mid <= 89 ? "CORPORATE" : "INDIVIDUAL_BUSINESS";
}

export type TossSellerInput = {
  payeeType: "seller" | "brand";
  /** sellers.id · brands.id */
  payeeId: string;
  /** 인플루언서 settle_type personal|biz · 브랜드는 항상 사업자 */
  settleType?: string | null;
  /** 활동명 · 상호 */
  name: string | null | undefined;
  /** 계정 이메일 (≤100) */
  email: string | null | undefined;
  /** 본인인증 번호 — 인플루언서 settle_phone · 브랜드 manager_phone */
  phone: string | null | undefined;
  bizNo?: string | null;
  /** 사업자: 세금계산서 정보의 상호(없으면 name) · 대표자(없으면 예금주) */
  company?: string | null;
  ceo?: string | null;
  bank: { bank: string | null | undefined; account: string | null | undefined; holder: string | null | undefined } | null | undefined;
  /** 토스에 넘기는 메타(≤5쌍) — 기본 { payee_type, payee_id } */
  metadata?: Record<string, string>;
};

export type TossSellerBody = {
  refSellerId: string;
  businessType: TossBusinessType;
  individual?: { name: string; email: string; phone: string };
  company?: { name: string; representativeName: string; businessRegistrationNumber: string; email: string; phone: string };
  account: { bankCode: string; accountNumber: string; holderName: string };
  metadata?: Record<string, string>;
};

export type TossSellerBuild = { ok: true; body: TossSellerBody } | { ok: false; code: string; field?: string };

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildTossSellerPayload(input: TossSellerInput): TossSellerBuild {
  const refSellerId = tossRefId(input.payeeType === "brand" ? "b" : "s", input.payeeId);
  if (!TOSS_REF_SELLER_ID_RE.test(refSellerId)) return { ok: false, code: "BAD_REF" };
  const bank = input.bank;
  if (!bank || !bank.account) return { ok: false, code: "BANK_MISSING", field: "bank" };
  const bankCode = tossBankCodeOf(bank.bank);
  if (!bankCode) return { ok: false, code: "BANK_CODE_UNKNOWN", field: "bank" };
  const accountNumber = digits(bank.account);
  if (!/^\d{8,14}$/.test(accountNumber)) return { ok: false, code: "BAD_ACCOUNT", field: "account" };
  const holderName = clean(bank.holder, 50);
  if (!holderName) return { ok: false, code: "HOLDER_REQUIRED", field: "holder" };
  const email = clean(input.email, 100).toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, code: "EMAIL_REQUIRED", field: "email" };
  const phone = digits(input.phone);
  if (!/^\d{8,15}$/.test(phone)) return { ok: false, code: "PHONE_MISSING", field: "phone" };
  const name = clean(input.name, 50);
  if (!name) return { ok: false, code: "NAME_REQUIRED", field: "name" };
  const metadata = input.metadata ?? { payee_type: input.payeeType, payee_id: input.payeeId };
  const account = { bankCode, accountNumber, holderName };

  const isBiz = input.payeeType === "brand" || input.settleType === "biz";
  if (!isBiz) {
    return { ok: true, body: { refSellerId, businessType: "INDIVIDUAL", individual: { name, email, phone }, account, metadata } };
  }
  const bizNo = digits(input.bizNo);
  const businessType = businessTypeOfBizNo(bizNo);
  if (!businessType) return { ok: false, code: "BIZ_NO_REQUIRED", field: "biz_no" };
  return {
    ok: true,
    body: {
      refSellerId,
      businessType,
      company: {
        name: clean(input.company, 50) || name,
        representativeName: clean(input.ceo, 50) || holderName,
        businessRegistrationNumber: bizNo,
        email,
        phone,
      },
      account,
      metadata,
    },
  };
}

/* ---------------- 지급 요청 본문 ---------------- */

export const TOSS_PAYOUT_MAX_PER_REQUEST = 100;
/** 건당 10억 원 미만 */
export const TOSS_PAYOUT_MAX_AMOUNT = 1_000_000_000;
/** transactionDescription ≤ 7자 — 입금 통장에 찍히는 글자 */
export const TOSS_PAYOUT_DESCRIPTION = "셀러리정산";

export type TossScheduleType = "EXPRESS" | "SCHEDULED";

export type TossPayoutItemInput = {
  /** payouts.id — refPayoutId(≤50) · 토스 멱등 기준 */
  payoutId: string;
  tossSellerId: string;
  amount: number;
  scheduleType: TossScheduleType;
  /** SCHEDULED 면 yyyy-MM-dd(다음 영업일 이후 · 1년 이내) */
  payoutDate?: string | null;
  description?: string;
  metadata?: Record<string, string>;
};

export type TossPayoutItem = {
  refPayoutId: string;
  destination: string;
  scheduleType: TossScheduleType;
  payoutDate?: string;
  amount: { currency: "KRW"; value: number };
  transactionDescription: string;
  metadata?: Record<string, string>;
};

export type TossPayoutItemBuild = { ok: true; item: TossPayoutItem } | { ok: false; code: "BAD_AMOUNT" | "NO_SELLER" | "DATE_REQUIRED" | "BAD_DATE" | "BAD_REF" };

export function buildTossPayoutItem(input: TossPayoutItemInput): TossPayoutItemBuild {
  const refPayoutId = String(input.payoutId ?? "").trim();
  if (!refPayoutId || refPayoutId.length > 50) return { ok: false, code: "BAD_REF" };
  if (!input.tossSellerId) return { ok: false, code: "NO_SELLER" };
  const value = Math.round(Number(input.amount));
  if (!Number.isFinite(value) || value <= 0 || value >= TOSS_PAYOUT_MAX_AMOUNT) return { ok: false, code: "BAD_AMOUNT" };
  const item: TossPayoutItem = {
    refPayoutId,
    destination: input.tossSellerId,
    scheduleType: input.scheduleType,
    amount: { currency: "KRW", value },
    transactionDescription: clean(input.description ?? TOSS_PAYOUT_DESCRIPTION, 7) || TOSS_PAYOUT_DESCRIPTION,
  };
  if (input.scheduleType === "SCHEDULED") {
    const d = String(input.payoutDate ?? "").trim();
    if (!d) return { ok: false, code: "DATE_REQUIRED" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) return { ok: false, code: "BAD_DATE" };
    item.payoutDate = d;
  }
  if (input.metadata) item.metadata = input.metadata;
  return { ok: true, item };
}

export function chunkPayouts<T>(items: readonly T[], size = TOSS_PAYOUT_MAX_PER_REQUEST): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 다음 영업일(주말만 건너뜀 — 공휴일은 토스가 거절 → 재요청). ymd 'YYYY-MM-DD' 기준 · 결과도 ymd */
export function nextBusinessDay(fromYmd: string): string {
  const d = new Date(`${fromYmd}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** 오늘(KST) ymd */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* ---------------- 토스 응답 · 웹훅 ---------------- */

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export type TossSeller = {
  id: string;
  refSellerId: string | null;
  businessType: string | null;
  status: TossSellerStatus | string;
  account?: { bankCode?: string; accountNumber?: string; holderName?: string } | null;
  [k: string]: unknown;
};

export type TossPayout = {
  id: string;
  refPayoutId: string | null;
  destination: string | null;
  scheduleType: string | null;
  payoutDate: string | null;
  amount: { currency?: string; value?: number } | null;
  status: TossPayoutStatus | string;
  error: { code?: string; message?: string } | null;
  requestedAt: string | null;
  [k: string]: unknown;
};

export function parseTossSeller(raw: unknown): TossSeller | null {
  const o = obj(raw);
  if (!o || typeof o.id !== "string" || typeof o.status !== "string") return null;
  return { ...o, id: o.id, refSellerId: str(o.refSellerId), businessType: str(o.businessType), status: o.status, account: (obj(o.account) as TossSeller["account"]) ?? null };
}

export function parseTossPayout(raw: unknown): TossPayout | null {
  const o = obj(raw);
  if (!o || typeof o.id !== "string" || typeof o.status !== "string") return null;
  const err = obj(o.error);
  return {
    ...o,
    id: o.id,
    refPayoutId: str(o.refPayoutId),
    destination: str(o.destination),
    scheduleType: str(o.scheduleType),
    payoutDate: str(o.payoutDate),
    amount: (obj(o.amount) as TossPayout["amount"]) ?? null,
    status: o.status,
    error: err ? { code: str(err.code) ?? undefined, message: str(err.message) ?? undefined } : null,
    requestedAt: str(o.requestedAt),
  };
}

export type TossWebhook<T> = { eventType: string; createdAt: string | null; data: T };

/** `{ eventType:'seller.changed', createdAt, data:{…seller} }` — 다른 eventType 이나 모양이 다르면 null */
export function parseSellerWebhook(raw: unknown): TossWebhook<TossSeller> | null {
  const o = obj(raw);
  if (!o || o.eventType !== "seller.changed") return null;
  const data = parseTossSeller(o.data);
  return data ? { eventType: "seller.changed", createdAt: str(o.createdAt), data } : null;
}

/** `{ eventType:'payout.changed', createdAt, data:{…payout} }` */
export function parsePayoutWebhook(raw: unknown): TossWebhook<TossPayout> | null {
  const o = obj(raw);
  if (!o || o.eventType !== "payout.changed") return null;
  const data = parseTossPayout(o.data);
  return data ? { eventType: "payout.changed", createdAt: str(o.createdAt), data } : null;
}

/** 토스 지급대행 id 형식 — 웹훅 본문에서 재조회 전에 거르는 용도(영숫자 · 35자 이하) */
export const TOSS_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

/* ---------------- 지급 요청 가드 (공유 잔액 보호 · 2026-10-08 launch-prep) ---------------- */

/**
 * 토스 지급대행 상점 `peerkeamf5` 는 **다른 서비스와 잔액을 공유**한다(같은 회사 · docs/deploy.md §5.3.1). 그래서 셀러리는 한 번의 요청에서
 *   ① 토스 잔액(`availableAmount`)을 넘지 않고            → BALANCE_EXCEEDED (잔액을 못 읽으면 BALANCE_UNKNOWN — 요청하지 않는다)
 *   ② 셀러리 지급 대기 합계(requestable 행의 합)를 넘지 않고 → QUEUE_EXCEEDED (구조상 넘을 수 없지만 명시 · 테스트)
 *   ③ 하루(KST) 요청 합계가 `platform_settings.payout_daily_cap` 을 넘지 않는다 → DAILY_CAP_EXCEEDED (우리 쪽 버그가 남의 돈을 쓰지 못하게)
 * 셋 중 하나라도 걸리면 **배치 전체를 거절**한다(부분 요청 없음). 순수 함수 — 서버 글루(`server/payouts.server.ts` requestDuePayouts)와 스크립트(partner-admin.mjs)가 같은 값을 넣는다.
 */
export const PAYOUT_DAILY_CAP_DEFAULT = 5_000_000;
export const PAYOUT_DAILY_CAP_KEY = "payout_daily_cap";

export type PayoutGuardInput = {
  /** 이번 배치 합계(원) */
  batchTotal: number;
  /** 셀러리 지급 대기 합계 — requestable 행 전부의 합(원) */
  queueTotal: number;
  /** 토스 `availableAmount` · 조회 실패면 null */
  available: number | null;
  /** 오늘(KST) 이미 요청한 합계(원) — 취소·거절·실패·삭제는 제외 */
  requestedToday: number;
  /** 하루 상한(원) · 0 이하·NaN 이면 기본값 */
  dailyCap: number | null | undefined;
};

export type PayoutGuardCode = "BALANCE_UNKNOWN" | "BALANCE_EXCEEDED" | "QUEUE_EXCEEDED" | "DAILY_CAP_EXCEEDED";

export type PayoutGuardResult = { ok: true; remainingToday: number } | { ok: false; code: PayoutGuardCode; message: string; remainingToday: number };

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

/** 상한 값 정규화 — 설정이 없거나 잘못되면 기본 5,000,000 */
export function normalizeDailyCap(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : PAYOUT_DAILY_CAP_DEFAULT;
}

export function checkPayoutGuard(input: PayoutGuardInput): PayoutGuardResult {
  const cap = normalizeDailyCap(input.dailyCap);
  const requestedToday = Math.max(0, Math.round(Number(input.requestedToday) || 0));
  const remainingToday = Math.max(0, cap - requestedToday);
  const batch = Math.round(Number(input.batchTotal) || 0);
  const queue = Math.round(Number(input.queueTotal) || 0);
  if (batch > queue) {
    return { ok: false, code: "QUEUE_EXCEEDED", message: `요청 합계 ${won(batch)} 가 셀러리 지급 대기 합계 ${won(queue)} 를 넘어요 — 큐를 다시 읽어주세요`, remainingToday };
  }
  if (input.available === null || input.available === undefined || !Number.isFinite(input.available)) {
    return { ok: false, code: "BALANCE_UNKNOWN", message: "토스 잔액을 읽지 못했어요 — 공유 잔액이라 확인 없이는 요청하지 않아요. 잠시 뒤 다시 시도하세요", remainingToday };
  }
  if (batch > input.available) {
    return { ok: false, code: "BALANCE_EXCEEDED", message: `요청 합계 ${won(batch)} 가 토스 지급 가능 잔액 ${won(input.available)} 을 넘어요 — 잔액은 다른 서비스와 공유되므로 셀러리 몫만 요청하세요`, remainingToday };
  }
  if (requestedToday + batch > cap) {
    return {
      ok: false,
      code: "DAILY_CAP_EXCEEDED",
      message: `오늘 요청 ${won(requestedToday)} + 이번 ${won(batch)} 가 하루 상한 ${won(cap)} 을 넘어요 — 남은 한도 ${won(remainingToday)}. 상한은 partner-admin.mjs payout-cap <원> 으로 바꿉니다`,
      remainingToday,
    };
  }
  return { ok: true, remainingToday: remainingToday - batch };
}

/** 오늘(KST) 요청 합계에 넣을 행인지 — 토스에 요청됐고 돈이 되돌아오지 않은 상태(REQUESTED · IN_PROGRESS · COMPLETED) */
export function countsTowardDailyCap(tossPayoutStatus: string | null | undefined): boolean {
  return tossPayoutStatus === "REQUESTED" || tossPayoutStatus === "IN_PROGRESS" || tossPayoutStatus === "COMPLETED";
}

/** KST 자정(ISO · UTC 표기) — `toss_requested_at >= kstDayStartIso()` 조회용 */
export function kstDayStartIso(now: Date = new Date()): string {
  return new Date(`${todayKst(now)}T00:00:00+09:00`).toISOString();
}

/** 합계 — 숫자가 아닌 값은 0 */
export function sumAmounts(rows: readonly { amount: number | null | undefined }[]): number {
  return rows.reduce((a, r) => a + (Number.isFinite(Number(r.amount)) ? Math.round(Number(r.amount)) : 0), 0);
}
