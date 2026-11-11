// 체크아웃·결제 순수 규칙 — apps/myr-shop/src/lib/checkout-rules.ts
import { describe, expect, it } from 'vitest';
import {
	depositInfoOf,
	failPageReason,
	failSessionCode,
	failText,
	generateOrderId,
	isMyrOrderId,
	ownsCheckout,
	parseCheckoutBody,
	parseOptionalEmail,
	ORDER_EMAIL_PLACEHOLDER,
	parseClaimResult,
	parseConfirmResult,
	parseCreateResult,
	parseGuestBody,
	parseLines,
	parseSuccessParams,
	rejectedItemsText,
	validateGuestBuyer,
	validateShipping
} from '../checkout-rules';
import { QTY_INT_MAX } from '../constants';
import { cleanText, normalizePhone } from '../text';

describe('text', () => {
	it('cleanText 는 이모지·제어문자 제거 + 공백 정리 · normalizePhone 은 숫자 8~15', () => {
		expect(cleanText('  홍\u{1F49A}길동\t\n ')).toBe('홍길동');
		expect(normalizePhone('010-1234-5678')).toBe('01012345678');
		expect(normalizePhone('1234567')).toBeNull();
	});
});

describe('orderId', () => {
	it('myr_ 접두 · 형식', () => {
		const id = generateOrderId(1700000000000);
		expect(id.startsWith('myr_1700000000000_')).toBe(true);
		expect(isMyrOrderId(id)).toBe(true);
		expect(isMyrOrderId('slry_1700000000000_abcdef123456')).toBe(false);
	});
});

describe('parseLines', () => {
	it('같은 (code, option) 합치고 소문자화 · optionIndex 기본 0', () => {
		expect(
			parseLines([
				{ code: 'A-1', qty: 2 },
				{ code: 'a-1', qty: 1 },
				{ code: 'b', qty: 1, optionIndex: 1 }
			])
		).toEqual([
			{ code: 'a-1', qty: 3, option_index: 0 },
			{ code: 'b', qty: 1, option_index: 1 }
		]);
	});
	it('빈 배열 · 형식 · 숫자 형식 범위 초과 · 21줄은 null — 구매 수량 상한은 없다(0095)', () => {
		expect(parseLines([])).toBeNull();
		expect(parseLines([{ code: 'a', qty: 0 }])).toBeNull();
		expect(parseLines([{ code: 'Bad Code', qty: 1 }])).toBeNull();
		expect(
			parseLines([
				{ code: 'a', qty: QTY_INT_MAX },
				{ code: 'a', qty: 1 }
			])
		).toBeNull();
		expect(parseLines([{ code: 'a', qty: 9 }, { code: 'a', qty: 5 }])?.[0].qty).toBe(14);
		expect(parseLines([{ code: 'a', qty: 1, optionIndex: -1 }])).toBeNull();
		expect(parseLines(Array.from({ length: 21 }, (_, i) => ({ code: `c${i}`, qty: 1 })))).toBeNull();
	});
	it('공구 코드 · 화면 단가(0086) — 있으면 싣고, 합칠 때는 처음 값 · 형식이 틀리면 null', () => {
		expect(
			parseLines([
				{ code: 'a', qty: 1, gb: 'ab12cd34', price: 25600 },
				{ code: 'a', qty: 1, price: 32000 },
				{ code: 'b', qty: 1 }
			])
		).toEqual([
			{ code: 'a', qty: 2, option_index: 0, gb: 'ab12cd34', price: 25600 },
			{ code: 'b', qty: 1, option_index: 0 }
		]);
		expect(parseLines([{ code: 'a', qty: 1, gb: 'NOT A CODE' }])).toBeNull();
		expect(parseLines([{ code: 'a', qty: 1, price: -1 }])).toBeNull();
		expect(parseLines([{ code: 'a', qty: 1, price: 1.5 }])).toBeNull();
		expect(parseLines([{ code: 'a', qty: 1, gb: null, price: null }])).toEqual([{ code: 'a', qty: 1, option_index: 0 }]);
	});
});

describe('validateShipping', () => {
	const ok = { recipient: ' 홍길동 ', phone: '010-1234-5678', address1: '서울시 강남구 테헤란로 1 101동 202호', address2: '', postcode: '', memo: '' };
	it('통과하면 정리된 값 · 선택 필드는 있을 때만', () => {
		const r = validateShipping(ok);
		expect(r.ok && r.shipping).toEqual({ recipient: '홍길동', phone: '01012345678', address1: '서울시 강남구 테헤란로 1 101동 202호' });
		const r2 = validateShipping({ ...ok, postcode: '06234', memo: '문 앞', address2: '3층' });
		expect(r2.ok && r2.shipping).toMatchObject({ postcode: '06234', memo: '문 앞', address2: '3층' });
	});
	it('받는 분 · 연락처 · 주소(5자) · 우편번호 5자리 · 메모 100자', () => {
		expect(validateShipping({ ...ok, recipient: '' })).toMatchObject({ ok: false, field: 'recipient' });
		expect(validateShipping({ ...ok, phone: '123' })).toMatchObject({ ok: false, field: 'phone' });
		expect(validateShipping({ ...ok, address1: '서울' })).toMatchObject({ ok: false, field: 'address1' });
		expect(validateShipping({ ...ok, postcode: '123' })).toMatchObject({ ok: false, field: 'postcode' });
		expect(validateShipping({ ...ok, memo: 'x'.repeat(101) })).toMatchObject({ ok: false, field: 'memo' });
	});
});

describe('validateGuestBuyer · parseGuestBody', () => {
	it('이름·연락처·동의 필수 · 이메일 선택(형식)', () => {
		expect(validateGuestBuyer({ name: '김', phone: '01011112222', email: '', consent: true })).toEqual({
			ok: true,
			buyer: { name: '김', phone: '01011112222', email: null }
		});
		expect(validateGuestBuyer({ name: '김', phone: '01011112222', email: 'bad', consent: true })).toMatchObject({ ok: false, field: 'email' });
		expect(validateGuestBuyer({ name: '김', phone: '01011112222', email: '', consent: false })).toMatchObject({ ok: false, field: 'consent' });
		expect(parseGuestBody({ name: '김', phone: '010-1111-2222', consent: true })).toEqual({ name: '김', phone: '01011112222', email: null });
		expect(parseGuestBody({ name: '김', phone: '010-1111-2222' })).toBeNull();
	});
});

describe('parseCheckoutBody', () => {
	const shipping = { recipient: '홍길동', phone: '01012345678', address1: '서울시 어딘가 1-2' };
	it('lines + shipping (+ guest · saveAddress)', () => {
		const r = parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping, saveAddress: true });
		expect(r.ok && r.body).toEqual({ lines: [{ code: 'a', qty: 1, option_index: 0 }], shipping, guest: null, saveAddress: true, email: null });
		const g = parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping, guest: { name: '김', phone: '01011112222', consent: true } });
		expect(g.ok && g.body.guest).toEqual({ name: '김', phone: '01011112222', email: null });
	});
	it('줄 · 배송지 · 비회원 형식이 틀리면 메시지', () => {
		expect(parseCheckoutBody({ lines: [], shipping })).toMatchObject({ ok: false });
		expect(parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping: { recipient: '' } })).toMatchObject({ ok: false });
		expect(parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping, guest: { name: '' } })).toMatchObject({ ok: false });
		expect(parseCheckoutBody(null)).toMatchObject({ ok: false });
	});
});

describe('ownsCheckout', () => {
	it('회원은 user_id · 비회원은 쿠키(세션 id · uuid 형식)', () => {
		const member = { id: '11111111-1111-4111-8111-111111111111', user_id: 'u1' };
		const guest = { id: '11111111-1111-4111-8111-111111111111', user_id: null };
		expect(ownsCheckout(member, { userId: 'u1' })).toBe(true);
		expect(ownsCheckout(member, { userId: 'u2', guestCheckoutId: member.id })).toBe(false);
		expect(ownsCheckout(guest, { guestCheckoutId: guest.id })).toBe(true);
		expect(ownsCheckout(guest, { userId: 'u1' })).toBe(false);
		expect(ownsCheckout(guest, { guestCheckoutId: 'nope' })).toBe(false);
	});
});

describe('성공/실패 URL', () => {
	it('parseSuccessParams — 셋 다 있고 amount 는 양의 정수 문자열', () => {
		expect(parseSuccessParams('pk_123456', 'myr_1_abcdef', '43000')).toEqual({ paymentKey: 'pk_123456', orderId: 'myr_1_abcdef', amount: 43000 });
		expect(parseSuccessParams('pk_123456', 'myr_1_abcdef', '1e4')).toBeNull();
		expect(parseSuccessParams('bad key', 'myr_1_abcdef', '1')).toBeNull();
		expect(parseSuccessParams(null, 'x', '1')).toBeNull();
	});
	it('failText — 표 code · 내부 code 는 기본 문구 · 토스 code 는 message + 코드', () => {
		expect(failText('SOLD_OUT').kind).toBe('final');
		expect(failText('CONFIRMING').kind).toBe('pending');
		expect(failText('DB_ERROR', '무시').text).toBe('결제 확인에 실패했어요 — 문의하기');
		expect(failText('REJECT_CARD_COMPANY', '카드사 거절').text).toBe('카드사 거절 (코드 REJECT_CARD_COMPANY)');
	});
	it('failPageReason — 형식 밖 code 면 기본 · 고객 취소 문구 · 스푸핑 차단 · failSessionCode', () => {
		expect(failPageReason('PAY_PROCESS_CANCELED', 'x')).toContain('취소했어요');
		expect(failPageReason('bad code', '전화 010-1234-5678')).toBe('결제가 취소되었거나 실패했습니다.');
		expect(failPageReason('REJECT', '고객센터 https://evil.example')).toBe('결제가 취소되었거나 실패했습니다. (코드 REJECT)');
		expect(failPageReason('REJECT', '한도 초과')).toBe('한도 초과 (코드 REJECT)');
		expect(failSessionCode('PAY_PROCESS_CANCELED')).toBe('PAY_PROCESS_CANCELED');
		expect(failSessionCode('<script>')).toBe('USER_CANCELED');
	});
});

describe('RPC 파서', () => {
	const checkout = {
		id: 'c1',
		status: 'PENDING',
		amount: 43000,
		items_amount: 40000,
		shipping_fee: 3000,
		order_name: '상품 A',
		user_id: null,
		toss_order_id: 'myr_1_abcdef',
		payment_key: null,
		fail_code: null,
		fail_message: null
	};
	it('create — ok · LINES_REJECTED items · 형식 오류는 BAD_RESULT', () => {
		expect(parseCreateResult({ ok: true, checkout })).toMatchObject({ ok: true, checkout: { id: 'c1', amount: 43000 } });
		expect(parseCreateResult({ ok: false, code: 'LINES_REJECTED', items: [{ code: 'a', reason: 'SOLD_OUT', left: 2 }, { bad: 1 }] })).toEqual({
			ok: false,
			code: 'LINES_REJECTED',
			message: null,
			items: [{ code: 'a', reason: 'SOLD_OUT', left: 2 }],
			changes: []
		});
		expect(
			parseCreateResult({ ok: false, code: 'PRICE_CHANGED', items: [{ code: 'a', option_index: 0, was: 25600, now: 32000, groupbuy: 'inactive' }, { code: 'b', was: 'x' }] })
		).toEqual({ ok: false, code: 'PRICE_CHANGED', message: null, items: [], changes: [{ code: 'a', optionIndex: 0, was: 25600, now: 32000, groupbuy: 'inactive' }] });
		expect(parseCreateResult({ ok: true, checkout: { id: 'x' } })).toMatchObject({ ok: false, code: 'BAD_RESULT' });
		expect(parseCreateResult('junk')).toMatchObject({ ok: false, code: 'BAD_RESULT' });
	});
	it('claim · confirm', () => {
		expect(parseClaimResult({ ok: true, claimed: true, checkout })).toMatchObject({ ok: true, claimed: true });
		expect(parseClaimResult({ ok: false, code: 'CONFIRMING' })).toEqual({ ok: false, code: 'CONFIRMING', message: null });
		expect(parseConfirmResult({ ok: true, already: false, order_id: 'o', order_code: 'myr1001', status: 'WAITING_DEPOSIT' })).toEqual({
			ok: true,
			already: false,
			order_id: 'o',
			order_code: 'myr1001',
			status: 'WAITING_DEPOSIT'
		});
		expect(parseConfirmResult({ ok: false, code: 'SOLD_OUT', items: [{ code: 'a', reason: 'SOLD_OUT', left: 0 }] })).toMatchObject({
			ok: false,
			code: 'SOLD_OUT',
			items: [{ code: 'a', left: 0 }]
		});
	});
	it('rejectedItemsText · depositInfoOf', () => {
		expect(
			rejectedItemsText(
				[
					{ code: 'a', reason: 'SOLD_OUT', left: 2 },
					{ code: 'b', reason: 'NOT_AVAILABLE' }
				],
				(c) => ({ a: '상품 A', b: '상품 B' })[c] ?? c
			)
		).toBe('상품 A 남은 수량 2개 · 상품 B 판매 중지');
		expect(depositInfoOf({ virtualAccount: { bankCode: '20', accountNumber: '123', customerName: '홍', dueDate: '2026-10-31T23:59:59+09:00' } })).toEqual({
			bank: '20',
			account: '123',
			holder: '홍',
			due: '2026-10-31T23:59:59+09:00'
		});
		expect(depositInfoOf({ virtualAccount: null })).toBeNull();
	});
});

describe('회원 주문 안내 메일(카카오 이메일 미동의)', () => {
	const shipping = { recipient: '홍길동', phone: '01012345678', address1: '서울시 어딘가 1-2' };
	it('parseOptionalEmail — 비면 null · 형식 밖 false · 앞뒤 공백 제거', () => {
		expect(parseOptionalEmail('')).toBeNull();
		expect(parseOptionalEmail(undefined)).toBeNull();
		expect(parseOptionalEmail('  a@b.co ')).toBe('a@b.co');
		expect(parseOptionalEmail('nope')).toBe(false);
		expect(parseOptionalEmail('a@b.c')).toBe(false);
		expect(parseOptionalEmail(`${'a'.repeat(200)}@b.co`)).toBe(false);
	});
	it('parseCheckoutBody 가 email 을 싣는다 · 틀리면 400 문구', () => {
		const ok = parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping, email: 'me@kakao.com' });
		expect(ok.ok && ok.body.email).toBe('me@kakao.com');
		const none = parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping });
		expect(none.ok && none.body.email).toBeNull();
		expect(parseCheckoutBody({ lines: [{ code: 'a', qty: 1 }], shipping, email: 'x@' })).toEqual({ ok: false, message: '이메일 형식을 확인해주세요' });
	});
	it('입력칸 문구', () => {
		expect(ORDER_EMAIL_PLACEHOLDER).toBe('이메일(주문 안내 메일)');
	});
});
