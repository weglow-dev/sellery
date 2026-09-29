/**
 * 브랜드 콘솔 — 독점권 신청 승인/거절 (0025 `app_brand_exclusive_requests` · `app_brand_decide_exclusive`).
 * 프로토타입 원본: `packages/core/src/actions.ts` `approveExcl`/`rejectExcl` · `packages/ui/src/views/DM.svelte` 승인 행.
 *
 * 전부 service role + **`p_brand_id = <requireBrand 의 brand.id>`** — 남의 상품 신청은 NOT_FOUND(소유자 불일치를
 * 구분하지 않는다, 다른 브랜드 화면과 같은 방식).
 *   listBrandExclusiveRequests(brandId, status?)   들어온 신청 (기본 PENDING) — 신청 시 프로필이 공개된다
 *   decideBrandExclusive(brandId, requestId, approve)  승인/거절
 *
 * 승인은 `products.exclusive_seller_id` 를 세우고 **같은 상품의 남은 PENDING 을 자동 거절**한다
 * (독점권은 1명 — 프로토타입 `approveExcl` 은 남겨뒀고 재승인 시 덮어써졌다).
 * 판정·문구는 순수 모듈 `../../partner/exclusive-rules.ts`(인플루언서와 공유).
 */
import {
  parseBrandExclusiveRequests,
  parseRequestResult,
  type BrandExclusiveRequest,
  type ExclusiveActionResult,
  type ExclusiveStatus,
} from "../../partner/exclusive-rules";
import { createAdminClient, type Admin } from "../admin.server";

/** 내 상품에 들어온 독점권 신청. `status` 를 null 로 주면 전부(이력 화면용). */
export async function listBrandExclusiveRequests(
  brandId: string,
  status: ExclusiveStatus | null = "PENDING",
  admin: Admin = createAdminClient(),
): Promise<BrandExclusiveRequest[]> {
  const { data, error } = await admin.rpc("app_brand_exclusive_requests", {
    p_brand_id: brandId,
    p_status: status,
  });
  if (error) throw new Error(`app_brand_exclusive_requests failed: ${error.message}`);
  return parseBrandExclusiveRequests(data);
}

/** 승인(approve=true) 또는 거절. 이미 결정된 신청이면 `already:true`. */
export async function decideBrandExclusive(
  brandId: string,
  requestId: string,
  approve: boolean,
  admin: Admin = createAdminClient(),
): Promise<ExclusiveActionResult> {
  const { data, error } = await admin.rpc("app_brand_decide_exclusive", {
    p_brand_id: brandId,
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw new Error(`app_brand_decide_exclusive failed: ${error.message}`);
  return parseRequestResult(data);
}
