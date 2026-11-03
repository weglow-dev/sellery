// 고객 문의 순수 규칙 — apps/myr-shop/src/lib/cs-rules.ts · 폼 검증 · 본문 정규화 · JSON 파서 · RPC 결과 · 문구 · 쿠키 이름
import { describe, expect, it } from 'vitest';
import {
	CS_BODY_MAX,
	CS_CODE_RE,
	csFailMessage,
	csNeedsOrder,
	csOrderOptions,
	CS_PLACEHOLDERS,
	csSenderLabel,
	csStatusChip,
	csTokenCookieName,
	normalizeCsBody,
	parseClientToken,
	relTime,
	parseCsConversation,
	parseCsForOrder,
	parseCsOpenInput,
	parseCsOpenResult,
	parseCsThread
} from '../lib/cs-rules';

describe('normalizeCsBody', () => {
	it('CR 제거 · 제어문자 제거 · 빈 줄 축소 · 앞뒤 공백 (0063 myr_cs_normalize_body 와 같은 결과)', () => {
		expect(normalizeCsBody('첫 줄\r\n\n\n\n둘째 줄\x07 끝  ')).toBe('첫 줄\n\n둘째 줄 끝');
		expect(normalizeCsBody('  \n\n ')).toBe('');
		expect(normalizeCsBody(null)).toBe('');
	});
});

describe('parseCsOpenInput', () => {
	const ok = { type: '배송 문의', body: '언제 오나요', buyer_name: ' 홍 길동 ', order_code: 'MYR1001' };
	it('정상 — 이름 공백 정리 · 주문번호 소문자', () => {
		expect(parseCsOpenInput(ok)).toEqual({ ok: true, type: '배송 문의', body: '언제 오나요', buyerName: '홍 길동', orderCode: 'myr1001' });
	});
	it('FormData 도 받는다', () => {
		const fd = new FormData();
		for (const [k, v] of Object.entries(ok)) fd.set(k, v);
		expect(parseCsOpenInput(fd).ok).toBe(true);
	});
	it('유형 밖 → type', () => {
		expect(parseCsOpenInput({ ...ok, type: '아무거나' })).toMatchObject({ ok: false, field: 'type' });
	});
	it('빈 본문 · 2001자 → body', () => {
		expect(parseCsOpenInput({ ...ok, body: ' \n ' })).toMatchObject({ ok: false, field: 'body' });
		expect(parseCsOpenInput({ ...ok, body: '가'.repeat(CS_BODY_MAX + 1) })).toMatchObject({ ok: false, field: 'body' });
	});
	it('이름 41자 → buyer_name · 빈 이름은 null', () => {
		expect(parseCsOpenInput({ ...ok, buyer_name: '가'.repeat(41) })).toMatchObject({ ok: false, field: 'buyer_name' });
		expect(parseCsOpenInput({ ...ok, buyer_name: '' })).toMatchObject({ ok: true, buyerName: null });
	});
	it('주문번호 형식 밖 → order_code · 비면 null', () => {
		expect(parseCsOpenInput({ ...ok, order_code: 'MYR 1001' })).toMatchObject({ ok: false, field: 'order_code' });
		expect(parseCsOpenInput({ ...ok, order_code: '' })).toMatchObject({ ok: true, orderCode: null });
	});
});

const convJson = {
	id: 'c1',
	code: 'cs1001',
	status: 'ANSWERED',
	type: '배송 문의',
	buyer_name: '홍길동',
	order_code: 'myr1001',
	order_id: 'o1',
	order: { code: 'myr1001', status: 'PAID', courier: 'cj', tracking_no: '123', shipped_at: null, delivered_at: null, paid_at: '2026-11-01T00:00:00Z', item: { id: 'i1', name: '상품 A', option: '', qty: 2, amount: 40000, status: 'PAID', refunded_qty: 0 } },
	is_member: true,
	last_preview: '내일 출발',
	last_message_at: '2026-11-02T01:00:00Z',
	replied_at: '2026-11-02T01:00:00Z',
	closed_at: null,
	created_at: '2026-11-01T00:00:00Z',
	message_count: 2,
	product: { id: 'p1', code: 'minji-grape-jelly', name: '상품 A', tile: 'lg', icon: 'grape', thumb_url: null, status: 'listed' },
	seller: { id: 's1', name: '민지 루틴', handle: '@minji' }
};

describe('파서', () => {
	it('parseCsConversation — 주문 줄 · 상품 · 셀러', () => {
		const c = parseCsConversation(convJson)!;
		expect(c.code).toBe('cs1001');
		expect(c.order?.item?.amount).toBe(40000);
		expect(c.order?.trackingNo).toBe('123');
		expect(c.product?.code).toBe('minji-grape-jelly');
		expect(c.seller?.name).toBe('민지 루틴');
		expect(c.isMember).toBe(true);
		expect(c.messageCount).toBe(2);
	});
	it('연결 안 된 주문은 null · 상태 밖은 null', () => {
		expect(parseCsConversation({ ...convJson, order: null })!.order).toBeNull();
		expect(parseCsConversation({ ...convJson, status: 'WHAT' })).toBeNull();
		expect(parseCsConversation(null)).toBeNull();
	});
	it('parseCsThread — 메시지 · 모르는 sender 는 버림', () => {
		const t = parseCsThread({ conversation: convJson, messages: [{ id: 'm1', sender: 'customer', actor_role: 'customer', body: '안녕', created_at: '2026-11-01T00:00:00Z' }, { id: 'm2', sender: 'bot', body: 'x', created_at: '2026-11-01T00:00:00Z' }] })!;
		expect(t.messages).toHaveLength(1);
		expect(t.messages[0]).toEqual({ id: 'm1', sender: 'customer', actorRole: 'customer', body: '안녕', createdAt: '2026-11-01T00:00:00Z' });
		expect(parseCsThread({ conversation: null, messages: [] })).toBeNull();
	});
	it('parseCsForOrder', () => {
		expect(parseCsForOrder([{ code: 'cs1001', type: '배송 문의', status: 'OPEN', last_message_at: 'x', product_name: '상품 A' }, { code: 'bad', status: 'NOPE' }])).toEqual([{ code: 'cs1001', type: '배송 문의', status: 'OPEN', lastMessageAt: 'x', productName: '상품 A' }]);
		expect(parseCsForOrder(null)).toEqual([]);
	});
	it('parseCsOpenResult', () => {
		expect(parseCsOpenResult({ ok: true, conversation_id: 'c1', conversation_code: 'cs1001', client_token: 't', seller_id: 's1', seller_name: '민지 루틴', order_id: null, order_item_id: null, order_matched: false })).toEqual({ ok: true, conversationId: 'c1', conversationCode: 'cs1001', clientToken: 't', sellerId: 's1', sellerName: '민지 루틴', orderId: null, orderItemId: null, orderMatched: false });
		expect(parseCsOpenResult({ ok: false, code: 'BAD_TYPE' })).toEqual({ ok: false, code: 'BAD_TYPE' });
		expect(parseCsOpenResult({ ok: false, code: 'WEIRD' })).toEqual({ ok: false, code: 'DB_ERROR' });
		expect(parseCsOpenResult({ ok: true })).toEqual({ ok: false, code: 'DB_ERROR' });
	});
});

describe('문구 · 칩 · 쿠키', () => {
	it('csFailMessage · csStatusChip · csSenderLabel', () => {
		expect(csFailMessage('CLOSED')).toContain('처리 종료');
		expect(csFailMessage('nope')).toBe('잠시 후 다시 시도해주세요');
		expect(csStatusChip('OPEN')).toEqual({ label: '답변 대기', tone: 'accent' });
		expect(csStatusChip('ANSWERED').tone).toBe('ok');
		expect(csSenderLabel('customer')).toBe('나');
		expect(csSenderLabel('seller', '민지 루틴')).toBe('민지 루틴');
		expect(csSenderLabel('admin')).toBe('MYR 운영팀');
	});
	it('쿠키 이름 · 토큰 · 코드 형식', () => {
		expect(csTokenCookieName('CS1001')).toBe('myr_cs_cs1001');
		expect(parseClientToken('8A6A1B53-321E-406F-8D4F-1C52911878CC')).toBe('8a6a1b53-321e-406f-8d4f-1c52911878cc');
		expect(parseClientToken('nope')).toBeNull();
		expect(CS_CODE_RE.test('cs1001')).toBe(true);
		expect(CS_CODE_RE.test('myr1001')).toBe(false);
	});
});

describe('relTime · firstBody (마이 "내 문의")', () => {
	const now = Date.parse('2026-11-05T03:00:00Z'); // KST 11/5 12:00
	it('분·시간·어제·일·주·날짜', () => {
		expect(relTime('2026-11-05T02:59:40Z', now)).toBe('방금');
		expect(relTime('2026-11-05T02:30:00Z', now)).toBe('30분 전');
		expect(relTime('2026-11-04T16:00:00Z', now)).toBe('11시간 전'); // KST 11/5 01:00 — 같은 날
		expect(relTime('2026-11-04T10:00:00Z', now)).toBe('어제'); // KST 11/4 19:00
		expect(relTime('2026-11-02T03:00:00Z', now)).toBe('3일 전');
		expect(relTime('2026-10-20T03:00:00Z', now)).toBe('2주 전');
		expect(relTime('2026-09-01T03:00:00Z', now)).toBe('9월 1일');
		expect(relTime(null, now)).toBe('');
		expect(relTime('nope', now)).toBe('');
	});
	it('parseCsConversation 은 first_body 를 읽는다', () => {
		expect(parseCsConversation({ ...convJson, first_body: '저녁에 먹어도 되나요?' })!.firstBody).toBe('저녁에 먹어도 되나요?');
		expect(parseCsConversation(convJson)!.firstBody).toBeNull();
	});
});

describe('문의 시트 — 주문 드롭다운은 배송 문의 · 교환·반품만', () => {
	it('csNeedsOrder', () => {
		expect(csNeedsOrder('배송 문의')).toBe(true);
		expect(csNeedsOrder('교환·반품')).toBe(true);
		expect(csNeedsOrder('상품 문의')).toBe(false);
		expect(csNeedsOrder('기타')).toBe(false);
	});
	it('유형마다 안내 문구가 있다', () => {
		for (const t of ['배송 문의', '교환·반품', '상품 문의', '기타'] as const) expect(CS_PLACEHOLDERS[t].length).toBeGreaterThan(5);
	});
	it('csOrderOptions — 이 상품 줄이 있는 주문만 · 순서 유지 · 라벨', () => {
		const orders = [
			{ code: 'myr1003', createdAt: '2026-11-02T00:00:00Z', items: [{ code: 'b', name: '상품 B', qty: 1 }] },
			{ code: 'myr1002', createdAt: '2026-11-01T00:00:00Z', items: [{ code: 'a', name: '상품 A', qty: 2 }, { code: 'b', name: '상품 B', qty: 1 }] },
			{ code: 'myr1001', createdAt: '2026-10-30T00:00:00Z', items: [{ code: 'a', name: '상품 A', qty: 1 }] }
		];
		expect(csOrderOptions(orders, 'a', () => 'D')).toEqual([
			{ code: 'myr1002', label: 'MYR1002 · D · 상품 A × 2' },
			{ code: 'myr1001', label: 'MYR1001 · D · 상품 A × 1' }
		]);
		expect(csOrderOptions(orders, 'zzz', () => 'D')).toEqual([]);
	});
});
