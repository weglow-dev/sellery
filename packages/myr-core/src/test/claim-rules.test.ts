// 교환 · 환불 요청 순수 규칙(0078) — packages/myr-core/src/claim-rules.ts
import { describe, expect, it } from 'vitest';
import type { OrderItem } from '../order-view';
import {
	canDecide,
	claimableItems,
	claimFromJson,
	claimMessage,
	claimPolicy,
	claimQtyText,
	claimRefundedText,
	claimRefundView,
	changeMindNote,
	claimsFromJson,
	isOpenClaim,
	claimStepText,
	claimTimeline,
	kindAllowed,
	parseClaimDecideBody,
	parseClaimOpenBody,
	parseClaimOpsInput,
	reasonRule,
	refundOnlyNote,
	claimFormRulesFromJson,
	refundAmountText,
	refundCalcText,
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
	it('상세 내용은 여러 줄 글 — 줄바꿈 · 이모지 그대로 · 제어문자 · 빈 줄 3개 이상만 정리(cleanText 는 이름 · 주소용)', () => {
		const b = parseClaimOpenBody({ orderCode: 'myr1001', kind: 'refund', reason: '오배송', items: [{ itemId: ITEM, qty: 1, note: ' 다른 맛이 왔어요 \u{1F622}\r\n\n\n\n주문은 레몬맛\x07이에요 ' }] });
		expect(b?.items[0].note).toBe('다른 맛이 왔어요 \u{1F622}\n\n주문은 레몬맛이에요');
	});
	it('형식 틀리면 null — 종류 · 사유 · 빈 줄 · 수량 · 사진 경로 · 4장', () => {
		const ok = { orderCode: 'myr1001', kind: 'refund', reason: '오배송', items: [{ itemId: ITEM, qty: 1 }] };
		// 요청 수량 상한 없음(0097) — 150개도 받는다(남은 수량은 서버 TOO_MANY)
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 150 }] })?.items[0].qty).toBe(150);
		expect(parseClaimOpenBody({ ...ok, kind: 'swap' })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, reason: '그냥' })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 0 }] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 2_147_483_648 }] })).toBeNull(); // 정수 범위 밖(전송 형식) — 수량 형식 범위는 서버 myr_qty_parse(0097)
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 1.5 }] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 1, photos: ['../x.jpg'] }] })).toBeNull();
		expect(parseClaimOpenBody({ ...ok, items: [{ itemId: ITEM, qty: 1, photos: [PHOTO, PHOTO, PHOTO, PHOTO] }] })).toBeNull();
		expect(parseClaimOpenBody(null)).toBeNull();
	});
	it('사유 규칙은 서버 값 그대로(0099 myr_app_claim_form_rules) — 요청 종류 · 사진 필수 · 기한 적용을 화면이 정하지 않는다', () => {
		// 서버가 줄 법한 응답(단순 변심은 환불만 · 파손 · 오배송은 사진 필수 — 그 판정 자체는 pgTAP myr_single_source 가 고정한다)
		const rules = claimFormRulesFromJson({
			return_fee: 6000,
			reasons: [
				{ reason: '단순 변심', kinds: ['refund'], photo_required: false, change_mind: true },
				{ reason: '파손 · 누액', kinds: ['refund', 'exchange'], photo_required: true, change_mind: false },
				{ reason: '오배송', kinds: ['refund', 'exchange', 'what'], photo_required: true, change_mind: false },
				{ reason: '모르는 사유', kinds: ['refund'] }
			]
		});
		expect(rules.returnFee).toBe(6000);
		expect(rules.reasons.map((r) => r.reason)).toEqual(['단순 변심', '파손 · 누액', '오배송']); // 서버 순서 그대로 · 모르는 사유는 버린다
		const cm = reasonRule(rules, '단순 변심');
		expect([kindAllowed('exchange', cm), kindAllowed('refund', cm), cm?.photoRequired, cm?.changeMind]).toEqual([false, true, false, true]);
		const wrong = reasonRule(rules, '오배송');
		expect([kindAllowed('exchange', wrong), wrong?.photoRequired, wrong?.changeMind, wrong?.kinds]).toEqual([true, true, false, ['refund', 'exchange']]);
		// 사유를 고르기 전에는 막지 않는다 · 서버가 규칙을 바꾸면 화면도 따라간다(단순 변심도 교환을 받게 되면)
		expect([reasonRule(rules, ''), kindAllowed('exchange', null)]).toEqual([null, true]);
		expect(kindAllowed('exchange', reasonRule(claimFormRulesFromJson({ reasons: [{ reason: '단순 변심', kinds: ['refund', 'exchange'] }] }), '단순 변심'))).toBe(true);
		// 응답이 없거나 모양이 틀리면 빈 규칙 — 사유를 짐작해 채우지 않는다
		for (const v of [null, 'x', {}]) expect(claimFormRulesFromJson(v)).toEqual({ returnFee: null, reasons: [] });
		expect([refundOnlyNote('단순 변심'), refundOnlyNote('오배송')]).toEqual(['단순 변심은 환불로만 받아요 — 왕복 배송비를 빼고 돌려드려요', '이 사유는 환불로만 받아요']);
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
	it('메시지는 여러 줄 글 — 줄바꿈 · 이모지 그대로 · 글자 수는 이모지 1자(DB char_length 와 같은 기준)', () => {
		expect(parseClaimDecideBody({ decision: 'approve', resolution: 'refund', message: ' 확인했어요 \u{1F64F}\r\n회수 뒤 환불해드릴게요 ' })?.message).toBe('확인했어요 \u{1F64F}\n회수 뒤 환불해드릴게요');
		// 이모지 1000개 = 1000자(JS length 로는 2000) — 통과 · 1001개는 거절
		expect(parseClaimDecideBody({ decision: 'reject', message: '\u{1F64F}'.repeat(1000) })?.message).toHaveLength(2000);
		expect(parseClaimDecideBody({ decision: 'reject', message: '\u{1F64F}'.repeat(1001) })).toBeNull();
		expect([canDecide('refund', '\u{1F64F}'.repeat(1000)), canDecide('refund', '\u{1F64F}'.repeat(1001))]).toEqual([true, false]);
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
		expect(resolutionOption('partial', refund, { paid: 32000, goods: 32000, shippingBack: 0, deduction: 6000, amount: 26000 })).toEqual({
			id: 'partial',
			title: '부분 환불 (왕복 배송비 차감)',
			desc: '₩26,000 (상품 ₩32,000 − 왕복 배송비 ₩6,000) · 회수 확인 뒤 환불'
		});
		expect(resolutionOption('reship', refund).title).toBe('교환으로 전환');
		// 회수 여부는 서버 값(0099 option_collects · 파손 · 누액 환불은 회수 없이 — myr_claim_resolution_collects)
		const broken = claim({ kind: 'exchange', reason: '파손 · 누액', options: ['reship', 'refund'], option_collects: { reship: false, refund: false, what: true } });
		expect(broken.optionCollects).toEqual({ reship: false, refund: false });
		expect(resolutionOption('reship', broken).title).toBe('새 제품 재발송');
		expect(resolutionOption('refund', broken, { paid: 32000, goods: 32000, shippingBack: 0, deduction: 0, amount: 32000 })).toEqual({ id: 'refund', title: '환불로 전환', desc: '₩32,000 · 회수 없이 바로 환불' });
		expect(resolutionOption('reship_collect', claim({ kind: 'exchange', reason: '오배송' })).title).toBe('재발송 + 회수');
	});
	it('결제 금액 − 왕복 배송비 = 환불 금액 — 마지막 줄이면 결제 금액에 배송비 · 예상 금액이 없으면(계산 실패) 금액 없이 안내만', () => {
		// paid(결제 금액 = 상품 + 함께 돌려줄 배송비)는 서버 값(precheck amount · 0099) — 화면이 더하지 않는다
		const last = { paid: 39000, goods: 36000, shippingBack: 3000, deduction: 6000, amount: 33000 };
		expect(refundCalcText(last)).toBe('(상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)');
		expect(refundAmountText(last)).toBe('₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)');
		expect(refundAmountText({ paid: 39000, goods: 36000, shippingBack: 3000, deduction: 0, amount: 39000 })).toBe('₩39,000 (상품 ₩36,000 + 배송비 ₩3,000)');
		expect(refundAmountText({ paid: 32000, goods: 32000, shippingBack: 0, deduction: 0, amount: 32000 })).toBe('₩32,000');
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
	// 새 요청의 예상 차감은 DB myr_claim_open_deduction 한 곳(0099) — supabase/tests/myr_single_source.test.sql
	it('환불 완료 — 서버가 준 환불액 · 결제 기준 금액 · 배송비 · 차감 그대로 펼친다(여기서 계산하지 않는다)', () => {
		// MYR2087 — 줄 36,000 · 차감 6,000 · 기록 33,000 · 서버가 준 결제 기준 39,000 · 함께 돌려준 배송비 3,000(0099 refund_paid · shipping_back)
		const myr2087 = { amount: 36000, deduction: 6000, refundAmount: 33000, refundPaid: 39000, shippingBack: 3000 };
		expect(claimRefundView(myr2087)).toEqual({ paid: 39000, goods: 36000, shippingBack: 3000, deduction: 6000, amount: 33000 });
		expect(claimRefundedText(myr2087)).toBe('₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)');
		expect(claimRefundedText({ amount: 32000, deduction: 6000, refundAmount: 26000, refundPaid: 32000, shippingBack: 0 })).toBe('₩26,000 (상품 ₩32,000 − 왕복 배송비 ₩6,000)');
		expect(claimRefundedText({ amount: 32000, deduction: 0, refundAmount: 32000, refundPaid: 32000, shippingBack: 0 })).toBe('₩32,000');
		// 환불 전(서버가 금액을 주지 않았다) — 금액을 만들어 내지 않는다
		expect(claimRefundedText({ amount: 32000, deduction: 0, refundAmount: null, refundPaid: null, shippingBack: 0 })).toBeNull();
		expect(claimRefundView({ amount: 32000, deduction: 0, refundAmount: 32000, refundPaid: null, shippingBack: 0 })).toBeNull();
	});
	it('열린 요청 — 서버 값 open 그대로(상태 묶음을 다시 쓰지 않는다)', () => {
		expect(isOpenClaim(claim({ status: 'pending', open: true }))).toBe(true);
		expect(isOpenClaim(claim({ status: 'done', open: false }))).toBe(false);
		expect(isOpenClaim(claim({ status: 'pending' }))).toBe(false); // 옛 응답(open 없음)은 열렸다고 짐작하지 않는다
		expect(claim({ refund_amount: 33000, refund_paid: 39000, shipping_back: 3000 })).toMatchObject({ refundAmount: 33000, refundPaid: 39000, shippingBack: 3000 });
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
	it('지난 줄만 안내(서버 changeMindOk 그대로)', () => {
		expect(changeMindNote({ changeMindOk: true, changeMindUntil: '2026-11-10T14:59:59Z' })).toBeNull();
		expect(changeMindNote({ changeMindOk: false, changeMindUntil: '2026-11-10T14:59:59Z' })).toBe('수령 후 7일이 지나 단순 변심 환불은 어려워요');
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
		const done = claim({ status: 'done', step: null, resolution: 'partial', decided_at: 'd', needs_collect: true, collected_at: 'c', needs_refund: true, deduction: 6000, refund_amount: 26000, refund_paid: 32000, shipping_back: 0, refunded_at: 'r' });
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
