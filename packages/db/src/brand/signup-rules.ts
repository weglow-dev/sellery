/**
 * 브랜드 가입 입력 규칙 — 클라이언트 폼(가입 · 보완 폼)과 서버(`parseBrandSignupMeta` · form action)가 **같은 규칙**을 쓴다
 * (docs/brand-console-plan.md §3 · 인플루언서 `../partner/signup-rules.ts` 의 브랜드 판). 순수 모듈 — DB 호출은 `../server/brand/signup.server.ts`.
 *
 * 프로토타입 login.html 브랜드 가입 분기(사업자번호 정규식 `\d{3}-?\d{2}-?\d{5}`) + 0001 brands 열:
 *   상호 1~40자 · 사업자등록번호(숫자 10자리 → `000-00-00000`) · 담당자 이름 1~30자 · 담당자 연락처(`0\d{1,2}-?\d{3,4}-?\d{4}`) ·
 *   카테고리(`'건강기능식품' | '이너뷰티'` — 0001 check) · 추천 코드(선택 · 다른 브랜드 ref_code 예 `VYNE-01`) · 약관 동의(필수).
 *   이메일 · 비밀번호 규칙(`EMAIL_RE` · `PASSWORD_RE`)은 인플루언서와 공유한다.
 * DB 함수 `create_brand_from_signup`(0014) 이 같은 조건을 다시 검사한다.
 */
import { cleanText } from "../text";
import { normalizeReferralInput } from "../partner/signup-rules";
import { normalizeBizNo } from "../partner/settle-rules";

export { EMAIL_RE, PASSWORD_RE, REFERRAL_RE, normalizeReferralInput } from "../partner/signup-rules";
export { normalizeBizNo, maskBizNo } from "../partner/settle-rules";

/** 0001 `brands.category` check 와 같은 값 (`CATMAP` 의 키) */
export const BRAND_CATEGORIES = ["건강기능식품", "이너뷰티"] as const;
export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

export function isBrandCategory(v: unknown): v is BrandCategory {
  return typeof v === "string" && (BRAND_CATEGORIES as readonly string[]).includes(v);
}

/** 상호 최대 길이 (DB 함수와 동일) */
export const BRAND_NAME_MAX = 40;
/** 담당자 이름 최대 길이 (DB 함수와 동일) */
export const MANAGER_NAME_MAX = 30;
/** 사업자등록번호 — 프로토타입 login.html 브랜드 가입 정규식 그대로 (하이픈은 있어도 없어도 된다). 저장 규약은 `normalizeBizNo` 의 `000-00-00000` */
export const BIZ_NO_RE = /^\d{3}-?\d{2}-?\d{5}$/;
/** 담당자 연락처 — 휴대폰(010-1234-5678) · 지역번호(02-123-4567 · 031-1234-5678) · 대표번호(0507 …). 하이픈 선택 */
export const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

/**
 * 연락처 정규화 — 숫자만 남긴 뒤 하이픈 표기(`02-XXX(X)-XXXX` · `0NN-XXX(X)-XXXX`). 형식 밖이면 null.
 * DB 함수(0014)와 같은 규칙 — 두 곳의 출력이 같아야 `/apply` 프리필과 저장값이 어긋나지 않는다.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!PHONE_RE.test(s)) return null;
  const d = s.replace(/\D/g, "");
  if (d.startsWith("02")) return `02-${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

export type BrandSignupMeta = {
  /** 상호 (cleanText · 1~40자) */
  name: string;
  /** `000-00-00000` */
  bizNo: string;
  managerName: string;
  /** 하이픈 표기 */
  managerPhone: string;
  category: BrandCategory;
  referralCode: string | null;
  /** ISO 8601 */
  termsAgreedAt: string;
};

export type BrandSignupMetaField = "name" | "biz_no" | "manager_name" | "manager_phone" | "category" | "terms";

export type BrandSignupMetaResult = { ok: true; meta: BrandSignupMeta } | { ok: false; field: BrandSignupMetaField; message: string };

export const BRAND_SIGNUP_FIELD_MESSAGES: Record<BrandSignupMetaField, string> = {
  name: `상호(브랜드명)를 입력해주세요 (${BRAND_NAME_MAX}자 이내)`,
  biz_no: "사업자등록번호는 숫자 10자리(000-00-00000)로 입력해주세요",
  manager_name: `담당자 이름을 입력해주세요 (${MANAGER_NAME_MAX}자 이내)`,
  manager_phone: "담당자 연락처를 확인해주세요 (예: 010-1234-5678)",
  category: "카테고리를 선택해주세요 (건강기능식품 · 이너뷰티)",
  terms: "이용약관과 개인정보처리방침에 동의해주세요",
};

function firstString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string") return v;
  }
  return null;
}

/**
 * `user_metadata`(signUp 의 `options.data`) 또는 보완 폼 값 → 검증된 가입 메타.
 * 받아들이는 키: `company_name`|`name` · `biz_no` · `manager_name` · `manager_phone` · `category` · `referral_code`|`ref` · `terms_agreed_at`(ISO 문자열 또는 `true`).
 * 실패하면 첫 번째 어긋난 필드와 사용자 문구(name → biz_no → manager_name → manager_phone → category → terms).
 * 클라이언트가 보낸 원문은 그대로 넘기지 않는다 — 여기서 정규화한 값만 DB 로.
 */
export function parseBrandSignupMeta(source: unknown): BrandSignupMetaResult {
  const o = source && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>) : {};

  const name = cleanText(firstString(o, ["company_name", "name"]) ?? "");
  if (!name || name.length > BRAND_NAME_MAX) return { ok: false, field: "name", message: BRAND_SIGNUP_FIELD_MESSAGES.name };

  const bizRaw = (firstString(o, ["biz_no"]) ?? "").trim();
  const bizNo = BIZ_NO_RE.test(bizRaw) ? normalizeBizNo(bizRaw) : null;
  if (!bizNo) return { ok: false, field: "biz_no", message: BRAND_SIGNUP_FIELD_MESSAGES.biz_no };

  const managerName = cleanText(firstString(o, ["manager_name"]) ?? "");
  if (!managerName || managerName.length > MANAGER_NAME_MAX) {
    return { ok: false, field: "manager_name", message: BRAND_SIGNUP_FIELD_MESSAGES.manager_name };
  }

  const managerPhone = normalizePhone(firstString(o, ["manager_phone"]));
  if (!managerPhone) return { ok: false, field: "manager_phone", message: BRAND_SIGNUP_FIELD_MESSAGES.manager_phone };

  const category = (firstString(o, ["category"]) ?? "").trim();
  if (!isBrandCategory(category)) return { ok: false, field: "category", message: BRAND_SIGNUP_FIELD_MESSAGES.category };

  const referralCode = normalizeReferralInput(firstString(o, ["referral_code", "ref"]));

  const termsRaw = o.terms_agreed_at;
  let termsAgreedAt: string | null = null;
  if (termsRaw === true) termsAgreedAt = new Date().toISOString();
  else if (typeof termsRaw === "string" && termsRaw.trim()) {
    const t = new Date(termsRaw);
    if (!Number.isNaN(t.getTime())) termsAgreedAt = t.toISOString();
  }
  if (!termsAgreedAt) return { ok: false, field: "terms", message: BRAND_SIGNUP_FIELD_MESSAGES.terms };

  return { ok: true, meta: { name, bizNo, managerName, managerPhone, category, referralCode, termsAgreedAt } };
}

/** `create_brand_from_signup` 의 ok:false 코드 (0014 주석) + 앱 쪽 코드 */
export type BrandSignupFailCode =
  | "NOT_CONFIRMED"
  | "INVALID_INPUT"
  | "BIZ_NO_TAKEN"
  | "EMAIL_TAKEN"
  | "LINK_TARGET_NOT_FOUND"
  | "LINK_TARGET_TAKEN"
  | "RETRY"
  | "DB_ERROR";

/** `/brand/apply?reason=<code>` 안내 문구 (존댓말 · 고객 화면 톤) */
export const BRAND_SIGNUP_FAIL_MESSAGES: Record<BrandSignupFailCode, string> = {
  NOT_CONFIRMED: "이메일 인증이 아직 확인되지 않았어요 — 메일의 인증 링크를 먼저 눌러주세요",
  INVALID_INPUT: "가입 정보가 비어 있거나 형식이 맞지 않아요 — 아래에서 다시 입력해주세요",
  BIZ_NO_TAKEN: "이미 등록된 사업자등록번호예요 — 같은 사업자로 가입한 계정이 있다면 그 계정으로 로그인하거나, 고객센터로 문의해주세요",
  EMAIL_TAKEN: "이미 다른 브랜드 계정에 등록된 이메일이에요 — 고객센터로 문의해주세요",
  LINK_TARGET_NOT_FOUND: "연결할 브랜드 정보를 찾지 못했어요 — 고객센터로 문의해주세요",
  LINK_TARGET_TAKEN: "이미 다른 계정에 연결된 브랜드예요 — 고객센터로 문의해주세요",
  RETRY: "잠시 후 다시 시도해주세요",
  DB_ERROR: "저장 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function isBrandSignupFailCode(v: unknown): v is BrandSignupFailCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(BRAND_SIGNUP_FAIL_MESSAGES, v);
}
