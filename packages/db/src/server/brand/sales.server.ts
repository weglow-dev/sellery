/**
 * 브랜드 콘솔 `/brand/sales` — 실시간 매출 (docs/brand-console-plan.md §5 `/brand/sales` · §6 행 5). 데모 원본: views/Sales.svelte 의 브랜드 관점(시뮬 토글 제외).
 *
 * 집계·수수료 계산은 전부 **0019 `app_brand_sales`** 가 한다(PAID · 샘플 제외 · Asia/Seoul 달력일 · 등급 할인은 실시간 등급).
 * 여기는 RPC 1회 + `parseBrandSales` 뿐. 브랜드 id 는 `requireBrand()` 의 `brand.id` 만.
 *   getBrandSales(brandId) → BrandSales | null (null = 계정 없음 · DB 오류 — 라우트는 빈 화면 + 안내)
 * 인플루언서 짝: `../partner/sales.server.ts`(0013 app_seller_sales).
 */
import { parseBrandSales, type BrandSales } from "../../brand/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { BrandSales, BrandSalesCampaign, BrandSalesSeller } from "../../brand/settle-rules";

export async function getBrandSales(brandId: string, admin: Admin = createAdminClient()): Promise<BrandSales | null> {
  const { data, error } = await admin.rpc("app_brand_sales", { p_brand_id: brandId });
  if (error) {
    console.error("[brand/sales] app_brand_sales failed:", error.message);
    return null;
  }
  return parseBrandSales(data);
}
