/**
 * 브랜드 콘솔 — 인플루언서 직접 제안(초대) (docs/brand-console-plan.md §1 INVITED 행 · §4 "0016 app_brand_invite_seller" · §6 3단계 "초대 폼").
 * 프로토타입 원본: inviteModal(노출 중 상품 · 메시지) · actions.ts confirmInvite · 갤러리 sellerCard 의 3단계 부분집합(공개 · 골드 이하 · 인증 채널).
 *
 * 전부 0016 RPC(security definer · service role) + **`brand_id = <requireBrand 의 brand.id>`**.
 *   listInviteCandidates(brandId, productCode)          `app_brand_invite_candidates` — 내 노출 중 상품 1개에 제안 가능한 인플루언서 ≤ 50(팔로워순). 남의·미노출 상품이면 null
 *   inviteSeller(brandId, userId, {sellerId, productId, message})  `app_brand_invite_seller` — 새 캠페인 INVITED + 시스템 메시지 + (메시지가 있으면) 브랜드 채팅 1행
 * 순수 규칙(등급 게이트 · 폼 검증 · 문구 · 파서)은 `../../brand/invite-rules.ts`.
 */
import { CAMPAIGN_CODE_RE } from "../../campaign";
import { parseInviteCandidates, parseInviteResult, type InviteCandidates, type InviteResult } from "../../brand/invite-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { InviteCandidates, InviteCandidate, InviteResult } from "../../brand/invite-rules";

/** 내 상품 code → id (삭제 제외). 없거나 남의 것이면 null, DB 오류는 "error". */
async function productIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("products").select("id").eq("brand_id", brandId).eq("code", code).is("deleted_at", null).maybeSingle();
  if (error) {
    console.error("[brand/invite] product lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 초대 후보 — 상품 code 로. 남의·삭제·미노출(NOT_LISTED) 상품이면 null(라우트는 "노출 중인 상품이 아니에요"). DB 오류는 throw. */
export async function listInviteCandidates(brandId: string, productCode: string, admin: Admin = createAdminClient()): Promise<InviteCandidates | null> {
  const id = await productIdOf(admin, brandId, productCode);
  if (id === "error") throw new Error("product lookup failed");
  if (!id) return null;
  const { data, error } = await admin.rpc("app_brand_invite_candidates", { p_brand_id: brandId, p_product_id: id });
  if (error) throw new Error(`app_brand_invite_candidates failed: ${error.message}`);
  return parseInviteCandidates(data);
}

/** 초대 — input 은 parseInviteInput 결과(uuid 2개 + 메시지). userId 는 세션 user.id(시스템·채팅 행의 actor_user_id). */
export async function inviteSeller(
  brandId: string,
  userId: string | null,
  input: { sellerId: string; productId: string; message: string | null },
  admin: Admin = createAdminClient(),
): Promise<InviteResult> {
  const { data, error } = await admin.rpc("app_brand_invite_seller", {
    p_brand_id: brandId,
    p_seller_id: input.sellerId,
    p_product_id: input.productId,
    p_message: input.message ?? undefined,
    p_actor_user_id: userId ?? undefined,
  });
  if (error) {
    console.error("[brand/invite] app_brand_invite_seller failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseInviteResult(data);
}
