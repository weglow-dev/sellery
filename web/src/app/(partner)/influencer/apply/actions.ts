"use server";

import { redirect } from "next/navigation";
import {
  RATE_LIMIT_MESSAGE,
  assertSameSiteAction,
  getSellerContext,
  rateLimit,
  sellerPath,
} from "@/lib/partner/seller";
import { createSellerFromSignup } from "@/lib/partner/signup";
import { SIGNUP_FAIL_MESSAGES, parseSignupMeta } from "@/lib/partner/signup-rules";

/**
 * 보완 폼 제출 — `/apply` 의 유일한 쓰기 (docs/inf-console-plan.md §4.3 · §4.4).
 *   assertSameSiteAction(CSRF) → 세션·행 상태(guest 만 진행) → rate limit 30분 20건 → parseSignupMeta(폼) →
 *   createSellerFromSignup(user, form)(멱등) → /home. 실패 문구는 useActionState 로 폼에 표시.
 * 약관 동의 시각은 폼 체크박스(`terms=on`) 또는 이미 user_metadata 에 있는 값 — 숨은 필드 값은 믿지 않는다.
 * `redirect` 는 throw 이므로 try 밖에서 부른다.
 */
export type ApplyState = { error: string | null };

export async function completeSignup(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  await assertSameSiteAction();
  const ctx = await getSellerContext();
  if (ctx.state === "anon") {
    redirect(`${sellerPath(ctx, "/login")}?next=${encodeURIComponent(sellerPath(ctx, "/apply"))}`);
  }
  if (ctx.state === "ok") redirect(sellerPath(ctx, "/home"));
  if (ctx.state === "suspended") redirect(sellerPath(ctx, "/suspended"));

  if (!rateLimit(`apply:${ctx.user.id}`)) return { error: RATE_LIMIT_MESSAGE };

  const metaTerms = (ctx.user.user_metadata as Record<string, unknown> | undefined)?.terms_agreed_at;
  const form = {
    display_name: formData.get("name"),
    platform: formData.get("platform"),
    handle: formData.get("handle"),
    referral_code: formData.get("referral_code"),
    terms_agreed_at: formData.get("terms") === "on" ? true : typeof metaTerms === "string" ? metaTerms : undefined,
  };
  const parsed = parseSignupMeta(form);
  if (!parsed.ok) return { error: parsed.message };

  const result = await createSellerFromSignup(ctx.user, form);
  if (!result.ok) return { error: SIGNUP_FAIL_MESSAGES[result.code] };
  redirect(sellerPath(ctx, "/home"));
}
