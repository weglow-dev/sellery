/**
 * 인플루언서 콘솔 — 독점권 신청 (0025 `app_seller_request_exclusive` · `app_seller_exclusive_requests` ·
 * `seller_exclusive_eligible`). 프로토타입 원본: `packages/core/src/actions.ts` `reqExclusive`(L46) ·
 * `packages/ui/src/modals/ProductDetailModal.svelte` 독점권 블록.
 *
 * 전부 service role + **`p_seller_id = <requireSeller 의 seller.id>`** — 클라이언트가 보낸 seller 는 믿지 않는다.
 *   exclusiveEligibility(sellerId, productId)    신청 자격 판정 (등급 비교는 DB 가 한다)
 *   requestExclusive(sellerId, productId)        신청 — 멱등(PENDING·APPROVED 있으면 already:true)
 *   listMyExclusiveRequests(sellerId, productId?) 내 신청 상태
 * 판정·문구는 순수 모듈 `../../partner/exclusive-rules.ts`.
 */
import {
  parseEligibility,
  parseMyExclusiveRequests,
  parseRequestResult,
  type ExclusiveActionResult,
  type ExclusiveEligibility,
  type MyExclusiveRequest,
} from "../../partner/exclusive-rules";
import { createAdminClient, type Admin } from "../admin.server";

/** 신청 자격. 상품이 없거나 오퍼가 없으면 `eligible:false` + 사유. */
export async function exclusiveEligibility(
  sellerId: string,
  productId: string,
  admin: Admin = createAdminClient(),
): Promise<ExclusiveEligibility> {
  const { data, error } = await admin.rpc("seller_exclusive_eligible", {
    p_product_id: productId,
    p_seller_id: sellerId,
  });
  if (error) throw new Error(`seller_exclusive_eligible failed: ${error.message}`);
  // returns table → 한 행짜리 배열
  return parseEligibility(Array.isArray(data) ? data[0] : data);
}

/** 독점권 신청. 자격 미달이면 `ok:false` + code(GRADE · LOCKED · NO_OFFER …). */
export async function requestExclusive(
  sellerId: string,
  productId: string,
  admin: Admin = createAdminClient(),
): Promise<ExclusiveActionResult> {
  const { data, error } = await admin.rpc("app_seller_request_exclusive", {
    p_seller_id: sellerId,
    p_product_id: productId,
  });
  if (error) throw new Error(`app_seller_request_exclusive failed: ${error.message}`);
  return parseRequestResult(data);
}

/** 내 신청 목록. `productId` 를 주면 그 상품만. */
export async function listMyExclusiveRequests(
  sellerId: string,
  productId?: string | null,
  admin: Admin = createAdminClient(),
): Promise<MyExclusiveRequest[]> {
  const { data, error } = await admin.rpc("app_seller_exclusive_requests", {
    p_seller_id: sellerId,
    ...(productId ? { p_product_id: productId } : {}),
  });
  if (error) throw new Error(`app_seller_exclusive_requests failed: ${error.message}`);
  return parseMyExclusiveRequests(data);
}

/** 상품 1건에 대한 내 신청 (없으면 null) — 상품 상세가 쓰는 형태. */
export async function myExclusiveRequest(
  sellerId: string,
  productId: string,
  admin: Admin = createAdminClient(),
): Promise<MyExclusiveRequest | null> {
  const rows = await listMyExclusiveRequests(sellerId, productId, admin);
  // app_seller_exclusive_requests 는 created_at desc — 가장 최근 하나가 현재 상태다
  return rows[0] ?? null;
}
