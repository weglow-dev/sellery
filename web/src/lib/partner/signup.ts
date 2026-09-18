import "server-only";

/**
 * 가입 생성 RPC 래퍼 — `create_seller_from_signup`(0010) 을 부르는 유일한 앱 코드 (docs/inf-console-plan.md §4.3 · §4.5).
 * 호출자: `auth/confirm`(token_hash 인증 뒤) · `auth/callback`(PKCE 뒤, 파트너면) · `/apply`(페이지 로드 재시도 + `completeSignup` 액션).
 *
 *   - 입력은 **`user_metadata`(또는 보완 폼)를 `parseSignupMeta` 로 검증한 값**만 넘긴다 — 클라이언트 원문을 그대로 넘기지 않는다.
 *   - `p_link_id` 는 **`app_metadata.link_seller_id`** 에서만 읽는다(service role 만 쓸 수 있는 값 — partner-admin.mjs invite/link,
 *     dev-seller.mjs). `user_metadata` 의 값은 절대 넘기지 않는다(§4.2 비신뢰 값).
 *   - 멱등: 함수가 같은 user_id 의 행을 찾으면 `{ok:true, already:true}`. 메타가 비어 있어도(옛 템플릿 경로·초대 계정) 행이 이미 있으면
 *     already 로 끝나도록 먼저 행 유무를 본다 — 함수를 부르지 않고 INVALID_INPUT 을 돌려주면 /apply 가 다시 홈으로 보내는 헛걸음이 생긴다.
 *   - 새 행이 생겼을 때만 Slack 한 줄(선택 · 이메일·핸들 없이).
 */
import type { User } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySlack } from "@/lib/partner/slack";
import { parseSignupMeta, type SignupFailCode, type SignupMetaField, isSignupFailCode } from "@/lib/partner/signup-rules";

export type SignupResult =
  | { ok: true; already: boolean; sellerId: string; code: string | null; linked: boolean }
  | { ok: false; code: SignupFailCode; field?: SignupMetaField | string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `app_metadata.link_seller_id`(운영자 경로 전용) — uuid 형식일 때만. `user_metadata` 는 보지 않는다. */
export function linkSellerIdOf(user: User): string | null {
  const v = (user.app_metadata as Record<string, unknown> | undefined)?.link_seller_id;
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseRpcResult(json: unknown): SignupResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const sellerId = typeof o.seller_id === "string" ? o.seller_id : null;
    if (!sellerId) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      already: o.already === true,
      sellerId,
      code: typeof o.code === "string" ? o.code : null,
      linked: o.linked === true,
    };
  }
  const code = isSignupFailCode(o.code) ? o.code : "DB_ERROR";
  return { ok: false, code, field: typeof o.field === "string" ? o.field : undefined };
}

/**
 * 세션 사용자에 대해 `sellers` 행을 만들거나(일반 가입) 연결한다(초대·시드). 결과는 예외 없이 {ok, …} 로 돌려준다.
 * `form` 을 주면 user_metadata 대신 그 값을 검증한다(보완 폼).
 */
export async function createSellerFromSignup(user: User, form?: unknown): Promise<SignupResult> {
  const admin = createAdminClient();
  const linkId = linkSellerIdOf(user);
  const parsed = parseSignupMeta(form ?? user.user_metadata);

  if (!parsed.ok && !linkId) {
    // 메타가 비었거나 형식 오류 — 행이 이미 있으면 함수를 부르지 않아도 already (멱등), 없으면 /apply 보완 폼으로.
    const { data: existing, error } = await admin
      .from("sellers")
      .select("id, code")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[signup] sellers lookup failed:", error.message);
      return { ok: false, code: "DB_ERROR" };
    }
    if (existing) return { ok: true, already: true, sellerId: existing.id, code: existing.code, linked: false };
    return { ok: false, code: "INVALID_INPUT", field: parsed.field };
  }

  const meta = parsed.ok ? parsed.meta : null;
  const { data, error } = await admin.rpc("create_seller_from_signup", {
    p_user_id: user.id,
    p_name: meta?.name ?? "",
    p_platform: meta?.platform ?? "",
    p_handle: meta?.handle ?? "",
    ...(meta?.referralCode ? { p_referral_code: meta.referralCode } : {}),
    ...(meta?.termsAgreedAt ? { p_terms_agreed_at: meta.termsAgreedAt } : {}),
    ...(linkId ? { p_link_id: linkId } : {}),
  });
  if (error) {
    console.error("[signup] create_seller_from_signup failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const result = parseRpcResult(data as Json);

  if (result.ok && !result.already) {
    // 이메일·핸들·URL 은 넣지 않는다 (§4.3)
    const platform = meta?.platform ?? "(연결)";
    const name = meta?.name ?? "(기존 행)";
    void notifySlack(
      result.linked
        ? `[셀러리] 인플루언서 계정 연결 · ${result.code ?? result.sellerId} · ${name}`
        : `[셀러리] 인플루언서 가입 완료 · ${result.code ?? result.sellerId} · ${name} · ${platform}`,
    );
  }
  return result;
}
