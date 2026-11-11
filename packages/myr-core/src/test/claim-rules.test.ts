// 교환 · 환불 요청 순수 규칙(0078) — packages/myr-core/src/claim-rules.ts
import { describe, expect, it } from 'vitest';
import type { OrderItem } from '../order-view';
import {
	canDecide,
	claimableItems,
	claimFromJson,
	claimMessage,
	claimPolicy,
	claimOpenDeduction,
	claimQtyText,
	claimRefundedText,
	claimRefundView,
	changeMindNote,
	claimShippingBack,
	claimsFromJson,
	claimStepText,
	claimTimeline,
	kindAllowed,
	parseClaimDecideBody,
	parseClaimOpenBody,
	parseClaimOpsInput,
	photoRequired,
	refundAmountText,
	refundCalcText,
	refundPaid,
	refundPaidNote,
	resolutionOption,
	type Claim
} from '../claim-rules';

const ORDER = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const PHOTO = `${ORDER}/${ITEM}/33333333-3333-4333-8333-333333333333.jpg`;

const json = (o: Record<string, unknown> = {}) => ({
	id: 'c1',
	code: 'rq2001',
	status: 'pending',
	step: 'decide',
	kind: 'refund',
	reason: '단순 변심',
	qty: 1,
	note: '미개봉이에요',
	photos: [PHOTO],
	options: ['partial', 'refund', 'nope'],
	resolution: null,
	message: null,
	decided_at: null,
	needs_collect: false,
	collected_at: null,
	needs_reship: false,
	reship_courier: null,
	reship_tracking_no: null,
	reshipped_at: null,
	needs_refund: false,
	deduction: 0,
	return_fee: 6000,
	refund_amount: null,
	refunded_at: null,
	done_at: null,
	created_at: '2026-11-06T01:00:00Z',
	amount: 32000,
	buyer_name: '홍길동',
	buyer_phone: '010-****-5678',
	order: { id: ORDER, code: 'myr1001', paid_at: '2026-11-01T00:00:00Z', is_member: true, item: { id: ITEM, name: '포도 젤리', option: '', qty: 2, unit_price: 32000, refunded_qty: 0, status: 'PAID', ship_status: 'DELIVERED', shipped_at: null, delivered_at: '2026-11-04T00:00:00Z' } },
	product: { id: 'p1', code: 'minji-grape-jelly', name: '포도 젤리', tile: null, icon: 'grape', thumb_url: null },
	seller: { id: 's1', name: '민지 루틴', handle: '@minji.routine' },
	...o
});
const claim = (o: Record<string, unknown> = {}) => claimFromJson(json(o)) as Claim;

describe('입력 — 요청 남기기', () => {
	it('정상 — 코드 소문자 · 상세 정리 · 사진 중복 제거', () => {
		expect(parseClaimOpenBody({ orderCode: 'MYR1001', kind: 'exchange', reason: '파손 · 누액', items: [{ itemId: ITEM, qty: 1, note: '  터졌어요 ', photos: [PHOTO, PHOTO] }] })).toEqual({
			orderCode: 'myr1001',
			kind: 'exchange',
			reason: '파손 · 누액',
			items: [{ item_id: ITEM, qty: 1, note: '터졌어요', photos: [PHOTO] }]
		});
	});
	it('형식 틀리면 null — 종류 · 사유 · 빈 줄 · 수량 · 사진 경로 · 4장', () => {
		const ok = { orderCode: 'myr1001', kind: 'refund', reason: '오배송', items: [{ itemId: ITEM, qty: 1 }] };
		expect(parseClaimOpenBody({ ...ok, kind: 'swap' })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, reason: '그냥' })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 10 }] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 1, photos: ['../x.jpg'] }] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 1, photos: [PHOTO, PHOTO, PHOTO, PHOTO] }] })).toBeNull();
		expect(parseClaimOpenBody(null)).toBeNull();
	});
	it('단순 변심은 환불만 · 파손 · 오배송은 사진 필수', () => {
		expect([kindAllowed('exchange', '단순 변심'), kindAllowed('refund', '단순 변심'), kindAllowed('exchange', '오배송'), kindAllowed('exchange', '')]).toEqual([false, true, true, true]);
		expect([photoRequired('단순 변심'), photoRequired('파손 · 누액'), photoRequired('오배송'), photoRequired('')]).toEqual([false, true, true, false]);
	});
});

describe('입력 — 승인 · 반려 · 운영', () => {
	it('승인은 처리 방법 필수 · 반려는 메시지만 · 메시지 1~1000자', () => {
		expect(parseClaimDecideBody({ decision: 'approve', resolution: 'partial', message: ' 확인했어요 ' })).toEqual({ decision: 'approve', resolution: 'partial', message: '확인했어요' });
		expect(parseClaimDecideBody({ decision: 'reject', resolution: 'refund', message: '어려워요' })).toEqual({ decision: 'reject', resolution: null, message: '어려워요' });
		expect(parseClaimDecideBody({ decision: 'approve', message: '확인' })).toBeNull();
		// 승인은 메시지 선택(0091) · 반려는 필수
		expect(parseClaimDecideBody({ decision: 'approve', resolution: 'refund', message: '   ' })).toEqual({ decision: 'approve', resolution: 'refund', message: '' });
		expect(parseClaimDecideBody({ decision: 'approve', resolution: 'refund' })).toEqual({ decision: 'approve', resolution: 'refund', message: '' });
		expect(parseClaimDecideBody({ decision: 'reject', message: '   ' })).toBeNull();
		expect(parseClaimDecideBody({ decision: 'reject', message: '가'.repeat(1001) })).toBeNull();
		expect([canDecide(null, '안내'), canDecide('refund', ' '), canDecide('refund', '안내'), canDecide('refund', '가'.repeat(1001))]).toEqual([false, true, true, false]);
	});
	it('운영 — 요청번호 대문자 · 택배사 별칭 · 운송장 숫자만', () => {
		expect(parseClaimOpsInput({ code: 'RQ2001', action: 'collected' })).toEqual({ ok: true, input: { code: 'rq2001', action: 'collected' } });
		expect(parseClaimOpsInput({ code: 'rq2001', action: 'reship', courier: '한진', trackingNo: '4400-1111-2222' })).toEqual({ ok: true, input: { code: 'rq2001', action: 'reship', courier: '한진택배', trackingNo: '440011112222' } });
		expect(parseClaimOpsInput({ code: 'cs1001', action: 'refund' })).toMatchObject({ ok: false, field: 'code' });
		expect(parseClaimOpsInput({ code: 'rq1', action: 'delete' })).toMatchObject({ ok: false, field: 'action' });
		expect(parseClaimOpsInput({ code: 'rq1', action: 'reship', courier: '택배', trackingNo: '123456789012' })).toMatchObject({ ok: false, field: 'courier' });
		expect(parseClaimOpsInput({ code: 'rq1', action: 'reship', courier: 'cj', trackingNo: '12' })).toMatchObject({ ok: false, field: 'trackingNo' });
	});
});

describe('파서', () => {
	it('JSON → Claim · 모르는 처리 방법은 버린다 · 주문 줄 · 상품 · 셀러', () => {
		const c = claim();
		expect([c.code, c.status, c.step, c.kind, c.reason, c.amount, c.returnFee, c.buyerPhone]).toEqual(['rq2001', 'pending', 'decide', 'refund', '단순 변심', 32000, 6000, '010-****-5678']);
		expect(c.options).toEqual(['partial', 'refund']);
		expect([c.order.code, c.order.item.id, c.order.item.shipStatus, c.product?.icon, c.seller?.name]).toEqual(['myr1001', ITEM, 'DELIVERED', 'grape', '민지 루틴']);
	});
	it('필수 칸 · 상태 · 종류 · 사유가 틀리면 null · 목록은 걸러낸다', () => {
		expect(claimFromJson(json({ status: 'weird' }))).toBeNull();
		expect(claimFromJson(json({ reason: '그냥' }))).toBeNull();
		expect(claimFromJson(null)).toBeNull();
		expect(claimsFromJson([json(), { id: 'x' }, json({ id: 'c2', code: 'rq2002' })]).map((c) => c.code)).toEqual(['rq2001', 'rq2002']);
		expect(claimsFromJson('nope')).toEqual([]);
	});
});

describe('처리 방법 이름 · 금액', () => {
	it('요청 종류에 따라 이름이 다르다 · 금액은 서버 예상 금액(refundQuote) 그대로 · 파손 환불은 회수 없이', () => {
		const refund = claim();
		expect(resolutionOption('partial', refund, { goods: 32000, shippingBack: 0, deduction: 6000, amount: 26000 })).toEqual({
			id: 'partial',
			title: '부분 환불 (왕복 배송비 차감)',
			desc: '₩26,000 (상품 ₩32,000 − 왕복 배송비 ₩6,000) · 회수 확인 뒤 환불'
		});
		expect(resolutionOption('reship', refund).title).toBe('교환으로 전환');
		const broken = claim({ kind: 'exchange', reason: '파손 · 누액', options: ['reship', 'refund'] });
		expect(resolutionOption('reship', broken).title).toBe('새 제품 재발송');
		expect(resolutionOption('refund', broken, { goods: 32000, shippingBack: 0, deduction: 0, amount: 32000 })).toEqual({ id: 'refund', title: '환불로 전환', desc: '₩32,000 · 회수 없이 바로 환불' });
		expect(resolutionOption('reship_collect', claim({ kind: 'exchange', reason: '오배송' })).title).toBe('재발송 + 회수');
	});
	it('결제 금액 − 왕복 배송비 = 환불 금액 — 마지막 줄이면 결제 금액에 배송비 · 예상 금액이 없으면(계산 실패) 금액 없이 안내만', () => {
		const last = { goods: 36000, shippingBack: 3000, deduction: 6000, amount: 33000 };
		expect(refundPaid(last)).toBe(39000);
		expect(refundCalcText(last)).toBe('(상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)');
		expect(refundAmountText(last)).toBe('₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)');
		expect(refundAmountText({ goods: 36000, shippingBack: 3000, deduction: 0, amount: 39000 })).toBe('₩39,000 (상품 ₩36,000 + 배송비 ₩3,000)');
		expect(refundAmountText({ goods: 32000, shippingBack: 0, deduction: 0, amount: 32000 })).toBe('₩32,000');
		expect(resolutionOption('partial', claim(), last).desc).toBe('₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000) · 회수 확인 뒤 환불');
		expect(resolutionOption('partial', claim()).desc).toBe('회수 확인 뒤 환불');
		expect(resolutionOption('refund', claim(), null).desc).toBe('회수 확인 뒤 환불');
	});
	it('결제 금액 아래 한 줄 — 배송비 함께 · 무료배송 주문 · 다른 상품이 남아 배송비는 나중', () => {
		expect(refundPaidNote({ goods: 36000, shippingBack: 3000 }, 3000)).toBe('상품 ₩36,000 + 배송비 ₩3,000');
		expect(refundPaidNote({ goods: 32000, shippingBack: 0 }, 0)).toBe('상품 ₩32,000 · 무료배송 주문');
		expect(refundPaidNote({ goods: 36000, shippingBack: 0 }, 3000)).toBe('상품 ₩36,000 · 배송비 ₩3,000는 주문 전체가 환불될 때 함께');
		// 옛 응답(0090 전 · 배송비 모름) — 무료배송으로 잘못 적지 않는다
		expect(refundPaidNote({ goods: 32000, shippingBack: 0 }, null)).toBe('상품 ₩32,000');
	});
	it('환불 요청 수량 — 주문 수량 중 일부일 때만', () => {
		const order = { ...claim().order, item: { ...claim().order.item, qty: 2 } };
		expect(claimQtyText({ qty: 1, order })).toBe('1개 (주문 2개 중)');
		expect(claimQtyText({ qty: 2, order })).toBeNull();
	});
	it('새 요청의 예상 차감 — 단순 변심 환불만 왕복 배송비', () => {
		expect(claimOpenDeduction('refund', '단순 변심', 6000)).toBe(6000);
		expect(claimOpenDeduction('refund', '파손 · 누액', 6000)).toBe(0);
		expect(claimOpenDeduction('exchange', '오배송', 6000)).toBe(0);
		expect(claimOpenDeduction('refund', '', 6000)).toBe(0);
	});
	it('환불 완료 — 기록된 환불액 · 차감 그대로 결제 기준으로 펼친다(다시 계산하지 않는다)', () => {
		// MYR2087 — 줄 36,000 · 차감 6,000 · 기록 33,000 → 함께 돌려준 배송비 3,000
		expect(claimShippingBack({ amount: 36000, deduction: 6000, refundAmount: 33000 })).toBe(3000);
		expect(claimRefundView({ amount: 36000, deduction: 6000, refundAmount: 33000 })).toEqual({ goods: 36000, shippingBack: 3000, deduction: 6000, amount: 33000 });
		expect(claimRefundedText({ amount: 36000, deduction: 6000, refundAmount: 33000 })).toBe('₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)');
		expect(claimRefundedText({ amount: 32000, deduction: 6000, refundAmount: 26000 })).toBe('₩26,000 (상품 ₩32,000 − 왕복 배송비 ₩6,000)');
		expect(claimRefundedText({ amount: 32000, deduction: 0, refundAmount: 32000 })).toBe('₩32,000');
		expect(claimRefundedText({ amount: 32000, deduction: 0, refundAmount: null })).toBeNull();
		expect(claimShippingBack({ amount: 32000, deduction: 0, refundAmount: null })).toBe(0);
	});
	it('처리 기준 문구 — 사유별 · 배송비 숫자는 설정값', () => {
		expect(claimPolicy('단순 변심', 7000)[1]).toBe('왕복 배송비 ₩7,000은 고객 부담 — 환불 금액에서 빼요');
		// 설정을 못 읽으면 숫자를 짐작하지 않는다(예전 6,000 기본값 대신)
		expect(claimPolicy('단순 변심', null)[1]).toBe('왕복 배송비는 고객 부담 — 환불 금액에서 빼요');
		expect(claimFromJson(json({ return_fee: undefined }))!.returnFee).toBeNull();
		expect(claimPolicy('단순 변심', 6000)).toEqual(['수령 후 7일 이내 · 미개봉만 가능', '왕복 배송비 ₩6,000은 고객 부담 — 환불 금액에서 빼요', '식품 특성상 개봉 제품은 교환·환불이 어려워요']);
		expect(claimPolicy('파손 · 누액', 6000)).toEqual(['사진 확인 후 새 제품 재발송 또는 전액 환불']);
		expect(claimPolicy('오배송', 6000)).toEqual(['잘못 간 제품은 택배 기사가 방문해 회수해요']);
		expect(claimPolicy('???', 6000)).toEqual([]);
	});
});

describe('단순 변심 기한(0093) — 서버 값 그대로 안내', () => {
	it('지난 줄만 안내 · 날짜는 서버 기한(한국 시간)', () => {
		expect(changeMindNote({ changeMindOk: true, changeMindUntil: '2026-11-10T14:59:59Z' })).toBeNull();
		expect(changeMindNote({ changeMindOk: false, changeMindUntil: '2026-11-10T14:59:59Z' })).toBe('수령 후 7일이 지나 단순 변심 환불은 어려워요 (11월 10일까지였어요)');
		expect(changeMindNote({ changeMindOk: false, changeMindUntil: null })).toBe('수령 후 7일이 지나 단순 변심 환불은 어려워요');
	});
	it('서버 거절 CHANGE_MIND_EXPIRED → 안내 문구', () => {
		expect(claimMessage('BAD_ITEMS', [{ reason: 'CHANGE_MIND_EXPIRED' }])).toBe('수령 후 7일이 지난 상품은 단순 변심 환불이 어려워요');
	});
});

describe('요청할 수 있는 줄', () => {
	const it_ = (o: Partial<OrderItem>) => ({ id: 'i', status: 'PAID', qty: 1, refundedQty: 0, shipStatus: 'SHIPPING', refundPath: 'claim', ...o }) as OrderItem;
	it('서버 refundPath = claim 인 줄만 — 화면이 배송 상태 · 수량으로 다시 판정하지 않는다(0092)', () => {
		const items = [it_({ id: 'a' }), it_({ id: 'b', refundPath: 'instant' }), it_({ id: 'c', refundPath: null }), it_({ id: 'd', shipStatus: 'PAID', refundPath: 'claim' })];
		expect(claimableItems(items).map((i) => i.id)).toEqual(['a', 'd']);
	});
});

describe('단계 문구 · 처리 내역', () => {
	it('고객 한 줄 — 확인 중 · 회수 · 환불 · 재발송 · 완료 · 반려', () => {
		expect(claimStepText(claim())).toBe('크리에이터가 확인하고 있어요');
		expect(claimStepText(claim({ status: 'progress', step: 'collect' }))).toBe('회수를 기다리고 있어요 — 택배 기사가 방문해요');
		expect(claimStepText(claim({ status: 'done', step: null, resolution: 'partial', refund_amount: 26000 }))).toBe('환불이 끝났어요 · ₩26,000');
		expect(claimStepText(claim({ status: 'done', step: null, resolution: 'reship', reship_courier: '한진택배', reship_tracking_no: '4400' }))).toBe('새 제품을 보냈어요 · 한진택배 4400');
		expect(claimStepText(claim({ status: 'rejected', step: null }))).toBe('크리에이터가 요청을 반려했어요');
	});
	it('처리 대기 → 접수 + 확인(빈 점) · 반려 → 메시지', () => {
		expect(claimTimeline(claim()).map((r) => [r.title, r.done])).toEqual([['요청 접수', true], ['크리에이터 확인', false]]);
		expect(claimTimeline(claim({ status: 'rejected', decided_at: 'x', message: '개봉 제품이라 어려워요' }))[1]).toEqual({ title: '반려', at: 'x', detail: '개봉 제품이라 어려워요', done: true });
	});
	it('부분 환불 승인 → 회수(아직) · 환불(아직) / 끝나면 금액 + 차감', () => {
		const p = claim({ status: 'progress', step: 'collect', resolution: 'partial', decided_at: 'd', needs_collect: true, needs_refund: true, deduction: 6000 });
		expect(claimTimeline(p).map((r) => [r.title, r.done])).toEqual([['요청 접수', true], ['부분 환불 (왕복 배송비 차감) 승인', true], ['회수 완료', false], ['환불 완료', false]]);
		const done = claim({ status: 'done', step: null, resolution: 'partial', decided_at: 'd', needs_collect: true, collected_at: 'c', needs_refund: true, deduction: 6000, refund_amount: 26000, refunded_at: 'r' });
		expect(claimTimeline(done)[3]).toEqual({ title: '환불 완료', at: 'r', detail: '₩26,000 (상품 ₩32,000 − 왕복 배송비 ₩6,000)', done: true });
	});
	it('재발송 + 회수 → 회수 · 새 제품 발송 줄', () => {
		const r = claim({ status: 'progress', step: 'collect', kind: 'exchange', reason: '오배송', resolution: 'reship_collect', decided_at: 'd', needs_collect: true, needs_reship: true, reship_courier: 'CJ대한통운', reship_tracking_no: '1234', reshipped_at: 's' });
		expect(claimTimeline(r).slice(2)).toEqual([
			{ title: '회수 완료', at: null, detail: null, done: false },
			{ title: '새 제품 발송', at: 's', detail: 'CJ대한통운 1234', done: true }
		]);
	});
});

describe('실패 문구', () => {
	it('줄 사유가 있으면 그 문구 · 없으면 code 문구 · 모르면 기본', () => {
		expect(claimMessage('BAD_ITEMS', [{ reason: 'PHOTO_REQUIRED' }])).toBe('사진을 1장 이상 올려주세요');
		expect(claimMessage('BAD_ITEMS', [{ reason: 'NOT_PREPARED' }])).toBe('아직 발주 전이라 바로 환불할 수 있어요');
		expect(claimMessage('EXCHANGE_NOT_ALLOWED')).toBe('단순 변심은 환불로만 받아요');
		expect(claimMessage('???')).toBe('요청을 보내지 못했어요');
	});
});
