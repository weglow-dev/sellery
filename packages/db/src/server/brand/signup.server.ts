/**
 * 브랜드 가입 생성 RPC 래퍼 — `create_brand_from_signup`(0014) 을 부르는 유일한 앱 코드 (docs/brand-console-plan.md §3 · 인플루언서
 * `../partner/signup.server.ts` 의 브랜드 판). 호출자: apps/brand `auth/confirm`(token_hash 인증 뒤) · `/apply`(페이지 로드 재시도 + form action).
 *
 *   - 입력은 **`user_metadata`(또는 보완 폼)를 `parseBrandSignupMeta` 로 검증한 값**만 넘긴다 — 클라이언트 원문을 그대로 넘기지 않는다.
 *   - `p_link_id` 는 **`app_metadata.link_brand_id`** 에서만 읽는다(service role 만 쓸 수 있는 값 — partner-admin.mjs invite-brand/link-brand,
 *     dev-brand.mjs). `user_metadata` 의 값은 절대 넘기지 않는다.
 *   - 멱등: 함수가 같은 user_id 의 행을 찾으면 `{ok:true, already:true}`. 메타가 비어 있어도(초대 계정) 행이 이미 있으면 already 로 끝나도록
 *     먼저 행 유무를 본다 — 함수를 부르지 않고 INVALID_INPUT 을 돌려주면 /apply 가 다시 홈으로 보내는 헛걸음이 생긴다.
 *   - 새 행이 생겼을 때만 Slack 한 줄(선택 · 이메일·사업자번호·연락처 없이 — 브랜드 코드 · 상호 · 카테고리만).
 */
import type { User } from "@supabase/supabase-js";
import type { Json } from "../../database.types";
import { partnerRoleOf } from "../../auth";
import { parseBrandSignupMeta, type BrandSignupFailCode, type BrandSignupMetaField, isBrandSignupFailCode } from "../../brand/signup-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifySlack } from "../partner/slack.server";

export type BrandSignupResult =
  | { ok: true; already: boolean; brandId: string; code: string | null; linked: boolean }
  | { ok: false; code: BrandSignupFailCode; field?: BrandSignupMetaField | string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `app_metadata.link_brand_id`(운영자 경로 전용) — uuid 형식일 때만. `user_metadata` 는 보지 않는다. */
export function linkBrandIdOf(user: User): string | null {
  const v = (user.app_metadata as Record<string, unknown> | undefined)?.link_brand_id;
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

/**
 * 브랜드 계정 흔적 — `user_metadata.partner_role === 'brand'` **또는** `app_metadata.link_brand_id`. 비신뢰 값(`partner_role`)이 섞여 있으므로
 * "가입 생성 함수를 부를지 · 보완 폼을 보여줄지 · 다른 계정으로 로그인하라고 할지" 만 가른다(행 생성은 RPC 가 다시 검사, 게이트의 진실은 `brands.user_id`).
 * 인플루언서 세션(`partner_role='seller'`)은 false — 브랜드 콘솔에서는 foreign 이다(docs/brand-console-plan.md §3 결정 5).
 */
export function isBrandAccount(user: User | null | undefined): boolean {
  if (!user) return false;
  return partnerRoleOf(user) === "brand" || linkBrandIdOf(user) !== null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function parseBrandSignupRpcResult(json: unknown): BrandSignupResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const brandId = typeof o.brand_id === "string" ? o.brand_id : null;
    if (!brandId) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      already: o.already === true,
      brandId,
      code: typeof o.code === "string" ? o.code : null,
      linked: o.linked === true,
    };
  }
  const code = isBrandSignupFailCode(o.code) ? o.code : "DB_ERROR";
  return { ok: false, code, field: typeof o.field === "string" ? o.field : undefined };
}

/**
 * 세션 사용자에 대해 `brands` 행을 만들거나(일반 가입) 연결한다(초대·시드). 결과는 예외 없이 {ok, …} 로 돌려준다.
 * `form` 을 주면 user_metadata 대신 그 값을 검증한다(보완 폼).
 */
export async function createBrandFromSignup(user: User, form?: unknown, admin: Admin = createAdminClient()): Promise<BrandSignupResult> {
  const linkId = linkBrandIdOf(user);
  const parsed = parseBrandSignupMeta(form ?? user.user_metadata);

  if (!parsed.ok && !linkId) {
    // 메타가 비었거나 형식 오류 — 행이 이미 있으면 함수를 부르지 않아도 already (멱등), 없으면 /apply 보완 폼으로.
    const { data: existing, error } = await admin.from("brands").select("id, code").eq("user_id", user.id).maybeSingle();
    if (error) {
      console.error("[brand/signup] brands lookup failed:", error.message);
      return { ok: false, code: "DB_ERROR" };
    }
    if (existing) return { ok: true, already: true, brandId: existing.id, code: existing.code, linked: false };
    return { ok: false, code: "INVALID_INPUT", field: parsed.field };
  }

  const meta = parsed.ok ? parsed.meta : null;
  const { data, error } = await admin.rpc("create_brand_from_signup", {
    p_user_id: user.id,
    p_name: meta?.name ?? "",
    p_biz_no: meta?.bizNo ?? "",
    p_manager_name: meta?.managerName ?? "",
    p_manager_phone: meta?.managerPhone ?? "",
    p_category: meta?.category ?? "",
    ...(meta?.referralCode ? { p_referral_code: meta.referralCode } : {}),
    ...(meta?.termsAgreedAt ? { p_terms_agreed_at: meta.termsAgreedAt } : {}),
    ...(linkId ? { p_link_id: linkId } : {}),
  });
  if (error) {
    console.error("[brand/signup] create_brand_from_signup failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const result = parseBrandSignupRpcResult(data as Json);

  if (result.ok && !result.already) {
    // 이메일 · 사업자번호 · 연락처는 넣지 않는다 (inf §4.3 과 같은 규칙)
    const name = meta?.name ?? "(기존 행)";
    const category = meta?.category ?? "(연결)";
    void notifySlack(
      result.linked
        ? `[셀러리] 브랜드 계정 연결 · ${result.code ?? result.brandId} · ${name}`
        : `[셀러리] 브랜드 가입 완료 · ${result.code ?? result.brandId} · ${name} · ${category}`,
    );
  }
  return result;
}
