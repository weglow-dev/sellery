/**
 * 파트너 가입 입력 규칙 — 클라이언트 폼(가입 · 보완 폼)과 서버(`parseSignupMeta` · 서버 액션)가 **같은 규칙**을 쓴다.
 * 순수 모듈(클라이언트 번들에 들어간다) — 여기에는 순수 함수·상수만 둔다. DB 호출은 `../server/partner/signup.server.ts`.
 *
 * 프로토타입 login.html fJoin 의 검증을 그대로 + 플랫폼·핸들(docs/inf-console-plan.md §4.1):
 *   활동명 1~30자 · 비밀번호 영문+숫자 8자 이상 · 추천 코드(선택, 대문자) · 약관 동의(필수) · 플랫폼 enum · 핸들 `^@?[A-Za-z0-9._]{2,30}$`
 * DB 함수 `create_seller_from_signup`(0010) 이 같은 조건을 다시 검사한다.
 */
import { cleanText } from "../text";

export const PLATFORMS = ["instagram", "youtube", "naver", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "인스타그램",
  youtube: "유튜브",
  naver: "네이버 블로그",
  tiktok: "틱톡",
};

export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
}

/** 활동명 최대 길이 (DB 함수와 동일) */
export const NAME_MAX = 30;
/** 핸들 — 앞 `@` 는 있어도 없어도 된다. 저장 규약은 DB 가 `'@' || 소문자` 로 통일한다. */
export const HANDLE_RE = /^@?[A-Za-z0-9._]{2,30}$/;
/** 비밀번호 — 프로토타입 login.html L278 과 동일 (Supabase 최소 길이 8 과 맞춘다) */
export const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
/** 추천 코드 — 대문자 정규화 뒤 형식 밖이면 무시(실패 아님, 프로토타입과 동일) */
export const REFERRAL_RE = /^[A-Z0-9-]{3,20}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** 핸들 정규화: 공백 제거 · 앞 `@` 제거 · 소문자. (DB 저장값은 `'@' + 이 값`) */
export function normalizeHandleInput(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** 추천 코드 정규화: 공백 제거 · 대문자. 형식 밖이면 null. */
export function normalizeReferralInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  return REFERRAL_RE.test(v) ? v : null;
}

export type SignupMeta = {
  /** 활동명 (cleanText · 1~30자) */
  name: string;
  platform: Platform;
  /** `@` 없는 소문자 핸들 */
  handle: string;
  referralCode: string | null;
  /** ISO 8601 */
  termsAgreedAt: string;
};

export type SignupMetaField = "name" | "platform" | "handle" | "terms";

export type SignupMetaResult = { ok: true; meta: SignupMeta } | { ok: false; field: SignupMetaField; message: string };

export const SIGNUP_FIELD_MESSAGES: Record<SignupMetaField, string> = {
  name: `활동명을 입력해주세요 (${NAME_MAX}자 이내)`,
  platform: "플랫폼을 선택해주세요",
  handle: "핸들은 영문·숫자·점(.)·밑줄(_) 2~30자로 입력해주세요",
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
 * 받아들이는 키: `display_name`|`name` · `platform` · `handle` · `referral_code`|`ref` · `terms_agreed_at`(ISO 문자열 또는 `true`).
 * 실패하면 첫 번째 어긋난 필드와 사용자 문구. 클라이언트가 보낸 원문은 그대로 넘기지 않는다 — 여기서 정규화한 값만 DB 로.
 */
export function parseSignupMeta(source: unknown): SignupMetaResult {
  const o = source && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>) : {};

  const name = cleanText(firstString(o, ["display_name", "name"]) ?? "");
  if (!name || name.length > NAME_MAX) return { ok: false, field: "name", message: SIGNUP_FIELD_MESSAGES.name };

  const platformRaw = firstString(o, ["platform"]);
  const platform = typeof platformRaw === "string" ? platformRaw.trim().toLowerCase() : "";
  if (!isPlatform(platform)) return { ok: false, field: "platform", message: SIGNUP_FIELD_MESSAGES.platform };

  const handleRaw = (firstString(o, ["handle"]) ?? "").trim();
  if (!HANDLE_RE.test(handleRaw)) return { ok: false, field: "handle", message: SIGNUP_FIELD_MESSAGES.handle };
  const handle = normalizeHandleInput(handleRaw);

  const referralCode = normalizeReferralInput(firstString(o, ["referral_code", "ref"]));

  const termsRaw = o.terms_agreed_at;
  let termsAgreedAt: string | null = null;
  if (termsRaw === true) termsAgreedAt = new Date().toISOString();
  else if (typeof termsRaw === "string" && termsRaw.trim()) {
    const t = new Date(termsRaw);
    if (!Number.isNaN(t.getTime())) termsAgreedAt = t.toISOString();
  }
  if (!termsAgreedAt) return { ok: false, field: "terms", message: SIGNUP_FIELD_MESSAGES.terms };

  return { ok: true, meta: { name, platform, handle, referralCode, termsAgreedAt } };
}

/** `create_seller_from_signup` 의 ok:false 코드 (0010 주석) + 앱 쪽 코드 */
export type SignupFailCode =
  | "NOT_CONFIRMED"
  | "INVALID_INPUT"
  | "HANDLE_TAKEN"
  | "LINK_TARGET_NOT_FOUND"
  | "LINK_TARGET_TAKEN"
  | "RETRY"
  | "DB_ERROR";

/** `/apply?reason=<code>` 안내 문구 (존댓말 · 고객 화면 톤) */
export const SIGNUP_FAIL_MESSAGES: Record<SignupFailCode, string> = {
  NOT_CONFIRMED: "이메일 인증이 아직 확인되지 않았어요 — 메일의 인증 링크를 먼저 눌러주세요",
  INVALID_INPUT: "가입 정보가 비어 있거나 형식이 맞지 않아요 — 아래에서 다시 입력해주세요",
  HANDLE_TAKEN: "이미 사용 중인 핸들이에요 — 다른 핸들을 입력해주세요",
  LINK_TARGET_NOT_FOUND: "연결할 인플루언서 정보를 찾지 못했어요 — 고객센터로 문의해주세요",
  LINK_TARGET_TAKEN: "이미 다른 계정에 연결된 인플루언서예요 — 고객센터로 문의해주세요",
  RETRY: "잠시 후 다시 시도해주세요",
  DB_ERROR: "저장 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

export function isSignupFailCode(v: unknown): v is SignupFailCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SIGNUP_FAIL_MESSAGES, v);
}
