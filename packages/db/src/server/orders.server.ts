/**
 * 내 주문 조회 — web/src/lib/orders-server.ts 의 이식 (계약 docs/app-plan.md §10.0 · §6.1).
 *
 * service role 조인: orders → campaigns(id, code, status, end_date) → products(name, thumb_url, emoji)
 *   → sellers(name, handle) → brands(name), where user_id = :userId, is_sample = false, paid_at desc.
 * SETTLED 캠페인은 anon/authenticated 정책(campaigns_select_public) 밖이라 클라이언트 키로는 상품명이 비므로 서버 조인
 * (access-model §4.1 "파트너 읽기는 서버 경유" 의 고객판). `shipping` 원문도 authenticated grant 에 없어 여기서만 나온다.
 *
 * 호출자는 반드시 세션의 user.id 를 넘긴다 — 이 모듈은 인증을 하지 않는다 (페이지·라우트가 `safeGetSession` 으로 확인).
 * admin 클라이언트는 마지막 인자로 주입할 수 있고, 생략하면 `createAdminClient()`(configureDb 의 service key).
 */
import type { OrderStatus, Shipping } from "../types";
import { DEFAULT_CLEAR_DAYS } from "../order-status";
import { createAdminClient, type Admin } from "./admin.server";
import { parseShipping } from "./customers.server";

export type MyOrder = {
  id: string;
  /** 고객에게 보이는 주문번호 (o2000~) — 화면은 대문자 */
  code: string;
  status: OrderStatus;
  qty: number;
  unit_price: number;
  amount: number;
  option_name: string | null;
  /** 주문 당시 표기 스냅샷 "{product.name} · {opt.n} × {qty}" (0008 이전 시드 주문은 null) */
  order_name: string | null;
  courier: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  paid_at: string;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  payment_method: string | null;
  is_sample: boolean;
  shipping: Shipping | null;
  campaign: { id: string; code: string; status: string; end_date: string | null };
  product: { name: string; thumb_url: string | null; emoji: string };
  seller: { name: string; handle: string };
  brand: { name: string };
};

/** 주문번호 URL 세그먼트 형식 — /api/payments/cancel 과 같은 규칙 */
export const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

const ORDER_STATUSES: readonly OrderStatus[] = ["PAID", "REFUNDED", "CANCELED"];

/**
 * PostgREST 임베드 — FK 이름을 명시해 조인 경로를 고정한다 (database.types.ts Relationships).
 * 한 줄·공백 없음: supabase-js 의 타입 레벨 select 파서와 PostgREST 파서 양쪽에 안전한 형태.
 */
const SELECT =
  "id,code,status,qty,unit_price,amount,option_name,order_name,courier,tracking_no,shipped_at,paid_at,refunded_at,refund_amount,refund_reason,payment_method,is_sample,shipping," +
  "campaign:campaigns!orders_campaign_id_fkey(id,code,status,end_date," +
  "product:products!campaigns_product_id_fkey(name,thumb_url,emoji)," +
  "seller:sellers!campaigns_seller_id_fkey(name,handle)," +
  "brand:brands!campaigns_brand_id_fkey(name))";

type RawOrder = {
  id: string;
  code: string;
  status: string;
  qty: number;
  unit_price: number;
  amount: number | null;
  option_name: string | null;
  order_name: string | null;
  courier: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  paid_at: string;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  payment_method: string | null;
  is_sample: boolean;
  shipping: unknown;
  campaign: {
    id: string;
    code: string;
    status: string;
    end_date: string | null;
    product: { name: string; thumb_url: string | null; emoji: string } | null;
    seller: { name: string; handle: string } | null;
    brand: { name: string } | null;
  } | null;
};

/** 조인이 비었거나(FK 불일치) 상태값이 낯설면 null — 목록에서는 제외, 상세에서는 404 */
function toMyOrder(r: RawOrder): MyOrder | null {
  const c = r.campaign;
  if (!c || !c.product || !c.seller || !c.brand) return null;
  if (!(ORDER_STATUSES as readonly string[]).includes(r.status)) return null;
  const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : r.unit_price * r.qty;
  return {
    id: r.id,
    code: r.code,
    status: r.status as OrderStatus,
    qty: r.qty,
    unit_price: r.unit_price,
    amount,
    option_name: r.option_name,
    order_name: r.order_name,
    courier: r.courier,
    tracking_no: r.tracking_no,
    shipped_at: r.shipped_at,
    paid_at: r.paid_at,
    refunded_at: r.refunded_at,
    refund_amount: r.refund_amount,
    refund_reason: r.refund_reason,
    payment_method: r.payment_method,
    is_sample: r.is_sample,
    shipping: parseShipping(r.shipping),
    campaign: { id: c.id, code: c.code, status: c.status, end_date: c.end_date },
    product: { name: c.product.name, thumb_url: c.product.thumb_url, emoji: c.product.emoji || "📦" },
    seller: { name: c.seller.name, handle: c.seller.handle },
    brand: { name: c.brand.name },
  };
}

export async function fetchMyOrders(userId: string, admin: Admin = createAdminClient()): Promise<MyOrder[]> {
  const { data, error } = await admin
    .from("orders")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("is_sample", false)
    .order("paid_at", { ascending: false })
    .overrideTypes<RawOrder[], { merge: false }>();
  if (error) throw new Error(`fetchMyOrders failed: ${error.message}`);
  const out: MyOrder[] = [];
  for (const r of data ?? []) {
    const o = toMyOrder(r);
    if (o) out.push(o);
  }
  return out;
}

/** user_id 불일치·없음·형식 오류 → null (페이지는 error(404)). 화면은 대문자로 보여 주므로 소문자도 같이 찾는다. */
export async function fetchMyOrder(userId: string, code: string, admin: Admin = createAdminClient()): Promise<MyOrder | null> {
  const raw = (code ?? "").trim();
  if (!ORDER_CODE_RE.test(raw)) return null;
  const codes = Array.from(new Set([raw, raw.toLowerCase()]));
  const { data, error } = await admin
    .from("orders")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("is_sample", false)
    .in("code", codes)
    .limit(1)
    .maybeSingle()
    .overrideTypes<RawOrder | null, { merge: false }>();
  if (error) throw new Error(`fetchMyOrder failed: ${error.message}`);
  return data ? toMyOrder(data) : null;
}

/** 내 주문 화면이 쓰는 정책 상수 — platform_settings(service 전용) 에서 1회 읽고, 못 읽으면 기본값 */
export async function fetchOrderSettings(admin?: Admin): Promise<{ clear_days: number }> {
  try {
    const a = admin ?? createAdminClient();
    const { data, error } = await a.from("platform_settings").select("value").eq("key", "clear_days").maybeSingle();
    if (error) throw new Error(error.message);
    const v = data?.value;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return { clear_days: Number.isInteger(n) && n >= 0 ? n : DEFAULT_CLEAR_DAYS };
  } catch (e) {
    console.error("[orders.server] clear_days read failed — 기본값 사용:", e instanceof Error ? e.message : e);
    return { clear_days: DEFAULT_CLEAR_DAYS };
  }
}

export type MyAccount = { email: string | null; created_at: string };

/** 계정 카드용 customers 행 (가입일 = customers.created_at, ux-spec §3.6). 행이 없으면(콜백 upsert 실패) null. */
export async function fetchMyAccount(userId: string, admin?: Admin): Promise<MyAccount | null> {
  try {
    const a = admin ?? createAdminClient();
    const { data, error } = await a.from("customers").select("email, created_at").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { email: data.email ?? null, created_at: data.created_at } : null;
  } catch (e) {
    console.error("[orders.server] customers read failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
