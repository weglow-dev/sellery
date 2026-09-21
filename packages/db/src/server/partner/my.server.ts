/**
 * 인플루언서 콘솔 `/my` 의 패키지 쪽 조각 — 3단계에서 추가된 것만 (docs/inf-console-plan.md §6 `/my` "saveSampleAddress").
 * 채널 액션(issueVerifyCode · confirmVerify · setPrimaryCh · saveChannel · deleteChannel)은 이미 `apps/influencer/src/routes/(console)/my/+page.server.ts`
 * 에 있고 다른 화면이 재사용하지 않으므로 여기로 옮기지 않는다.
 *
 *   saveSampleAddress(sellerId, shipping)  sellers.sample_address 갱신 — 배송지 기본값(상품 상세 요청 폼 · 4단계 결제 폼 프리필).
 *                                          무상 요청 RPC(`app_request_free_sample`) 도 같은 컬럼을 채우므로 /my 폼은 이 함수만 부른다.
 */
import type { Shipping } from "../../types";
import { createAdminClient, type Admin } from "../admin.server";

export type SaveSampleAddressResult = { ok: true } | { ok: false; code: "DB_ERROR" };

/** 배송지는 호출자가 `parseShippingInput` 으로 검증한 값만 넘긴다. */
export async function saveSampleAddress(sellerId: string, shipping: Shipping, admin: Admin = createAdminClient()): Promise<SaveSampleAddressResult> {
  const { error } = await admin
    .from("sellers")
    .update({ sample_address: { ...shipping } })
    .eq("id", sellerId);
  if (error) {
    console.error("[my] saveSampleAddress failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return { ok: true };
}
