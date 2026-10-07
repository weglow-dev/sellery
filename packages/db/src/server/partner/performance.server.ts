/**
 * 인플루언서 콘솔 — 상품별 익명 실적 표 (0039 `app_seller_product_performance`).
 * 프로토타입 원본: `packages/ui/modals/ProductDetailModal.svelte` 의 실적 표 · actions.ts `buyDataPass`.
 *
 * service role + **`p_seller_id = <requireSeller 의 seller.id>`** — 클라이언트 값은 믿지 않는다.
 *   getProductPerformance(sellerId, productId)   캠페인별 지표 + 확인권 보유 여부
 *
 * **게이트는 DB 안에 있다** — 확인권이 없으면 첫 행과 내 캠페인만 지표를 담고 나머지는 `null` 로 온다.
 * 인플루언서 이름·핸들은 아예 담지 않는다(익명). 구매는 샵 RPC(`buyShopItem('seller', …, 'datapass')`)
 * 를 그대로 쓴다 — 영구·계정 단위라 상품마다 사지 않는다.
 * 순수 규칙·문구는 `../../partner/performance-rules.ts`.
 */
import { parsePerformance, type ProductPerformanceView } from "../../partner/performance-rules";
import { createAdminClient, type Admin } from "../admin.server";

/** 상품별 실적. 상품이 없거나 RPC 가 실패하면 null (화면은 집계만 보여준다). */
export async function getProductPerformance(
  sellerId: string,
  productId: string,
  admin: Admin = createAdminClient(),
): Promise<ProductPerformanceView | null> {
  const { data, error } = await admin.rpc("app_seller_product_performance", {
    p_seller_id: sellerId,
    p_product_id: productId,
  });
  if (error) throw new Error(`app_seller_product_performance failed: ${error.message}`);
  return parsePerformance(data);
}
