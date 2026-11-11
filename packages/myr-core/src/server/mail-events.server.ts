/**
 * 이벤트별 거래 메일 — 주문·줄·셀러 행을 읽어 템플릿을 채우고 보낸다. **절대 throw 하지 않는다.** 훅 위치(각 이벤트가 정확히 한 곳에서 한 번):
 *   notifyOrderPaid(orderId)        checkout-sync `confirmDone` — 새 주문(already 제외). PAID 면 고객 주문 확인 + 줄의 셀러별 새 주문 · WAITING_DEPOSIT 이면 고객 입금 안내만
 *   notifyDepositDone(orderId)      checkout-sync `depositDone` — 입금 확인 → 고객 주문 확인 + 셀러 새 주문
 *   notifyOrderRefunded(orderId, r) refund.ts `refundItems` — record 가 새로 기록했을 때(already 제외) · 고객 + 환불된 줄의 셀러
 *   notifyOrderShipped(orderId, s)  ship.ts `shipOrder` — 새 운송장 기록 → 고객 배송 시작(0069)
 *   notifyCsOpened(csId, msg)       cs.ts `openCs`(접수) — 셀러에게 · notifyCsReplied(csId, reply) — 콘솔 답변 → 고객(S7 · 0063)
 *   notifyClaimOpened(claim)        claims.ts `openClaims` — 새 교환·환불 요청 → 그 줄의 셀러(0078)
 *   notifyClaimDecided(claim, refund)  claims.ts `decideClaim` — 승인 · 반려 → 고객(크리에이터 메시지 + 다음 단계 · 환불 예정 금액 = refundQuote)
 *   notifyClaimReshipped(claim)     claims.ts `reshipClaim` — 교환 재발송 송장 → 고객
 * 받는 사람: 고객 = buyer_email → customers.email → 회원 auth 계정 이메일(없으면 조용히 건너뜀 · 카카오 계정은 이메일이 없을 수 있다) · 셀러 = sellers.email(없으면 건너뜀 — 시드 크리에이터는 비어 있다).
 * 멱등: 템플릿 idempotencyKey(Resend Idempotency-Key + 프로세스 24시간 가드).
 */
import { claimStepText, RESOLUTION_NAMES, type Claim } from '../claim-rules';
import type { RefundQuote } from '../refund-rules';
import { isEmailAddress } from '../mail/resend';
import { trackingUrl } from '../ship-rules';
import { claimDecidedMail, claimOpenedSellerMail, claimReshippedMail, csOpenedSellerMail, csRepliedMail, depositPendingMail, orderPaidCustomerMail, orderPaidSellerMail, orderRefundedMail, orderRefundedSellerMail, type MailClaim, type MailCs, type MailItem, type MailOrder, type MailRefund, type MailTemplate, orderShippedMail } from '../mail/templates';
import { admin } from './admin.server';
import { mailCtx, sendMail, type MailSendResult } from './mail.server';

type Raw = {
	id: string;
	code: string;
	status: string;
	user_id: string | null;
	customer_id: string | null;
	buyer_name: string;
	buyer_email: string | null;
	shipping: Record<string, unknown> | null;
	items_amount: number;
	shipping_fee: number;
	amount: number;
	refund_amount: number;
	payment_method: string | null;
	raw_payment: { virtualAccount?: { bankCode?: string; accountNumber?: string; customerName?: string; dueDate?: string } | null } | null;
	myr_order_items: { id: string; product_name: string; option_name: string; qty: number; unit_price: number; amount: number; status: string; refunded_qty: number; seller_id: string; sellers: { name: string; email: string | null } | { name: string; email: string | null }[] | null }[] | null;
};
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type Loaded = { order: MailOrder; customerEmail: string | null; sellers: Map<string, { name: string; email: string | null }> };

async function loadOrder(orderId: string): Promise<Loaded | null> {
	const db = admin();
	const { data, error } = await db
		.from('myr_orders')
		.select('id, code, status, user_id, customer_id, buyer_name, buyer_email, shipping, items_amount, shipping_fee, amount, refund_amount, payment_method, raw_payment, myr_order_items(id, product_name, option_name, qty, unit_price, amount, status, refunded_qty, seller_id, sellers(name, email))')
		.eq('id', orderId)
		.maybeSingle();
	if (error) {
		console.error('[mail] order read failed:', error.message);
		return null;
	}
	const d = data as Raw | null;
	if (!d) return null;
	const sellers = new Map<string, { name: string; email: string | null }>();
	const items: MailItem[] = (d.myr_order_items ?? []).map((i) => {
		const s = one(i.sellers);
		if (s && !sellers.has(i.seller_id)) sellers.set(i.seller_id, { name: s.name, email: isEmailAddress(s.email) ? s.email!.trim() : null });
		return { id: i.id, name: i.product_name, option: i.option_name ?? '', qty: i.qty, unitPrice: i.unit_price, amount: i.amount, sellerId: i.seller_id, sellerName: s?.name ?? '크리에이터', status: i.status, refundedQty: i.refunded_qty };
	});
	const va = d.raw_payment?.virtualAccount;
	const ship = d.shipping;
	const str = (o: Record<string, unknown> | null, k: string) => (o && typeof o[k] === 'string' ? (o[k] as string) : '');
	const order: MailOrder = {
		id: d.id,
		code: d.code,
		status: d.status,
		buyerName: d.buyer_name || '고객',
		isMember: !!d.user_id,
		shipping: ship && str(ship, 'address1') ? { recipient: str(ship, 'recipient'), phone: str(ship, 'phone'), address1: str(ship, 'address1'), address2: str(ship, 'address2') || undefined, postcode: str(ship, 'postcode') || undefined, memo: str(ship, 'memo') || undefined } : null,
		items,
		itemsAmount: d.items_amount,
		shippingFee: d.shipping_fee,
		amount: d.amount,
		refundAmount: d.refund_amount,
		paymentMethod: d.payment_method ?? '',
		deposit: va && typeof va === 'object' ? { bank: va.bankCode ?? '', account: va.accountNumber ?? '', holder: va.customerName ?? '', due: va.dueDate ?? null } : null
	};
	const customerEmail = await resolveCustomerEmail({ buyerEmail: d.buyer_email, customerId: d.customer_id, userId: d.user_id });
	return { order, customerEmail, sellers };
}

/** 고객 이메일 — 주문 영수증 이메일 → customers.email → 회원 auth 계정. 없으면 null */
export async function resolveCustomerEmail(src: { buyerEmail?: string | null; customerId?: string | null; userId?: string | null }): Promise<string | null> {
	if (isEmailAddress(src.buyerEmail)) return src.buyerEmail.trim();
	const db = admin();
	if (src.customerId) {
		const { data } = await db.from('customers').select('email').eq('id', src.customerId).maybeSingle();
		const email = (data as { email: string | null } | null)?.email;
		if (isEmailAddress(email)) return email.trim();
	}
	if (src.userId) {
		try {
			const { data } = await db.auth.admin.getUserById(src.userId);
			const email = data?.user?.email;
			if (isEmailAddress(email)) return email.trim();
		} catch (e) {
			console.error('[mail] auth user read failed:', e instanceof Error ? e.message : e);
		}
	}
	return null;
}

const deliver = (to: string | null, tpl: MailTemplate | null): Promise<MailSendResult> =>
	!to || !tpl ? Promise.resolve({ ok: false, reason: 'invalid', message: 'no recipient' } as MailSendResult) : sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, tag: tpl.tag, idempotencyKey: tpl.idempotencyKey });

export type MailOutcome = { customer: MailSendResult | null; sellers: Record<string, MailSendResult> };

async function sellersMail(loaded: Loaded, make: (sellerId: string) => MailTemplate | null): Promise<Record<string, MailSendResult>> {
	const out: Record<string, MailSendResult> = {};
	await Promise.all(
		[...loaded.sellers.entries()].map(async ([sellerId, s]) => {
			if (!s.email) return;
			const tpl = make(sellerId);
			if (tpl) out[sellerId] = await deliver(s.email, tpl);
		})
	);
	return out;
}

/** 승인 확정 — PAID: 고객 주문 확인 + 셀러 새 주문 · WAITING_DEPOSIT: 고객 입금 안내만(셀러는 입금 뒤) */
export async function notifyOrderPaid(orderId: string): Promise<MailOutcome> {
	try {
		const loaded = await loadOrder(orderId);
		if (!loaded) return { customer: null, sellers: {} };
		const ctx = mailCtx();
		if (loaded.order.status === 'WAITING_DEPOSIT') return { customer: await deliver(loaded.customerEmail, depositPendingMail(loaded.order, ctx)), sellers: {} };
		const [customer, sellers] = await Promise.all([deliver(loaded.customerEmail, orderPaidCustomerMail(loaded.order, ctx)), sellersMail(loaded, (sid) => orderPaidSellerMail(loaded.order, sid, ctx))]);
		return { customer, sellers };
	} catch (e) {
		console.error('[mail] notifyOrderPaid failed:', e instanceof Error ? e.message : e);
		return { customer: null, sellers: {} };
	}
}

/** 입금 확인 — 고객 주문 확인 + 셀러 새 주문 (주문 확인 메일의 멱등 키를 같이 쓰므로 PAID 로 들어온 주문과 중복되지 않는다) */
export async function notifyDepositDone(orderId: string): Promise<MailOutcome> {
	try {
		const loaded = await loadOrder(orderId);
		if (!loaded || loaded.order.status === 'WAITING_DEPOSIT') return { customer: null, sellers: {} };
		const ctx = mailCtx();
		const [customer, sellers] = await Promise.all([deliver(loaded.customerEmail, orderPaidCustomerMail(loaded.order, ctx)), sellersMail(loaded, (sid) => orderPaidSellerMail(loaded.order, sid, ctx))]);
		return { customer, sellers };
	} catch (e) {
		console.error('[mail] notifyDepositDone failed:', e instanceof Error ? e.message : e);
		return { customer: null, sellers: {} };
	}
}

/** 환불 기록 뒤 — 고객 + 환불된 줄의 셀러 */
export async function notifyOrderRefunded(orderId: string, r: MailRefund): Promise<MailOutcome> {
	try {
		const loaded = await loadOrder(orderId);
		if (!loaded) return { customer: null, sellers: {} };
		const ctx = mailCtx();
		const [customer, sellers] = await Promise.all([deliver(loaded.customerEmail, orderRefundedMail(loaded.order, r, ctx)), sellersMail(loaded, (sid) => orderRefundedSellerMail(loaded.order, r, sid, ctx))]);
		return { customer, sellers };
	} catch (e) {
		console.error('[mail] notifyOrderRefunded failed:', e instanceof Error ? e.message : e);
		return { customer: null, sellers: {} };
	}
}

/** 발송(운송장 기록) → 고객만. ship.ts `shipOrder` 가 새 기록일 때 부른다 */
export async function notifyOrderShipped(orderId: string, s: { courier: string; trackingNo: string }): Promise<MailSendResult | null> {
	try {
		const loaded = await loadOrder(orderId);
		if (!loaded) return null;
		return await deliver(loaded.customerEmail, orderShippedMail(loaded.order, { ...s, trackingUrl: trackingUrl(s.courier, s.trackingNo) }, mailCtx()));
	} catch (e) {
		console.error('[mail] notifyOrderShipped failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

/* ---------------- 고객 문의 (S7 · 0063) ---------------- */
type RawCs = { id: string; code: string; type: string; buyer_name: string; order_code: string | null; order_id: string | null; customer_id: string | null; user_id: string | null; myr_products: { code: string; name: string } | { code: string; name: string }[] | null; sellers: { name: string; email: string | null } | { name: string; email: string | null }[] | null };
type LoadedCs = { cs: MailCs; customerEmail: string | null; sellerEmail: string | null };

async function loadCs(conversationId: string): Promise<LoadedCs | null> {
	const db = admin();
	const { data, error } = await db
		.from('myr_cs_conversations')
		.select('id, code, type, buyer_name, order_code, order_id, customer_id, user_id, myr_products(code, name), sellers(name, email)')
		.eq('id', conversationId)
		.maybeSingle();
	if (error) {
		console.error('[mail] cs read failed:', error.message);
		return null;
	}
	const c = data as RawCs | null;
	if (!c) return null;
	const p = one(c.myr_products);
	const s = one(c.sellers);
	let buyerEmail: string | null = null;
	if (c.order_id) {
		const { data: o } = await db.from('myr_orders').select('buyer_email').eq('id', c.order_id).maybeSingle();
		buyerEmail = (o as { buyer_email: string | null } | null)?.buyer_email ?? null;
	}
	const customerEmail = await resolveCustomerEmail({ buyerEmail, customerId: c.customer_id, userId: c.user_id });
	return {
		cs: { conversationId: c.id, code: c.code, type: c.type, buyerName: c.buyer_name || '고객', orderCode: c.order_code, productName: p?.name ?? '상품', productCode: p?.code ?? '', sellerName: s?.name ?? '크리에이터', isMember: !!c.user_id },
		customerEmail,
		sellerEmail: s && isEmailAddress(s.email) ? s.email!.trim() : null
	};
}

/** 새 문의(접수) → 셀러. cs.ts `openCs` 가 부른다 */
export async function notifyCsOpened(conversationId: string, message: { messageId: string; body: string }): Promise<MailSendResult | null> {
	try {
		const loaded = await loadCs(conversationId);
		if (!loaded) return null;
		return await deliver(loaded.sellerEmail, csOpenedSellerMail(loaded.cs, message, mailCtx()));
	} catch (e) {
		console.error('[mail] notifyCsOpened failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

/** 셀러·관리자 답변 → 고객. 콘솔의 reply 경로가 부른다(이 앱에는 호출처가 없다 — 콘솔 PR 에서 같은 함수를 복사·호출) */
export async function notifyCsReplied(conversationId: string, reply: { messageId: string; body: string }): Promise<MailSendResult | null> {
	try {
		const loaded = await loadCs(conversationId);
		if (!loaded) return null;
		return await deliver(loaded.customerEmail, csRepliedMail(loaded.cs, reply, mailCtx()));
	} catch (e) {
		console.error('[mail] notifyCsReplied failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

/* ---------------- 교환·환불 요청 (0078) ---------------- */
/** refund = 환불 예정 금액(승인 메일 · 서버 refundQuote) — 다른 메일은 없음 */
function mailClaim(c: Claim, loaded: Loaded, refund: Pick<RefundQuote, 'amount' | 'shippingBack'> | null = null): MailClaim {
	return {
		code: c.code,
		kind: c.kind,
		reason: c.reason,
		qty: c.qty,
		productName: c.order.item.name || c.product?.name || '상품',
		option: c.order.item.option,
		orderId: c.order.id,
		orderCode: c.order.code,
		isMember: c.order.isMember,
		buyerName: loaded.order.buyerName,
		sellerName: c.seller?.name ?? '크리에이터',
		note: c.note,
		status: c.status,
		resolutionName: c.resolution ? RESOLUTION_NAMES[c.resolution] : null,
		message: c.message,
		stepText: claimStepText(c),
		refundTotal: c.needsRefund && refund ? refund.amount : null,
		deduction: c.deduction,
		shippingBack: refund?.shippingBack ?? 0
	};
}

/** 새 요청 → 그 줄의 셀러(sellers.email · 없으면 건너뜀) */
export async function notifyClaimOpened(c: Claim): Promise<MailSendResult | null> {
	try {
		const loaded = await loadOrder(c.order.id);
		if (!loaded) return null;
		const seller = c.seller ? loaded.sellers.get(c.seller.id) : undefined;
		return await deliver(seller?.email ?? null, claimOpenedSellerMail(mailClaim(c, loaded)));
	} catch (e) {
		console.error('[mail] notifyClaimOpened failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

/** 승인 · 반려 → 고객 */
export async function notifyClaimDecided(c: Claim, refund: Pick<RefundQuote, 'amount' | 'shippingBack'> | null = null): Promise<MailSendResult | null> {
	try {
		const loaded = await loadOrder(c.order.id);
		if (!loaded) return null;
		return await deliver(loaded.customerEmail, claimDecidedMail(mailClaim(c, loaded, refund), mailCtx()));
	} catch (e) {
		console.error('[mail] notifyClaimDecided failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

/** 교환 재발송 송장 → 고객 */
export async function notifyClaimReshipped(c: Claim): Promise<MailSendResult | null> {
	try {
		if (!c.reshipTrackingNo) return null;
		const loaded = await loadOrder(c.order.id);
		if (!loaded) return null;
		const courier = c.reshipCourier ?? '택배';
		return await deliver(loaded.customerEmail, claimReshippedMail(mailClaim(c, loaded), { courier, trackingNo: c.reshipTrackingNo, trackingUrl: trackingUrl(courier, c.reshipTrackingNo) }, mailCtx()));
	} catch (e) {
		console.error('[mail] notifyClaimReshipped failed:', e instanceof Error ? e.message : e);
		return null;
	}
}
