/**
 * 관리자 콘솔 "주문" — 전 브랜드 주문 열람 (0020 app_admin_orders · app_admin_order). 데모 원본: vAdminOrders (열람 · 환불).
 * 환불 실행은 `@sellery/payments/server/admin-refund`(토스 취소 → 0008 app_refund_record actor 'admin') — 여기는 읽기만.
 *   listAdminOrders(filter, q, limit)   app_admin_orders → AdminOrders | null   filter: all · paid · unshipped · shipped · refunded · sample · manual · partial
 *   getAdminOrder(orderRef)             app_admin_order → AdminOrderDetail | null   orderRef: code('o2001') 또는 uuid
 *   orderIdOf(admin, orderRef)          code → id (환불 라우트 공용)
 */
import { parseAdminOrder, parseAdminOrders, type AdminOrderDetail, type AdminOrderFilter, type AdminOrders } from "../../admin/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { AdminOrderDetail, AdminOrderFilter, AdminOrderRow, AdminOrders } from "../../admin/settle-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 주문 code('o2001' · 대소문자 무시) 또는 uuid → id. 없으면 null · 읽기 실패 'error' */
export async function orderIdOf(admin: Admin, ref: string): Promise<string | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  if (UUID_RE.test(r)) return r;
  const { data, error } = await admin.from("orders").select("id").eq("code", r.toLowerCase()).maybeSingle();
  if (error) {
    console.error("[admin/orders] order lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

export async function listAdminOrders(filter: AdminOrderFilter | string = "all", q?: string | null, limit = 200, admin: Admin = createAdminClient()): Promise<AdminOrders | null> {
  const { data, error } = await admin.rpc("app_admin_orders", { p_filter: filter, p_q: q ?? undefined, p_limit: limit });
  if (error) {
    console.error("[admin/orders] app_admin_orders failed:", error.message);
    return null;
  }
  return parseAdminOrders(data);
}

export async function getAdminOrder(orderRef: string, admin: Admin = createAdminClient()): Promise<AdminOrderDetail | null> {
  const id = await orderIdOf(admin, orderRef);
  if (!id || id === "error") return null;
  const { data, error } = await admin.rpc("app_admin_order", { p_order_id: id });
  if (error) {
    console.error("[admin/orders] app_admin_order failed:", error.message);
    return null;
  }
  return parseAdminOrder(data);
}
