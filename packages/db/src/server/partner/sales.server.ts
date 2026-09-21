/**
 * 인플루언서 콘솔 `/sales` — 실시간 매출 (docs/inf-console-plan.md §6 `/sales` · §7 5단계). 프로토타입 원본: js/30-shared.js vSales(시뮬 토글 제외).
 *
 * 집계·수수료 계산은 전부 **0013 `app_seller_sales`** 가 한다(홈 위젯 `getHomeWidgets` 의 orders 집계와 같은 기준 — PAID · 샘플 제외 · Asia/Seoul 달력일).
 * 여기는 RPC 1회 + `parseSellerSales` 뿐. 인플루언서 id 는 `requireSeller()` 의 `seller.id` 만(§4.4).
 *   getSellerSales(sellerId) → SellerSales | null (null = 계정 없음 · DB 오류 — 라우트는 빈 화면 + 안내)
 */
import { parseSellerSales, type SellerSales } from "../../partner/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { SellerSales, SellerSalesCampaign } from "../../partner/settle-rules";

export async function getSellerSales(sellerId: string, admin: Admin = createAdminClient()): Promise<SellerSales | null> {
  const { data, error } = await admin.rpc("app_seller_sales", { p_seller_id: sellerId });
  if (error) {
    console.error("[sales] app_seller_sales failed:", error.message);
    return null;
  }
  return parseSellerSales(data);
}
