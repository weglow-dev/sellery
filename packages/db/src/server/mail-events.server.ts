/**
 * 이벤트별 거래 메일 — 행을 읽어 템플릿(`../mail/templates.ts`)을 채우고 `sendMail()` 로 보낸다. **절대 throw 하지 않는다**(주문·환불·발송·문의 흐름을 막지 않는다).
 * 훅 위치(각 이벤트가 정확히 한 곳에서 한 번):
 *   notifyOrderPaid      @sellery/payments checkout-sync `confirmDone` — app_confirm_checkout 이 새 주문을 만들었을 때(already 제외). confirm 라우트·웹훅·reconcile 전부 이 함수를 지난다
 *   notifyOrderRefunded  checkout-sync `afterRefundRecorded` — app_refund_record 가 새로 REFUNDED/CANCELED 로 바꿨을 때(already · partial 제외). 고객 셀프 · 브랜드 · 관리자 · 토스 콘솔 취소 전부
 *   notifyOrderShipped   brand/orders.server `shipOrder` · `shipOrdersBulk` — 새로 등록·정정(already 제외 · 정정은 새 송장으로 다시 한 통)
 *   notifyCsReplied      brand/cs.server `replyCs` — 브랜드 답변 1건당
 *   notifyCsOpened       cs.server `openCs`(접수) · `customerReplyCs`(추가 문의) — 브랜드에게
 * 받는 사람: 고객 = orders.buyer_email → customers.email → auth 계정 이메일(회원) — 셋 다 없으면 조용히 건너뛴다(비회원·카카오 계정은 이메일이 없을 수 있다).
 *            브랜드 = brands.email(없으면 건너뜀). 샘플 구매 주문(is_sample)은 파트너 결제 흐름이라 보내지 않는다.
 * 멱등: 템플릿의 idempotencyKey(Resend Idempotency-Key + 프로세스 24시간 가드) — 같은 이벤트를 두 번 훅해도 한 통.
 */
import type { Shipping } from "../types";
import {
  csOpenedBrandMail,
  csRepliedMail,
  orderPaidBrandMail,
  orderPaidCustomerMail,
  orderRefundedMail,
  orderShippedMail,
  type MailCs,
  type MailOrder,
  type MailTemplate,
} from "../mail/templates";
import { isEmailAddress } from "../mail/resend";
import { createAdminClient, type Admin } from "./admin.server";
import { mailCtx, sendMail, type MailSendResult } from "./mail.server";
import { fetchOrderSettings } from "./orders.server";

/** 주문 참조 — id(uuid) 또는 주문번호(대소문자 무시) */
export type OrderRef = { orderId: string } | { orderCode: string };

const ORDER_SELECT =
  "id,code,status,qty,amount,option_name,buyer_name,buyer_email,customer_id,user_id,shipping,courier,tracking_no,paid_at,refund_amount,refund_reason,is_sample," +
  "campaign:campaigns!orders_campaign_id_fkey(code,end_date," +
  "product:products!campaigns_product_id_fkey(name)," +
  "seller:sellers!campaigns_seller_id_fkey(handle)," +
  "brand:brands!campaigns_brand_id_fkey(name,email))";

type RawOrder = {
  id: string;
  code: string;
  status: string;
  qty: number;
  amount: number | null;
  option_name: string | null;
  buyer_name: string;
  buyer_email: string | null;
  customer_id: string | null;
  user_id: string | null;
  shipping: unknown;
  courier: string | null;
  tracking_no: string | null;
  paid_at: string;
  refund_amount: number | null;
  refund_reason: string | null;
  is_sample: boolean;
  campaign:
    | {
        code: string;
        end_date: string | null;
        product: { name: string } | { name: string }[] | null;
        seller: { handle: string } | { handle: string }[] | null;
        brand: { name: string; email: string | null } | { name: string; email: string | null }[] | null;
      }
    | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function asShipping(v: unknown): Shipping | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.address1 !== "string" || typeof o.recipient !== "string") return null;
  return {
    recipient: o.recipient,
    phone: typeof o.phone === "string" ? o.phone : "",
    postcode: typeof o.postcode === "string" ? o.postcode : "",
    address1: o.address1,
    address2: typeof o.address2 === "string" ? o.address2 : undefined,
    memo: typeof o.memo === "string" ? o.memo : undefined,
  };
}

type LoadedOrder = { order: MailOrder; customerEmail: string | null; brandEmail: string | null };

async function loadOrder(admin: Admin, ref: OrderRef): Promise<LoadedOrder | null> {
  let q = admin.from("orders").select(ORDER_SELECT);
  q = "orderId" in ref ? q.eq("id", ref.orderId) : q.ilike("code", ref.orderCode.trim());
  const { data, error } = await q.limit(1).maybeSingle().overrideTypes<RawOrder | null, { merge: false }>();
  if (error) {
    console.error("[mail] order read failed:", error.message);
    return null;
  }
  if (!data || data.is_sample || !data.campaign) return null;
  const c = data.campaign;
  const product = one(c.product);
  const seller = one(c.seller);
  const brand = one(c.brand);
  if (!product || !seller || !brand) return null;
  const { clear_days } = await fetchOrderSettings(admin);
  const order: MailOrder = {
    id: data.id,
    code: data.code,
    productName: product.name,
    optionName: data.option_name,
    qty: data.qty,
    amount: data.amount ?? 0,
    buyerName: data.buyer_name || "고객",
    isMember: !!data.user_id,
    shipping: asShipping(data.shipping),
    brandName: brand.name,
    sellerHandle: seller.handle,
    campaignCode: c.code,
    campaignEndDate: c.end_date,
    clearDays: clear_days,
    courier: data.courier,
    trackingNo: data.tracking_no,
    refundAmount: data.refund_amount,
    refundReason: data.refund_reason,
    paidAt: data.paid_at,
  };
  const customerEmail = await resolveCustomerEmail(admin, { buyerEmail: data.buyer_email, customerId: data.customer_id, userId: data.user_id });
  return { order, customerEmail, brandEmail: isEmailAddress(brand.email) ? brand.email.trim() : null };
}

/** 고객 이메일 — 주문 영수증 이메일 → customers.email → 회원 auth 계정. 없으면 null(조용히 건너뜀). */
export async function resolveCustomerEmail(
  admin: Admin,
  src: { buyerEmail?: string | null; customerId?: string | null; userId?: string | null },
): Promise<string | null> {
  if (isEmailAddress(src.buyerEmail)) return src.buyerEmail.trim();
  if (src.customerId) {
    const { data } = await admin.from("customers").select("email").eq("id", src.customerId).maybeSingle();
    if (isEmailAddress(data?.email)) return data.email.trim();
  }
  if (src.userId) {
    try {
      const { data } = await admin.auth.admin.getUserById(src.userId);
      const email = data?.user?.email;
      if (isEmailAddress(email)) return email.trim();
    } catch (e) {
      console.error("[mail] auth user read failed:", e instanceof Error ? e.message : e);
    }
  }
  return null;
}

async function deliver(to: string | null, tpl: MailTemplate): Promise<MailSendResult> {
  if (!to) return { ok: false, reason: "invalid", message: "no recipient" };
  return sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, tag: tpl.tag, idempotencyKey: tpl.idempotencyKey });
}

export type OrderMailOutcome = { customer: MailSendResult | null; brand: MailSendResult | null };

/** 주문 확인 — 고객 + 브랜드. 새 주문일 때만 부른다(already 는 호출자가 거른다). */
export async function notifyOrderPaid(admin: Admin | null | undefined, ref: OrderRef): Promise<OrderMailOutcome> {
  try {
    const a = admin ?? createAdminClient();
    const loaded = await loadOrder(a, ref);
    if (!loaded) return { customer: null, brand: null };
    const ctx = mailCtx();
    const [customer, brand] = await Promise.all([
      deliver(loaded.customerEmail, orderPaidCustomerMail(loaded.order, ctx)),
      deliver(loaded.brandEmail, orderPaidBrandMail(loaded.order, ctx)),
    ]);
    return { customer, brand };
  } catch (e) {
    console.error("[mail] notifyOrderPaid failed:", e instanceof Error ? e.message : e);
    return { customer: null, brand: null };
  }
}

/** 배송 시작 — 고객. 송장이 없으면(정정 중 빈 값) 보내지 않는다. */
export async function notifyOrderShipped(admin: Admin | null | undefined, ref: OrderRef): Promise<MailSendResult | null> {
  try {
    const a = admin ?? createAdminClient();
    const loaded = await loadOrder(a, ref);
    if (!loaded || !loaded.order.trackingNo) return null;
    return await deliver(loaded.customerEmail, orderShippedMail(loaded.order, mailCtx()));
  } catch (e) {
    console.error("[mail] notifyOrderShipped failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 환불 완료 — 고객. app_refund_record 가 새로 기록했을 때만(already · partial 은 호출자가 거른다). */
export async function notifyOrderRefunded(admin: Admin | null | undefined, ref: OrderRef): Promise<MailSendResult | null> {
  try {
    const a = admin ?? createAdminClient();
    const loaded = await loadOrder(a, ref);
    if (!loaded) return null;
    return await deliver(loaded.customerEmail, orderRefundedMail(loaded.order, mailCtx()));
  } catch (e) {
    console.error("[mail] notifyOrderRefunded failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/* ---------------- 고객 문의 ---------------- */

type LoadedCs = { cs: MailCs; customerEmail: string | null; brandEmail: string | null };

async function loadCs(admin: Admin, conversationId: string): Promise<LoadedCs | null> {
  const { data: c, error } = await admin
    .from("cs_conversations")
    .select("id,code,type,buyer_name,order_code,order_id,customer_id,user_id,campaign_id,brand_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    console.error("[mail] cs read failed:", error.message);
    return null;
  }
  if (!c) return null;
  const [{ data: camp }, { data: brand }] = await Promise.all([
    admin.from("campaigns").select("code,product:products!campaigns_product_id_fkey(name)").eq("id", c.campaign_id).maybeSingle(),
    admin.from("brands").select("name,email").eq("id", c.brand_id).maybeSingle(),
  ]);
  if (!camp || !brand) return null;
  const product = one(camp.product as { name: string } | { name: string }[] | null);
  let buyerEmail: string | null = null;
  if (c.order_id) {
    const { data: o } = await admin.from("orders").select("buyer_email").eq("id", c.order_id).maybeSingle();
    buyerEmail = o?.buyer_email ?? null;
  }
  const customerEmail = await resolveCustomerEmail(admin, { buyerEmail, customerId: c.customer_id, userId: c.user_id });
  return {
    cs: {
      conversationId: c.id,
      code: c.code,
      type: c.type,
      buyerName: c.buyer_name || "고객",
      orderCode: c.order_code,
      productName: product?.name ?? "상품",
      campaignCode: camp.code,
      brandName: brand.name,
      isMember: !!c.user_id,
    },
    customerEmail,
    brandEmail: isEmailAddress(brand.email) ? brand.email.trim() : null,
  };
}

/** 브랜드 답변 → 고객 */
export async function notifyCsReplied(admin: Admin | null | undefined, conversationId: string, reply: { messageId: string; body: string }): Promise<MailSendResult | null> {
  try {
    const a = admin ?? createAdminClient();
    const loaded = await loadCs(a, conversationId);
    if (!loaded) return null;
    return await deliver(loaded.customerEmail, csRepliedMail(loaded.cs, reply, mailCtx()));
  } catch (e) {
    console.error("[mail] notifyCsReplied failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 새 문의(접수) · 추가 문의 → 브랜드 */
export async function notifyCsOpened(
  admin: Admin | null | undefined,
  conversationId: string,
  message: { messageId: string; body: string; followUp: boolean },
): Promise<MailSendResult | null> {
  try {
    const a = admin ?? createAdminClient();
    const loaded = await loadCs(a, conversationId);
    if (!loaded) return null;
    return await deliver(loaded.brandEmail, csOpenedBrandMail(loaded.cs, message, mailCtx()));
  } catch (e) {
    console.error("[mail] notifyCsOpened failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
