/**
 * MYR 거래 메일 템플릿 — 순수 함수(입력 → { subject, html, text, idempotencyKey, tag }). DB·환경 없음 · 테스트 src/test/mail-templates.test.ts.
 *
 * | 이벤트 | 함수 | 받는 사람 | 링크 |
 * |---|---|---|---|
 * | 주문 확인(결제 완료) | orderPaidCustomerMail | 고객 | 회원 /orders/<code> · 비회원 /orders/g/<code> |
 * | 입금 안내(가상계좌) | depositPendingMail | 고객 | 주문 화면(계좌·기한) |
 * | 새 주문 | orderPaidSellerMail | 줄의 셀러(sellers.email) — **자기 줄만** · 배송지 없음 | (셀러 콘솔 전까지 링크 없음) |
 * | 환불 완료 | orderRefundedMail | 고객 | 주문 화면 |
 * | 환불(셀러) | orderRefundedSellerMail | 환불된 줄의 셀러 — 자기 줄만 | — |
 * | 교환·환불 요청 접수 | claimOpenedSellerMail | 그 줄의 셀러 — 연락처·배송지 없음 | 없음(콘솔 CS 관리 · 뱃지에서 확인) |
 * | 교환·환불 승인·반려 | claimDecidedMail | 고객 | 주문 화면 |
 * | 교환 재발송 | claimReshippedMail | 고객 | 배송 조회 |
 * | 크리에이터 초대 | creatorInviteMail | 초대받은 이메일 | 콘솔 /invite/<토큰>(버튼 "가입하기") |
 * | 비밀번호 재설정 | passwordResetMail | 크리에이터 로그인 이메일 | 콘솔 /auth/confirm?token_hash=…&type=recovery |
 * 발송·멱등은 ./resend.ts + ../server/mail.ts, 행 조회·훅은 ../server/mail-events.ts.
 */
import { won } from '../constants';
import { mailIdempotencyKey, renderMailHtml, renderMailText, type MailDoc, type MailRow } from './layout';

export type MailCtx = { siteUrl: string };
export type MailTemplate = { subject: string; html: string; text: string; idempotencyKey: string; tag: string };

export type MailItem = { id: string; name: string; option: string; qty: number; unitPrice: number; amount: number; sellerId: string; sellerName: string; status: string; refundedQty: number };
export type MailShipping = { recipient: string; phone: string; address1: string; address2?: string; postcode?: string; memo?: string } | null;
export type MailDeposit = { bank: string; account: string; holder: string; due: string | null } | null;
/** 메일이 보는 주문 — mail-events.ts 가 myr_orders + 줄 + 셀러로 채운다 */
export type MailOrder = {
	id: string;
	code: string;
	status: string;
	buyerName: string;
	isMember: boolean;
	shipping: MailShipping;
	items: MailItem[];
	itemsAmount: number;
	shippingFee: number;
	amount: number;
	refundAmount: number;
	paymentMethod: string;
	deposit: MailDeposit;
};
/** 환불 1건 — record 가 돌려준 것 */
/** items[].note = 고객이 제품별로 남긴 상세(0067) · photoUrls = 사진 서명 URL(0068 · 7일) — 둘 다 셀러 메일에만 · deduction = 왕복 배송비 차감(0078 부분 환불) */
export type MailRefund = { items: { itemId: string; qty: number; amount: number; note?: string; photoUrls?: string[] }[]; amount: number; full: boolean; reason: string; deposit: boolean; deduction?: number };

const url = (ctx: MailCtx, path: string): string => `${ctx.siteUrl.replace(/\/+$/, '')}${path}`;
const upper = (code: string): string => code.toUpperCase();
const itemLine = (i: { name: string; option: string; qty: number }): string => `${i.name}${i.option ? ` · ${i.option}` : ''} × ${i.qty}`;
const itemsText = (items: { name: string; option: string; qty: number }[]): string => items.map(itemLine).join('\n');
function shippingLine(s: MailShipping): string | null {
	if (!s || !s.address1) return null;
	const addr = [s.address1, s.address2].filter((v) => v && v.trim()).join(' ');
	return `${s.recipient}${s.postcode ? ` (${s.postcode})` : ''}\n${addr}`;
}
const dueText = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export const orderPageUrl = (o: Pick<MailOrder, 'code' | 'isMember'>, ctx: MailCtx): string =>
	o.isMember ? url(ctx, `/orders/${encodeURIComponent(o.code)}`) : url(ctx, `/orders/g/${encodeURIComponent(o.code)}`);
const finish = (doc: MailDoc, subject: string, idempotencyKey: string, tag: string): MailTemplate => ({ subject, html: renderMailHtml(doc), text: renderMailText(doc), idempotencyKey, tag });
const guestNote = '비회원 주문은 결제한 기기에서 바로 열리고, 다른 기기에서는 주문 조회에 주문번호와 연락처를 넣으면 열려요.';

/* ---------------- 주문 확인 (고객) ---------------- */
export function orderPaidCustomerMail(o: MailOrder, ctx: MailCtx): MailTemplate {
	const code = upper(o.code);
	const rows: MailRow[] = [
		{ label: '주문번호', value: code },
		{ label: '상품', value: itemsText(o.items) },
		{ label: '결제 금액', value: `${won(o.amount)}${o.shippingFee ? ` (배송비 ${won(o.shippingFee)} 포함)` : ''}` }
	];
	const ship = shippingLine(o.shipping);
	if (ship) rows.push({ label: '배송지', value: ship });
	const notes = ['발송 전 주문은 주문 화면에서 상품별로 바로 환불할 수 있어요. 발송 뒤에는 고객센터로 문의해주세요.'];
	if (!o.isMember) notes.push(guestNote);
	const doc: MailDoc = {
		title: '주문이 접수되었어요',
		preheader: `${code} · ${won(o.amount)}`,
		intro: `${o.buyerName}님, 결제가 완료되어 주문을 접수했어요. 상품을 발송하면 다시 알려드릴게요.`,
		rows,
		button: { label: '주문 상세 보기', url: orderPageUrl(o, ctx) },
		notes
	};
	return finish(doc, `[MYR] 주문이 접수되었어요 · ${code}`, mailIdempotencyKey('myr_order_paid', 'customer', o.id), 'myr_order_paid');
}

/* ---------------- 입금 안내 (가상계좌 · 고객) ---------------- */
export function depositPendingMail(o: MailOrder, ctx: MailCtx): MailTemplate {
	const code = upper(o.code);
	const rows: MailRow[] = [
		{ label: '주문번호', value: code },
		{ label: '상품', value: itemsText(o.items) },
		{ label: '입금 금액', value: won(o.amount) }
	];
	if (o.deposit) {
		rows.push({ label: '입금 계좌', value: `${o.deposit.bank} ${o.deposit.account}${o.deposit.holder ? ` (${o.deposit.holder})` : ''}` });
		if (o.deposit.due) rows.push({ label: '입금 기한', value: dueText(o.deposit.due) });
	}
	const notes = ['기한 안에 입금되지 않으면 주문이 자동 취소되고 예약된 재고가 풀려요. 입금이 확인되면 주문 확인 메일을 다시 보내드려요.'];
	if (!o.isMember) notes.push(guestNote);
	const doc: MailDoc = {
		title: '입금을 기다리고 있어요',
		preheader: `${code} · ${won(o.amount)} 입금 안내`,
		intro: `${o.buyerName}님, 가상계좌 주문을 접수했어요. 아래 계좌로 입금해 주시면 주문이 확정돼요.`,
		rows,
		button: { label: '주문 상세 보기', url: orderPageUrl(o, ctx) },
		notes
	};
	return finish(doc, `[MYR] 입금 안내 · ${code}`, mailIdempotencyKey('myr_deposit_pending', o.id), 'myr_deposit_pending');
}

/* ---------------- 새 주문 (셀러 · 자기 줄만) ---------------- */
export function orderPaidSellerMail(o: MailOrder, sellerId: string, _ctx: MailCtx): MailTemplate | null {
	const mine = o.items.filter((i) => i.sellerId === sellerId);
	if (!mine.length) return null;
	const code = upper(o.code);
	const sub = mine.reduce((n, i) => n + i.amount, 0);
	const doc: MailDoc = {
		title: '새 주문이 들어왔어요',
		preheader: `${code} · ${itemLine(mine[0])}${mine.length > 1 ? ` 외 ${mine.length - 1}건` : ''}`,
		intro: `${mine[0].sellerName}님, 내 상품에 새 주문이 결제되었어요. 발송은 MYR 물류센터가 맡고, 판매 실적은 콘솔에서 확인할 수 있게 준비 중이에요.`,
		rows: [
			{ label: '주문번호', value: code },
			{ label: '내 상품', value: itemsText(mine) },
			{ label: '내 상품 금액', value: won(sub) }
		],
		notes: ['고객의 연락처·배송지는 메일에 싣지 않아요.']
	};
	return finish(doc, `[MYR] 새 주문 · ${code} · ${mine[0].name}`, mailIdempotencyKey('myr_order_paid', 'seller', o.id, sellerId), 'myr_order_paid_seller');
}

/* ---------------- 배송 시작 (고객 · 0069) ---------------- */
export type MailShipment = { courier: string; trackingNo: string; trackingUrl: string | null };
export function orderShippedMail(o: MailOrder, s: MailShipment, ctx: MailCtx): MailTemplate {
	const code = upper(o.code);
	const live = o.items.filter((i) => i.status !== 'CANCELED' && i.qty - i.refundedQty > 0).map((i) => ({ ...i, qty: i.qty - i.refundedQty }));
	const rows: MailRow[] = [
		{ label: '주문번호', value: code },
		{ label: '택배사', value: s.courier },
		{ label: '운송장', value: s.trackingNo },
		{ label: '상품', value: itemsText(live.length ? live : o.items) }
	];
	if (o.shipping) rows.push({ label: '받는 분', value: `${o.shipping.recipient} · ${o.shipping.address1}${o.shipping.address2 ? ` ${o.shipping.address2}` : ''}` });
	const notes = ['배송 조회는 운송장 등록 뒤 몇 시간 지나야 보일 수 있어요.'];
	if (!o.isMember) notes.push(guestNote);
	const doc: MailDoc = {
		title: '상품이 출발했어요',
		preheader: `${code} · ${s.courier} ${s.trackingNo}`,
		intro: `${o.buyerName}님, 주문 ${code}의 상품을 보냈어요.`,
		rows,
		button: s.trackingUrl ? { label: '배송 조회', url: s.trackingUrl } : { label: '주문 상세 보기', url: orderPageUrl(o, ctx) },
		notes
	};
	return finish(doc, `[MYR] 상품이 출발했어요 · ${code}`, mailIdempotencyKey('myr_order_shipped', o.id, s.trackingNo), 'myr_order_shipped');
}

/* ---------------- 환불 완료 (고객) ---------------- */
export function orderRefundedMail(o: MailOrder, r: MailRefund, ctx: MailCtx): MailTemplate {
	const code = upper(o.code);
	const byId = new Map(o.items.map((i) => [i.id, i]));
	const lines = r.items.map((x) => ({ ...(byId.get(x.itemId) ?? { name: '상품', option: '' }), qty: x.qty }));
	const rows: MailRow[] = [{ label: '주문번호', value: code }];
	if (r.deposit) {
		rows.push({ label: '취소된 상품', value: itemsText(o.items) });
	} else {
		rows.push({ label: '환불 상품', value: itemsText(lines) }, { label: '환불 금액', value: `${won(r.amount)}${r.full && o.shippingFee ? ' (배송비 포함)' : ''}` });
		if (r.deduction) rows.push({ label: '왕복 배송비 차감', value: `−${won(r.deduction)} (단순 변심 · 고객 부담)` });
	}
	if (r.reason) rows.push({ label: '사유', value: r.reason });
	const notes = r.deposit
		? ['입금 전이라 결제 없이 취소되었어요. 예약된 재고도 풀렸습니다.']
		: ['카드 결제 취소는 카드사 사정에 따라 영업일 기준 3~7일 뒤 명세서에 반영돼요. 간편결제·계좌이체는 해당 서비스의 내역에서 확인해주세요.'];
	if (!r.deposit && !r.full) notes.push('나머지 상품은 그대로 발송돼요.');
	const doc: MailDoc = {
		title: r.deposit ? '주문이 취소되었어요' : r.full ? '환불이 완료되었어요' : '일부 환불이 완료되었어요',
		preheader: r.deposit ? `${code} 취소` : `${code} · ${won(r.amount)} 환불`,
		intro: r.deposit ? `${o.buyerName}님, 주문 ${code}를 취소했어요.` : `${o.buyerName}님, 주문 ${code}의 ${r.full ? '결제가 취소' : '일부 상품이 환불'}되었어요.`,
		rows,
		button: { label: '주문 확인하기', url: orderPageUrl(o, ctx) },
		notes
	};
	const key = mailIdempotencyKey('myr_order_refunded', o.id, ...r.items.map((x) => `${x.itemId.slice(0, 8)}.${x.qty}`).sort());
	return finish(doc, `[MYR] ${r.deposit ? '주문이 취소되었어요' : '환불이 완료되었어요'} · ${code}`, key, 'myr_order_refunded');
}

/* ---------------- 환불 (셀러 · 자기 줄만) ---------------- */
export function orderRefundedSellerMail(o: MailOrder, r: MailRefund, sellerId: string, _ctx: MailCtx): MailTemplate | null {
	const byId = new Map(o.items.map((i) => [i.id, i]));
	const mine = r.items.map((x) => ({ x, i: byId.get(x.itemId) })).filter((p) => p.i && p.i.sellerId === sellerId) as { x: MailRefund['items'][number]; i: MailItem }[];
	if (!mine.length && !r.deposit) return null;
	const mineAll = r.deposit ? o.items.filter((i) => i.sellerId === sellerId) : [];
	if (r.deposit && !mineAll.length) return null;
	const code = upper(o.code);
	const sellerName = (mine[0]?.i ?? mineAll[0]).sellerName;
	const lines = r.deposit ? mineAll : mine.map((p) => ({ ...p.i, qty: p.x.qty }));
	const amount = r.deposit ? 0 : mine.reduce((n, p) => n + p.i.unitPrice * p.x.qty, 0);
	const doc: MailDoc = {
		title: r.deposit ? '주문이 취소되었어요' : '내 상품이 환불되었어요',
		preheader: `${code} · ${itemLine(lines[0])}`,
		intro: r.deposit ? `${sellerName}님, 입금 전 주문 ${code}가 취소되었어요.` : `${sellerName}님, 주문 ${code}에서 내 상품 일부가 환불되었어요. 판매 실적에서 빠집니다.`,
		rows: [
			{ label: '주문번호', value: code },
			{ label: r.deposit ? '취소된 내 상품' : '환불된 내 상품', value: itemsText(lines) },
			...(r.deposit ? [] : [{ label: '내 상품 환불 금액', value: won(amount) }]),
			...(r.reason ? [{ label: '사유', value: r.reason }] : []),
			...mine.filter((p) => p.x.note).map((p) => ({ label: `상세 · ${p.i.name}`, value: previewOf(p.x.note as string, 300) })),
			...mine.filter((p) => p.x.photoUrls?.length).map((p) => ({ label: `사진 · ${p.i.name}`, value: (p.x.photoUrls as string[]).map((u, i) => `${i + 1}) ${u}`).join('\n') }))
		],
		notes: mine.some((p) => p.x.photoUrls?.length) ? ['사진 링크는 7일 동안 열려요. 그 뒤에는 콘솔의 환불 내역에서 보세요.'] : undefined
	};
	const key = mailIdempotencyKey('myr_order_refunded', 'seller', o.id, sellerId, ...r.items.map((x) => `${x.itemId.slice(0, 8)}.${x.qty}`).sort());
	return finish(doc, `[MYR] ${r.deposit ? '주문 취소' : '환불'} · ${code} · ${lines[0].name}`, key, 'myr_order_refunded_seller');
}

/* ---------------- 고객 문의 (S7 · 0063) ---------------- */
/** 문의 1건 — mail-events.ts 가 myr_cs_conversations + 상품 + 셀러로 채운다 */
export type MailCs = { conversationId: string; code: string; type: string; buyerName: string; orderCode: string | null; productName: string; productCode: string; sellerName: string; isMember: boolean };
const PREVIEW_MAX = 200;
export function previewOf(body: string | null | undefined, max = PREVIEW_MAX): string {
	const s = (body ?? '').replace(/\s+/g, ' ').trim();
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
const csGuestNote = '비회원 문의는 접수한 기기(브라우저)에서 90일간 열려요. 다른 기기에서는 주문 조회 뒤 주문 상세의 문의 목록에서 여세요.';

/** 새 문의 → 셀러(크리에이터). 고객 연락처·배송지는 싣지 않는다. 답변 화면은 인플루언서 콘솔(준비 중) — 링크 없음 */
export function csOpenedSellerMail(cs: MailCs, message: { messageId: string; body: string }, _ctx: MailCtx): MailTemplate {
	const code = upper(cs.code);
	const rows: MailRow[] = [
		{ label: '문의번호', value: code },
		{ label: '유형', value: cs.type },
		{ label: '상품', value: cs.productName },
		{ label: '고객', value: cs.buyerName }
	];
	if (cs.orderCode) rows.push({ label: '주문번호', value: upper(cs.orderCode) });
	const doc: MailDoc = {
		title: '새 고객 문의가 접수되었어요',
		preheader: previewOf(message.body, 80),
		intro: `${cs.sellerName}님, 내 상품에 고객 문의가 접수되었어요. MYR 은 고객 문의를 크리에이터에게 바로 전달해요.`,
		rows,
		quote: previewOf(message.body),
		notes: ['답변은 인플루언서 콘솔에서 남길 수 있어요(준비 중). 그때까지 급한 문의는 MYR 운영팀(official@weglow.biz)이 함께 봅니다.', '고객의 연락처·배송지는 메일에 싣지 않아요.']
	};
	return finish(doc, `[MYR] 새 고객 문의 · ${code} · ${cs.type}`, mailIdempotencyKey('myr_cs_opened', message.messageId), 'myr_cs_opened');
}

/** 답변 → 고객 */
export function csRepliedMail(cs: MailCs, reply: { messageId: string; body: string }, ctx: MailCtx): MailTemplate {
	const code = upper(cs.code);
	const notes: string[] = [];
	if (!cs.isMember) notes.push(csGuestNote);
	const doc: MailDoc = {
		title: '문의에 답변이 달렸어요',
		preheader: previewOf(reply.body, 80),
		intro: `${cs.buyerName}님, ${cs.sellerName}님이 문의(${code})에 답변했어요.`,
		rows: [
			{ label: '문의번호', value: code },
			{ label: '상품', value: cs.productName }
		],
		quote: previewOf(reply.body),
		button: { label: '답변 전체 보기', url: url(ctx, `/cs/${encodeURIComponent(cs.code)}`) },
		notes
	};
	return finish(doc, `[MYR] 문의에 답변이 달렸어요 · ${code}`, mailIdempotencyKey('myr_cs_replied', reply.messageId), 'myr_cs_replied');
}

/* ---------------- 교환·환불 요청 (0078) ---------------- */
/** 요청 1건 — mail-events.ts 가 claim JSON + 주문으로 채운다 */
export type MailClaim = {
	code: string;
	kind: 'refund' | 'exchange';
	reason: string;
	qty: number;
	productName: string;
	option: string;
	orderId: string;
	orderCode: string;
	isMember: boolean;
	buyerName: string;
	sellerName: string;
	note: string | null;
	status: 'pending' | 'progress' | 'done' | 'rejected';
	resolutionName: string | null;
	message: string | null;
	/** 남은 할 일 안내(회수 · 환불 · 재발송) — claim-rules claimStepText */
	stepText: string;
	refundTotal: number | null;
	deduction: number;
};
const claimKind = (c: Pick<MailClaim, 'kind'>): string => (c.kind === 'exchange' ? '교환' : '환불');

/** 새 요청 → 그 줄의 셀러. 고객 연락처·배송지는 싣지 않는다 · 처리는 콘솔에서 — 버튼 없이(콘솔 CS 관리 · 처리 대기 뱃지에서 확인 · 대표 결정 2026-11-06) */
export function claimOpenedSellerMail(c: MailClaim): MailTemplate {
	const code = upper(c.code);
	const rows: MailRow[] = [
		{ label: '요청번호', value: code },
		{ label: '종류 · 사유', value: `${claimKind(c)} · ${c.reason}` },
		{ label: '상품', value: itemLine({ name: c.productName, option: c.option, qty: c.qty }) },
		{ label: '주문번호', value: upper(c.orderCode) },
		{ label: '고객', value: c.buyerName }
	];
	const doc: MailDoc = {
		title: `새 ${claimKind(c)} 요청이 들어왔어요`,
		preheader: `${code} · ${c.productName} · ${c.reason}`,
		intro: `${c.sellerName}님, 내 상품에 ${claimKind(c)} 요청이 접수되었어요. 크리에이터 콘솔 CS 관리 › 교환 · 환불에서 처리 방법을 골라 승인하거나 반려해주세요.`,
		rows,
		quote: c.note ? previewOf(c.note, 300) : undefined,
		notes: ['고객이 올린 사진은 콘솔 요청 상세에서 볼 수 있어요.', '고객의 연락처·배송지는 메일에 싣지 않아요.']
	};
	return finish(doc, `[MYR] 새 ${claimKind(c)} 요청 · ${code} · ${c.productName}`, mailIdempotencyKey('myr_claim_opened', c.code), 'myr_claim_opened');
}

/** 승인 · 반려 → 고객(크리에이터 메시지 + 다음 단계) */
export function claimDecidedMail(c: MailClaim, ctx: MailCtx): MailTemplate {
	const code = upper(c.code);
	const rejected = c.status === 'rejected';
	const rows: MailRow[] = [
		{ label: '요청번호', value: code },
		{ label: '상품', value: itemLine({ name: c.productName, option: c.option, qty: c.qty }) },
		{ label: '결과', value: rejected ? '반려' : `승인 · ${c.resolutionName ?? claimKind(c)}` }
	];
	if (!rejected && c.refundTotal != null) rows.push({ label: '환불 예정 금액', value: `${won(c.refundTotal)}${c.deduction ? ` (왕복 배송비 ${won(c.deduction)} 차감)` : ''}` });
	if (!rejected && c.stepText) rows.push({ label: '다음 단계', value: c.stepText });
	const notes: string[] = [];
	if (rejected) notes.push('반려 사유가 궁금하면 주문 상세의 [문의]로 크리에이터에게 물어볼 수 있어요.');
	if (!c.isMember) notes.push(guestNote);
	const doc: MailDoc = {
		title: rejected ? `${claimKind(c)} 요청이 반려되었어요` : `${claimKind(c)} 요청이 승인되었어요`,
		preheader: `${code} · ${c.productName}`,
		intro: `${c.buyerName}님, ${c.sellerName}님이 ${claimKind(c)} 요청(${code})을 ${rejected ? '반려' : '승인'}했어요.`,
		rows,
		quote: c.message ? previewOf(c.message, 500) : undefined,
		button: { label: '주문 확인하기', url: orderPageUrl({ code: c.orderCode, isMember: c.isMember }, ctx) },
		notes: notes.length ? notes : undefined
	};
	return finish(doc, `[MYR] ${claimKind(c)} 요청이 ${rejected ? '반려' : '승인'}되었어요 · ${code}`, mailIdempotencyKey('myr_claim_decided', c.code, c.status), 'myr_claim_decided');
}

/** 교환 재발송 송장 → 고객 */
export function claimReshippedMail(c: MailClaim, s: MailShipment, ctx: MailCtx): MailTemplate {
	const code = upper(c.code);
	const notes = ['배송 조회는 운송장 등록 뒤 몇 시간 지나야 보일 수 있어요.'];
	if (!c.isMember) notes.push(guestNote);
	const doc: MailDoc = {
		title: '교환 상품이 출발했어요',
		preheader: `${code} · ${s.courier} ${s.trackingNo}`,
		intro: `${c.buyerName}님, 요청(${code})하신 상품을 새로 보냈어요.`,
		rows: [
			{ label: '요청번호', value: code },
			{ label: '상품', value: itemLine({ name: c.productName, option: c.option, qty: c.qty }) },
			{ label: '택배사', value: s.courier },
			{ label: '운송장', value: s.trackingNo }
		],
		button: s.trackingUrl ? { label: '배송 조회', url: s.trackingUrl } : { label: '주문 상세 보기', url: orderPageUrl({ code: c.orderCode, isMember: c.isMember }, ctx) },
		notes
	};
	return finish(doc, `[MYR] 교환 상품이 출발했어요 · ${code}`, mailIdempotencyKey('myr_claim_reshipped', c.code, s.trackingNo), 'myr_claim_reshipped');
}

/* ---------------- 크리에이터 초대 (0070 · 결정 14) ---------------- */
/** 초대 1건 — invite.server.ts issueInvite 가 채운다. link = 콘솔 `/invite/<토큰>`(토큰 원문은 이 메일과 운영자 화면에만) */
export type MailInvite = { inviteId: string; email: string; link: string; expiresAt: string; inviter: string };
const kstDate = (iso: string): string => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });

/** 초대장 → 초대받은 크리에이터. 링크가 곧 가입 권한이라 멱등 키는 초대 id(다시 초대하면 새 id · 새 메일) */
export function creatorInviteMail(inv: MailInvite): MailTemplate {
	const doc: MailDoc = {
		title: 'MYR 크리에이터로 초대받았어요',
		preheader: `${inv.inviter}이 크리에이터 스튜디오로 초대했어요 — ${kstDate(inv.expiresAt)}까지 가입할 수 있어요`,
		intro: `${inv.inviter}이 MYR 크리에이터 스튜디오로 초대했어요. 계정을 만들면 상품 등록부터 샵 오픈, 주문 · CS 관리까지 한 곳에서 할 수 있어요.`,
		rows: [
			{ label: '초대받은 이메일', value: inv.email },
			{ label: '링크 유효기간', value: `${kstDate(inv.expiresAt)}까지` }
		],
		button: { label: '가입하기', url: inv.link },
		notes: [
			'초대 링크는 이 이메일로 한 번만 쓸 수 있어요. 다시 초대받으면 이전 링크는 열리지 않아요.',
			'링크가 만료됐다면 링크 화면의 "새 초대 요청하기"를 눌러주세요.',
			'초대받을 일이 없었다면 이 메일은 무시해도 괜찮아요.'
		]
	};
	return finish(doc, '[MYR] 크리에이터 스튜디오 초대장이 도착했어요', mailIdempotencyKey('myr_creator_invite', inv.inviteId), 'myr_creator_invite');
}

/* ---------------- 크리에이터 비밀번호 재설정 (2026-11-05 · Supabase 기본 메일 대신) ---------------- */
/** link = 콘솔 /auth/confirm(token_hash · 1회용 · Supabase 링크 만료 설정 — 기본 1시간). 멱등 키 = 토큰(요청마다 새 메일) */
export type MailPasswordReset = { name: string; email: string; link: string; tokenHash: string };
export function passwordResetMail(r: MailPasswordReset): MailTemplate {
	const doc: MailDoc = {
		title: '비밀번호를 새로 정해주세요',
		preheader: 'MYR 크리에이터 스튜디오 비밀번호 재설정 링크예요',
		intro: `${r.name}님, MYR 크리에이터 스튜디오 비밀번호 재설정을 요청하셨어요. 아래 버튼을 눌러 새 비밀번호를 정해주세요.`,
		rows: [{ label: '계정', value: r.email }],
		button: { label: '새 비밀번호 정하기', url: r.link },
		notes: [
			'링크는 한 번만 쓸 수 있고, 1시간이 지나면 열리지 않아요. 그때는 로그인 화면의 "비밀번호를 잊으셨나요?"로 다시 받아주세요.',
			'요청하지 않았다면 이 메일은 무시해도 괜찮아요. 비밀번호는 바뀌지 않아요.'
		]
	};
	return finish(doc, '[MYR] 크리에이터 스튜디오 비밀번호 재설정', mailIdempotencyKey('myr_password_reset', r.tokenHash.slice(0, 40)), 'myr_password_reset');
}
