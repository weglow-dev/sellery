/**
 * 비회원 주문 — 0021 서버 계층 (service role). 인증은 하지 않는다 — 라우트가 쿠키(`slry_gck` · `slry_guest_<code>`)를 읽어 넘긴다.
 *   createGuestCustomer     /api/checkout 비회원 분기 — app_guest_customer_upsert (체크아웃 1건 = customers 행 1개)
 *   lookupGuestOrder        /orders/lookup — app_guest_order_lookup(주문번호, 연락처) → 토큰(회전)
 *   issueGuestToken         /api/payments/confirm 비회원 세션 확정 직후 — app_guest_token_issue(주문번호) → 토큰(회전)
 *   verifyGuestOrder        /orders/g/[code] · /api/payments/cancel — app_guest_order_verify(주문번호, 쿠키 토큰) → order id | null
 *   fetchOrderById          회원 상세(fetchMyOrder)와 같은 조인·같은 MyOrder 모양 — 두 화면이 한 컴포넌트(OrderDetail)를 쓴다
 */
import type { GuestBuyer } from "../guest-order";
import { GUEST_ORDER_CODE_RE, parseGuestLookupResult, parseGuestToken, type GuestLookupResult } from "../guest-order";
import { createAdminClient, type Admin } from "./admin.server";
import { fetchOrderById, type MyOrder } from "./orders.server";

export async function createGuestCustomer(buyer: GuestBuyer, admin: Admin = createAdminClient()): Promise<string> {
  const { data, error } = await admin.rpc("app_guest_customer_upsert", {
    p_name: buyer.name,
    p_phone: buyer.phone,
    p_email: buyer.email ?? undefined,
  });
  if (error) throw new Error(`app_guest_customer_upsert failed: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("app_guest_customer_upsert returned no id");
  return data;
}

export async function lookupGuestOrder(orderCode: string, phone: string, admin: Admin = createAdminClient()): Promise<GuestLookupResult> {
  if (!GUEST_ORDER_CODE_RE.test(orderCode)) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_guest_order_lookup", { p_order_code: orderCode, p_phone: phone });
  if (error) throw new Error(`app_guest_order_lookup failed: ${error.message}`);
  return parseGuestLookupResult(data);
}

/** 비회원 주문이 아니면 null (회원 주문 · 없는 주문) */
export async function issueGuestToken(orderCode: string, admin: Admin = createAdminClient()): Promise<string | null> {
  if (!GUEST_ORDER_CODE_RE.test(orderCode)) return null;
  const { data, error } = await admin.rpc("app_guest_token_issue", { p_order_code: orderCode });
  if (error) throw new Error(`app_guest_token_issue failed: ${error.message}`);
  return parseGuestToken(typeof data === "string" ? data : null);
}

/** 토큰 형식이 아니거나 해시 불일치 → null. 형식 검사는 DB 호출 전에 한다. */
export async function verifyGuestOrder(orderCode: string, tokenRaw: string | undefined | null, admin: Admin = createAdminClient()): Promise<string | null> {
  const token = parseGuestToken(tokenRaw);
  if (!token || !GUEST_ORDER_CODE_RE.test(orderCode)) return null;
  const { data, error } = await admin.rpc("app_guest_order_verify", { p_order_code: orderCode, p_token: token });
  if (error) throw new Error(`app_guest_order_verify failed: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

/** 검증 + 상세 한 번에 — 페이지 load 용. 어느 단계든 실패하면 null. */
export async function fetchGuestOrder(orderCode: string, tokenRaw: string | undefined | null, admin: Admin = createAdminClient()): Promise<MyOrder | null> {
  const id = await verifyGuestOrder(orderCode, tokenRaw, admin);
  if (!id) return null;
  return fetchOrderById(id, admin);
}
