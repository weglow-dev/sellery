// 거래 메일 템플릿·레이아웃 — apps/myr-shop/src/lib/mail/{templates,layout}.ts · 셀러는 자기 줄만 · 비회원 링크 · 이스케이프 · 멱등 키
import { describe, expect, it } from 'vitest';
import { escapeHtml, mailIdempotencyKey, renderMailHtml, renderMailText } from '../mail/layout';
import { creatorInviteMail, csOpenedSellerMail, csRepliedMail, depositPendingMail, orderPaidCustomerMail, orderPaidSellerMail, orderPageUrl, orderRefundedMail, orderRefundedSellerMail, orderShippedMail, type MailOrder, type MailRefund } from '../mail/templates';

const ctx = { siteUrl: 'https://myr-shop.vercel.app/' };
const order = (over: Partial<MailOrder> = {}): MailOrder => ({
	id: '11111111-2222-3333-4444-555555555555',
	code: 'myr1007',
	status: 'PAID',
	buyerName: '김고객',
	isMember: true,
	shipping: { recipient: '김고객', phone: '010-0000-0000', address1: '부산시 해운대구 센텀중앙로 55', address2: '1203호', postcode: '48059' },
	items: [
		{ id: 'i-a', name: '지유 레시피 그래놀라', option: '2봉', qty: 2, unitPrice: 16000, amount: 32000, sellerId: 's-jiyu', sellerName: '지유', status: 'PAID', refundedQty: 0 },
		{ id: 'i-b', name: '혜린 단백질 쉐이크', option: '', qty: 1, unitPrice: 29000, amount: 29000, sellerId: 's-hyerin', sellerName: '혜린', status: 'PAID', refundedQty: 0 }
	],
	itemsAmount: 61000,
	shippingFee: 0,
	amount: 61000,
	refundAmount: 0,
	paymentMethod: '카드',
	deposit: null,
	...over
});

describe('레이아웃', () => {
	it('HTML 은 입력을 이스케이프하고 text 대체본은 같은 내용', () => {
		const doc = { title: '제목 <b>', intro: '소개 & 설명', rows: [{ label: '주문번호', value: 'MYR1001' }], button: { label: '열기', url: 'https://x.test/a?b=1&c=2' }, notes: ['메모'] };
		const html = renderMailHtml(doc);
		expect(html).toContain('제목 &lt;b&gt;');
		expect(html).toContain('소개 &amp; 설명');
		expect(html).toContain('href="https://x.test/a?b=1&amp;c=2"');
		expect(html).toContain('MYR'); // 워드마크
		expect(html).toContain('(주)위글로우');
		const text = renderMailText(doc);
		expect(text).toContain('주문번호: MYR1001');
		expect(text).toContain('열기: https://x.test/a?b=1&c=2');
		expect(text).toContain('official@weglow.biz');
	});
	it('escapeHtml · mailIdempotencyKey', () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
		expect(mailIdempotencyKey('myr_order_paid', 'customer', 'o 1', null)).toBe('myr_order_paid:customer:o_1');
		expect(mailIdempotencyKey('e', '가')).toBe('e:_ac00_');
	});
});

describe('주문 확인(고객)', () => {
	it('회원은 /orders/<code> · 상품 전부 · 금액 · 배송지', () => {
		const m = orderPaidCustomerMail(order(), ctx);
		expect(m.subject).toBe('[MYR] 주문이 접수되었어요 · MYR1007');
		expect(m.html).toContain('https://myr-shop.vercel.app/orders/myr1007');
		expect(m.text).toContain('지유 레시피 그래놀라 · 2봉 × 2');
		expect(m.text).toContain('혜린 단백질 쉐이크 × 1');
		expect(m.text).toContain('결제 금액: ₩61,000');
		expect(m.text).toContain('부산시 해운대구 센텀중앙로 55 1203호');
		expect(m.text).not.toContain('비회원');
		expect(m.idempotencyKey).toBe('myr_order_paid:customer:11111111-2222-3333-4444-555555555555');
		expect(m.tag).toBe('myr_order_paid');
	});
	it('비회원은 /orders/g/<code> + 조회 안내 · 배송비는 금액 옆에', () => {
		const m = orderPaidCustomerMail(order({ isMember: false, shippingFee: 3000, amount: 64000 }), ctx);
		expect(m.html).toContain('https://myr-shop.vercel.app/orders/g/myr1007');
		expect(m.text).toContain('비회원 주문은');
		expect(m.text).toContain('₩64,000 (배송비 ₩3,000 포함)');
		expect(orderPageUrl({ code: 'myr1', isMember: false }, ctx)).toBe('https://myr-shop.vercel.app/orders/g/myr1');
	});
	it('사용자 입력(이름·주소)은 이스케이프', () => {
		const m = orderPaidCustomerMail(order({ buyerName: '<script>x</script>' }), ctx);
		expect(m.html).not.toContain('<script>');
		expect(m.html).toContain('&lt;script&gt;');
	});
});

describe('입금 안내(가상계좌)', () => {
	it('계좌·예금주·기한 · 멱등 키는 주문당 하나', () => {
		const m = depositPendingMail(order({ status: 'WAITING_DEPOSIT', deposit: { bank: '신한은행', account: '110-123-456789', holder: '(주)위글로우', due: '2026-11-05T23:59:59+09:00' } }), ctx);
		expect(m.subject).toBe('[MYR] 입금 안내 · MYR1007');
		expect(m.text).toContain('입금 계좌: 신한은행 110-123-456789 ((주)위글로우)');
		expect(m.text).toContain('입금 기한: 11월 5일');
		expect(m.text).toContain('입금 금액: ₩61,000');
		expect(m.idempotencyKey).toBe('myr_deposit_pending:11111111-2222-3333-4444-555555555555');
	});
	it('계좌 정보가 없어도(raw 미도착) 금액·주문번호는 나간다', () => {
		const m = depositPendingMail(order({ status: 'WAITING_DEPOSIT' }), ctx);
		expect(m.text).not.toContain('입금 계좌');
		expect(m.text).toContain('주문번호: MYR1007');
	});
});

describe('새 주문(셀러) — 자기 줄만', () => {
	it('지유에게는 지유 줄만 · 배송지·연락처 없음 · 셀러별 멱등 키', () => {
		const m = orderPaidSellerMail(order(), 's-jiyu', ctx)!;
		expect(m.subject).toBe('[MYR] 새 주문 · MYR1007 · 지유 레시피 그래놀라');
		expect(m.text).toContain('지유님');
		expect(m.text).toContain('지유 레시피 그래놀라 · 2봉 × 2');
		expect(m.text).not.toContain('혜린 단백질 쉐이크');
		expect(m.text).toContain('내 상품 금액: ₩32,000');
		expect(m.text).not.toContain('센텀중앙로');
		expect(m.text).not.toContain('010-');
		expect(m.idempotencyKey).toBe('myr_order_paid:seller:11111111-2222-3333-4444-555555555555:s-jiyu');
		const h = orderPaidSellerMail(order(), 's-hyerin', ctx)!;
		expect(h.text).toContain('혜린 단백질 쉐이크 × 1');
		expect(h.text).not.toContain('그래놀라');
		expect(h.idempotencyKey).not.toBe(m.idempotencyKey);
	});
	it('줄이 없는 셀러는 null', () => {
		expect(orderPaidSellerMail(order(), 's-nobody', ctx)).toBeNull();
	});
});

describe('환불(고객)', () => {
	const partial: MailRefund = { items: [{ itemId: 'i-a', qty: 1, amount: 16000 }], amount: 16000, full: false, reason: '고객 요청', deposit: false };
	it('부분 환불 — 환불된 줄×수량 · 금액 · 나머지 발송 안내', () => {
		const m = orderRefundedMail(order({ status: 'PARTIAL_REFUNDED', refundAmount: 16000 }), partial, ctx);
		expect(m.subject).toBe('[MYR] 환불이 완료되었어요 · MYR1007');
		expect(m.text).toContain('일부 환불이 완료되었어요');
		expect(m.text).toContain('환불 상품: 지유 레시피 그래놀라 · 2봉 × 1');
		expect(m.text).not.toContain('혜린');
		expect(m.text).toContain('환불 금액: ₩16,000');
		expect(m.text).toContain('나머지 상품은 그대로 발송돼요');
		expect(m.text).toContain('사유: 고객 요청');
		expect(m.html).toContain('/orders/myr1007');
	});
	it('전액 환불 — 배송비 포함 표기 · 다른 줄 조합은 다른 멱등 키', () => {
		const full: MailRefund = { items: [{ itemId: 'i-a', qty: 2, amount: 32000 }, { itemId: 'i-b', qty: 1, amount: 29000 }], amount: 64000, full: true, reason: '', deposit: false };
		const m = orderRefundedMail(order({ status: 'REFUNDED', shippingFee: 3000, amount: 64000 }), full, ctx);
		expect(m.text).toContain('환불이 완료되었어요');
		expect(m.text).toContain('환불 금액: ₩64,000 (배송비 포함)');
		expect(m.text).not.toContain('나머지 상품');
		expect(m.text).not.toContain('사유:');
		const p = orderRefundedMail(order(), partial, ctx);
		expect(m.idempotencyKey).not.toBe(p.idempotencyKey);
		expect(m.idempotencyKey.startsWith('myr_order_refunded:11111111-2222-3333-4444-555555555555:')).toBe(true);
	});
	it('입금 대기 취소 — 결제 없이 취소 문구 · 환불 금액 없음', () => {
		const dep: MailRefund = { items: [{ itemId: 'i-a', qty: 2, amount: 32000 }, { itemId: 'i-b', qty: 1, amount: 29000 }], amount: 61000, full: true, reason: '고객 요청', deposit: true };
		const m = orderRefundedMail(order({ status: 'CANCELED' }), dep, ctx);
		expect(m.subject).toBe('[MYR] 주문이 취소되었어요 · MYR1007');
		expect(m.text).toContain('입금 전이라 결제 없이 취소');
		expect(m.text).not.toContain('환불 금액');
		expect(m.text).toContain('취소된 상품: 지유 레시피 그래놀라 · 2봉 × 2');
	});
});

describe('환불(셀러) — 자기 줄만', () => {
	it('환불된 줄의 셀러만 받고, 금액은 단가×수량', () => {
		const r: MailRefund = { items: [{ itemId: 'i-a', qty: 1, amount: 16000 }], amount: 16000, full: false, reason: '고객 요청', deposit: false };
		const m = orderRefundedSellerMail(order(), r, 's-jiyu', ctx)!;
		expect(m.subject).toBe('[MYR] 환불 · MYR1007 · 지유 레시피 그래놀라');
		expect(m.text).toContain('환불된 내 상품: 지유 레시피 그래놀라 · 2봉 × 1');
		expect(m.text).toContain('내 상품 환불 금액: ₩16,000');
		expect(orderRefundedSellerMail(order(), r, 's-hyerin', ctx)).toBeNull();
	});
	it('입금 대기 취소는 모든 셀러에게 자기 줄 · 멱등 키가 셀러별로 다르다', () => {
		const dep: MailRefund = { items: [{ itemId: 'i-a', qty: 2, amount: 32000 }, { itemId: 'i-b', qty: 1, amount: 29000 }], amount: 61000, full: true, reason: '', deposit: true };
		const j = orderRefundedSellerMail(order({ status: 'CANCELED' }), dep, 's-jiyu', ctx)!;
		const h = orderRefundedSellerMail(order({ status: 'CANCELED' }), dep, 's-hyerin', ctx)!;
		expect(j.text).toContain('취소된 내 상품: 지유 레시피 그래놀라 · 2봉 × 2');
		expect(j.text).not.toContain('혜린');
		expect(h.text).toContain('혜린 단백질 쉐이크 × 1');
		expect(j.idempotencyKey).not.toBe(h.idempotencyKey);
		expect(orderRefundedSellerMail(order(), dep, 's-nobody', ctx)).toBeNull();
	});
	it('셀러 환불 메일 — 내 줄의 상세(note)만 "상세 · 상품명" 행으로 (0067)', () => {
		const o = order();
		const mine = o.items[0];
		const r = { items: [{ itemId: mine.id, qty: 1, amount: mine.unitPrice, note: '포장이 찢어졌어요' }], amount: mine.unitPrice, full: false, reason: '상품 불량·파손', deposit: false };
		const m = orderRefundedSellerMail(o, r, mine.sellerId, ctx)!;
		expect(m.text).toContain(`상세 · ${mine.name}`);
		expect(m.text).toContain('포장이 찢어졌어요');
		expect(orderRefundedMail(o, r, ctx).text).not.toContain('포장이 찢어졌어요');
	});
	it('셀러 환불 메일 — 사진 서명 URL 행 + 7일 안내 · 고객 메일엔 없음 (0068)', () => {
		const o = order();
		const mine = o.items[0];
		const r = { items: [{ itemId: mine.id, qty: 1, amount: mine.unitPrice, photoUrls: ['https://x.test/a.jpg?token=1', 'https://x.test/b.jpg?token=2'] }], amount: mine.unitPrice, full: false, reason: '상품 불량·파손', deposit: false };
		const m = orderRefundedSellerMail(o, r, mine.sellerId, ctx)!;
		expect(m.text).toContain(`사진 · ${mine.name}`);
		expect(m.text).toContain('2) https://x.test/b.jpg?token=2');
		expect(m.text).toContain('7일 동안');
		expect(orderRefundedMail(o, r, ctx).text).not.toContain('x.test');
	});
});

describe('고객 문의 메일 (S7)', () => {
	const cs = { conversationId: 'c1', code: 'cs1001', type: '배송 문의', buyerName: '홍길동', orderCode: 'myr1001', productName: '민지 글루타치온 스틱', productCode: 'minji-glutathione-lemon', sellerName: '민지 루틴', isMember: false };
	it('새 문의 → 셀러: 유형·상품·고객·주문번호 · 본문 인용 · 연락처 없음 · 멱등 키 = 메시지', () => {
		const m = csOpenedSellerMail(cs, { messageId: 'm1', body: '  배송이  언제\n출발하나요?  ' }, ctx);
		expect(m.subject).toBe('[MYR] 새 고객 문의 · CS1001 · 배송 문의');
		expect(m.text).toContain('민지 루틴님');
		expect(m.text).toContain('주문번호: MYR1001');
		expect(m.text).toContain('> 배송이 언제 출발하나요?');
		expect(m.text).toContain('연락처·배송지는 메일에 싣지 않아요');
		expect(m.idempotencyKey).toBe('myr_cs_opened:m1');
		expect(m.tag).toBe('myr_cs_opened');
	});
	it('답변 → 고객: 링크 /cs/<code> · 비회원 안내 · 긴 본문은 200자에서 자름', () => {
		const m = csRepliedMail(cs, { messageId: 'm3', body: '가'.repeat(300) }, ctx);
		expect(m.subject).toBe('[MYR] 문의에 답변이 달렸어요 · CS1001');
		expect(m.html).toContain('https://myr-shop.vercel.app/cs/cs1001');
		expect(m.text).toContain('비회원 문의는');
		expect(m.text).not.toContain('추가 문의');
		expect(m.text).toContain('가'.repeat(199) + '…');
		expect(m.idempotencyKey).toBe('myr_cs_replied:m3');
		expect(csRepliedMail({ ...cs, isMember: true }, { messageId: 'm3', body: 'x' }, ctx).text).not.toContain('비회원 문의는');
	});
});

describe('배송 시작 메일 (0069)', () => {
	it('택배사·운송장·남은 상품·받는 분 · 조회 버튼 · 멱등 키 = 주문 + 운송장 · 비회원 안내', () => {
		const o = order({ items: [order().items[0], { ...order().items[1], status: 'REFUNDED', refundedQty: 1 }] });
		const m = orderShippedMail(o, { courier: 'CJ대한통운', trackingNo: '1234567890', trackingUrl: 'https://trace.cjlogistics.com/next/tracking.html?wblNo=1234567890' }, ctx);
		expect(m.subject).toBe('[MYR] 상품이 출발했어요 · MYR1007');
		expect(m.text).toContain('CJ대한통운');
		expect(m.text).toContain('1234567890');
		expect(m.text).toContain('지유 레시피 그래놀라 · 2봉 × 2');
		expect(m.text).not.toContain('혜린 단백질 쉐이크');
		expect(m.text).toContain('김고객 · 부산시 해운대구 센텀중앙로 55 1203호');
		expect(m.html).toContain('trace.cjlogistics.com');
		expect(m.idempotencyKey).toBe('myr_order_shipped:11111111-2222-3333-4444-555555555555:1234567890');
		expect(m.text).not.toContain('비회원 주문은');
		const g = orderShippedMail(order({ isMember: false }), { courier: '한진택배', trackingNo: '1', trackingUrl: null }, ctx);
		expect(g.text).toContain('비회원 주문은');
		expect(g.html).toContain('/orders/g/myr1007');
	});
});

describe('크리에이터 초대 메일', () => {
	const inv = { inviteId: '11111111-aaaa-4bbb-8ccc-222222222222', email: 'creator@myr.kr', link: `https://myr-influencer.vercel.app/invite/${'ab'.repeat(32)}`, expiresAt: '2026-11-11T05:00:00Z', inviter: 'MYR 파트너팀' };
	it('초대 링크 버튼 · 이메일 · 한국 날짜 유효기간 · 1회용 안내', () => {
		const m = creatorInviteMail(inv);
		expect(m.subject).toBe('[MYR] 크리에이터 스튜디오 초대장이 도착했어요');
		expect(m.html).toContain(`href="${inv.link}"`);
		expect(m.text).toContain(`가입하기: ${inv.link}`);
		expect(m.text).toContain('초대받은 이메일: creator@myr.kr');
		expect(m.text).toContain('11월 11일');
		expect(m.text).toContain('한 번만');
		expect(m.tag).toBe('myr_creator_invite');
	});
	it('멱등 키는 초대 id — 다시 초대(새 id)하면 새 메일', () => {
		expect(creatorInviteMail(inv).idempotencyKey).toBe(`myr_creator_invite:${inv.inviteId}`);
		expect(creatorInviteMail({ ...inv, inviteId: 'other' }).idempotencyKey).not.toBe(creatorInviteMail(inv).idempotencyKey);
	});
});
