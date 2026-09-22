/**
 * 브랜드 콘솔 — 주문 표 · 운송장 등록(단건/일괄) · 발주서 · 환불 가드 (docs/brand-console-plan.md §4 "0018" · §5 `/brand/orders` · §6 행 4).
 * 프로토타입 원본: apps/brand (demo) demo-orders/+page.svelte · actions.ts saveTrackOne / applyTrackCSV / trackCSVTemplate / poCSV / refund.
 *
 * 전부 0018 RPC(security definer · service role) + **`brand_id = <requireBrand 의 brand.id>`** — 남의 주문은 코드를 바꿔도 NOT_FOUND(라우트 404).
 *   listBrandOrders(brandId, filter?, campaignCode?)     `app_brand_orders` — is_sample 제외 · 미발송 우선 · totals 는 필터 무관 · 이메일 마스킹 · shipping 원문(발송 목적)
 *   shipOrder(brandId, orderCode, courier, trackingNo)    `app_brand_ship_order` — PAID 만 · 정정은 덮어쓰기(replaced) · 같은 값 already · 상태 전이 없음
 *   shipOrdersBulk(brandId, rows)                         `app_brand_ship_orders` — CSV 행(parseBulkShipCsv 결과) ≤ 500 · 행별 결과(부분 성공)
 *   poRows(brandId, campaignCode?)                        `app_brand_po_rows` — PAID 비샘플 주문 + 수취인 · 첫 내보내기에 campaigns.po_exported_at + 이벤트 po_sent
 *   unshippedOrderCodes(brandId)                          업로드 양식용 미발송 주문번호
 *   brandRefundPrecheck(brandId, orderCode)               `app_brand_refund_precheck` — 소유 · 비샘플 · **발송 전** · 0008 가드. 토스 취소 + 기록은
 *                                                         `@sellery/payments/server/brand-refund` refundOrderAsBrand (이 패키지는 토스를 부르지 않는다)
 * 행 파서·CSV·문구는 순수 모듈 `../../brand/order-rules.ts`.
 */
import { CAMPAIGN_CODE_RE } from "../../campaign";
import type { Courier } from "../../carriers";
import {
  ORDER_CODE_RE,
  isOrderFilter,
  parseBrandOrders,
  parseBulkShipResult,
  parsePoRows,
  parseShipOrderResult,
  type BrandOrders,
  type BulkShipResult,
  type BulkShipRow,
  type OrderFilter,
  type PoRows,
  type ShipOrderResult,
} from "../../brand/order-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifyOrderShipped } from "../mail-events.server";

export type { BrandOrders, BrandOrderRow, BrandOrderTotals, BulkShipResult, BulkShipRow, BulkShipRowResult, OrderFilter, PoRows, PoRow, ShipOrderResult } from "../../brand/order-rules";

/** 내 브랜드 캠페인 code → id. 없거나 남의 것이면 null, DB 오류는 "error". */
async function campaignIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("campaigns").select("id").eq("brand_id", brandId).eq("code", code).maybeSingle();
  if (error) {
    console.error("[brand/orders] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 내 브랜드 주문 code(대소문자 무시) → id — orders → campaigns.brand_id 로 소유 확인. 없거나 남의 것이면 null, DB 오류는 "error". */
async function orderIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  const c = code.trim();
  if (!ORDER_CODE_RE.test(c)) return null;
  const { data, error } = await admin.from("orders").select("id, campaign_id").ilike("code", c).limit(1).maybeSingle();
  if (error) {
    console.error("[brand/orders] order lookup failed:", error.message);
    return "error";
  }
  if (!data) return null;
  const { data: camp, error: cErr } = await admin.from("campaigns").select("id").eq("id", data.campaign_id).eq("brand_id", brandId).maybeSingle();
  if (cErr) {
    console.error("[brand/orders] campaign owner lookup failed:", cErr.message);
    return "error";
  }
  return camp ? data.id : null;
}

/** 주문 표. campaignCode 를 주면 그 캠페인만(남의 캠페인이면 빈 표). RPC 오류는 throw(페이지 500) — 빈 표와 구분한다. */
export async function listBrandOrders(brandId: string, filter: OrderFilter | string = "all", campaignCode?: string | null, admin: Admin = createAdminClient()): Promise<BrandOrders> {
  const f: OrderFilter = isOrderFilter(filter) ? filter : "all";
  let campaignId: string | null = null;
  if (campaignCode) {
    const id = await campaignIdOf(admin, brandId, campaignCode);
    if (id === "error") throw new Error("campaign lookup failed");
    if (!id) return { filter: f, rows: [], totals: { count: 0, unshipped: 0, shipped: 0, refunded: 0, paid_amount: 0, refund_amount: 0 } };
    campaignId = id;
  }
  const { data, error } = await admin.rpc("app_brand_orders", {
    p_brand_id: brandId,
    p_filter: f,
    ...(campaignId ? { p_campaign_id: campaignId } : {}),
  });
  if (error) throw new Error(`app_brand_orders failed: ${error.message}`);
  const parsed = parseBrandOrders(data);
  if (!parsed) throw new Error("app_brand_orders returned an unexpected shape");
  return parsed;
}

/** 단건 운송장 — courier · trackingNo 는 parseShipOrderInput 결과(함수가 다시 검사한다). */
export async function shipOrder(brandId: string, orderCode: string, courier: Courier, trackingNo: string, admin: Admin = createAdminClient()): Promise<ShipOrderResult> {
  const id = await orderIdOf(admin, brandId, orderCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_brand_ship_order", { p_brand_id: brandId, p_order_id: id, p_courier: courier, p_tracking_no: trackingNo });
  if (error) {
    console.error("[brand/orders] app_brand_ship_order failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const res = parseShipOrderResult(data);
  // 배송 시작 메일(고객) — 새 등록·정정(replaced)만, 같은 값(already)은 보내지 않는다. 절대 throw 하지 않는다.
  if (res.ok && !res.already) await notifyOrderShipped(admin, { orderId: res.orderId });
  return res;
}

/** 일괄 운송장 — parseBulkShipCsv 의 rows 를 그대로. 행별 결과는 results (CSV 형식 오류 행은 여기 오기 전에 errors 로 빠진다). */
export async function shipOrdersBulk(brandId: string, rows: readonly Pick<BulkShipRow, "order_code" | "courier" | "tracking_no">[], admin: Admin = createAdminClient()): Promise<BulkShipResult> {
  if (!rows.length) return { ok: false, code: "BAD_ROWS" };
  const payload = rows.map((r) => ({ order_code: r.order_code, courier: r.courier, tracking_no: r.tracking_no }));
  const { data, error } = await admin.rpc("app_brand_ship_orders", { p_brand_id: brandId, p_rows: payload });
  if (error) {
    console.error("[brand/orders] app_brand_ship_orders failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const res = parseBulkShipResult(data);
  // 배송 시작 메일 — 새로 적용된 행마다 한 통(already 제외). 주문번호로 조회 · 10건씩 병렬 · 실패해도 결과에 영향 없음.
  if (res.ok) {
    const codes = res.results.filter((r) => r.ok && !r.already).map((r) => r.order_code);
    for (let i = 0; i < codes.length; i += 10) {
      await Promise.all(codes.slice(i, i + 10).map((orderCode) => notifyOrderShipped(admin, { orderCode })));
    }
  }
  return res;
}

/** 발주서 행 — campaignCode 없으면 브랜드 전체. 남의 캠페인·없는 코드는 null(라우트 404). 부수 효과: 첫 내보내기 기록. */
export async function poRows(brandId: string, campaignCode?: string | null, admin: Admin = createAdminClient()): Promise<PoRows | null> {
  let campaignId: string | null = null;
  if (campaignCode) {
    const id = await campaignIdOf(admin, brandId, campaignCode);
    if (id === "error") throw new Error("campaign lookup failed");
    if (!id) return null;
    campaignId = id;
  }
  const { data, error } = await admin.rpc("app_brand_po_rows", { p_brand_id: brandId, ...(campaignId ? { p_campaign_id: campaignId } : {}) });
  if (error) throw new Error(`app_brand_po_rows failed: ${error.message}`);
  return parsePoRows(data);
}

/** 업로드 양식용 — 미발송(PAID · 송장 없음 · 비샘플) 주문번호, 최신순 */
export async function unshippedOrderCodes(brandId: string, admin: Admin = createAdminClient()): Promise<{ code: string }[]> {
  const list = await listBrandOrders(brandId, "unshipped", null, admin);
  return list.rows.map((r) => ({ code: r.code }));
}

export type BrandRefundPrecheck =
  | { ok: true; orderId: string; orderCode: string; amount: number; paymentKey: string | null; campaignStatus: string | null }
  | { ok: false; code: string };

/** 환불 가드만(토스 호출 전) — 소유 · 비샘플 · 발송 전 · PAID · 캠페인 ≠ SETTLED. 실제 환불은 @sellery/payments refundOrderAsBrand 가 이 함수를 먼저 부른다. */
export async function brandRefundPrecheck(brandId: string, orderCode: string, admin: Admin = createAdminClient()): Promise<BrandRefundPrecheck> {
  const id = await orderIdOf(admin, brandId, orderCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_brand_refund_precheck", { p_brand_id: brandId, p_order_id: id });
  if (error) {
    console.error("[brand/orders] app_brand_refund_precheck failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR" };
  const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
  if (typeof o.order_code !== "string" || !Number.isFinite(amount)) return { ok: false, code: "DB_ERROR" };
  return {
    ok: true,
    orderId: id,
    orderCode: o.order_code,
    amount,
    paymentKey: typeof o.payment_key === "string" ? o.payment_key : null,
    campaignStatus: typeof o.campaign_status === "string" ? o.campaign_status : null,
  };
}
