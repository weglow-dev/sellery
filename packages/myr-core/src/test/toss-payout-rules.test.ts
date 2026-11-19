// 토스 지급대행 본문 · 응답 읽기(형식) — packages/myr-core/src/toss-payout-rules.ts. 판정(지급 가능 · 영업일 · 가드)은 여기 없다(DB 0122~)
import { describe, expect, it } from 'vitest';
import { BANKS } from '../settle-info';
import {
	TOSS_ACCOUNT_MAX,
	TOSS_PAYOUT_DESCRIPTION,
	buildTossPayoutItem,
	buildTossSellerBody,
	chunkPayouts,
	parsePayoutWebhook,
	parseSellerWebhook,
	parseTossList,
	parseTossPayout,
	parseTossSeller,
	tossBankCodeOf,
	type TossSellerInput
} from '../toss-payout-rules';

const seller: TossSellerInput = {
	refSellerId: 'm1a2b3c4d5e6f7g8h9',
	bizKind: 'individual',
	company: ' 민지랩 ',
	ceo: '김민지',
	bizNo: '123-01-45670',
	email: 'Minji@MYR.test',
	phone: '010-1234-5678',
	bank: { bank: '신한은행', account: '110-123-456789', holder: '김민지' }
};

describe('은행 이름 → 토스 은행 코드', () => {
	it('MYR 정산 폼 은행(BANKS) 전부가 코드로 바뀐다 — 빠지면 그 은행 크리에이터는 토스에 등록할 수 없다', () => {
		expect(BANKS.filter((b) => !tossBankCodeOf(b))).toEqual([]);
		expect([tossBankCodeOf('KB국민은행'), tossBankCodeOf('iM뱅크(대구)'), tossBankCodeOf('KDB산업은행'), tossBankCodeOf(' 토스 뱅크 ')]).toEqual(['004', '031', '002', '092']);
		expect([tossBankCodeOf('모르는은행'), tossBankCodeOf(''), tossBankCodeOf(null)]).toEqual([null, null, null]);
	});
});

describe('셀러 등록 본문', () => {
	it('개인사업자 · 법인 — businessType 은 서버 판정(biz_kind)을 옮기기만 한다 · 숫자만 · 이메일 소문자 · 상호 다듬기', () => {
		const a = buildTossSellerBody(seller);
		expect(a).toEqual({
			ok: true,
			body: {
				refSellerId: 'm1a2b3c4d5e6f7g8h9',
				businessType: 'INDIVIDUAL_BUSINESS',
				company: { name: '민지랩', representativeName: '김민지', businessRegistrationNumber: '1230145670', email: 'minji@myr.test', phone: '01012345678' },
				account: { bankCode: '088', accountNumber: '110123456789', holderName: '김민지' }
			}
		});
		const c = buildTossSellerBody({ ...seller, bizKind: 'corporate', metadata: { seller_id: 's1' } });
		expect(c.ok && [c.body.businessType, c.body.metadata]).toEqual(['CORPORATE', { seller_id: 's1' }]);
	});
	it('거절 코드 · 고칠 칸', () => {
		const code = (over: Partial<TossSellerInput>) => {
			const r = buildTossSellerBody({ ...seller, ...over });
			return r.ok ? 'ok' : `${r.code}${r.field ? `:${r.field}` : ''}`;
		};
		expect([
			code({ refSellerId: 'short' }),
			code({ bizKind: null }),
			code({ bizNo: '12345' }),
			code({ bank: null }),
			code({ bank: { bank: '모르는은행', account: '110123456789', holder: '김민지' } }),
			code({ bank: { bank: '신한은행', account: '1234567', holder: '김민지' } }),
			code({ bank: { bank: '신한은행', account: '1'.repeat(TOSS_ACCOUNT_MAX + 1), holder: '김민지' } }),
			code({ bank: { bank: '신한은행', account: '110123456789', holder: ' ' } }),
			code({ email: 'no-at' }),
			code({ phone: '010' }),
			code({ company: '' }),
			code({ ceo: '' })
		]).toEqual([
			'BAD_REF',
			'BIZ_KIND_UNKNOWN:bizNo',
			'BIZ_NO_REQUIRED:bizNo',
			'BANK_MISSING:account',
			'BANK_CODE_UNKNOWN:bank',
			'BAD_ACCOUNT:account',
			'BAD_ACCOUNT:account',
			'HOLDER_REQUIRED:holder',
			'EMAIL_REQUIRED',
			'PHONE_MISSING:ceoPhone',
			'COMPANY_REQUIRED:company',
			'CEO_REQUIRED:ceo'
		]);
		expect(code({ bank: { bank: '신한은행', account: '1'.repeat(TOSS_ACCOUNT_MAX), holder: '김민지' } })).toBe('ok');
	});
});

describe('지급 요청 본문', () => {
	it('바로 지급 · 예약 지급 · 금액 반올림 · 기본 적요 7자 이하', () => {
		expect(buildTossPayoutItem({ refPayoutId: 'p1', tossSellerId: 'seller_1', amount: 32000.4, scheduleType: 'EXPRESS' })).toEqual({
			ok: true,
			item: { refPayoutId: 'p1', destination: 'seller_1', scheduleType: 'EXPRESS', amount: { currency: 'KRW', value: 32000 }, transactionDescription: TOSS_PAYOUT_DESCRIPTION }
		});
		expect(TOSS_PAYOUT_DESCRIPTION.length).toBeLessThanOrEqual(7);
		const s = buildTossPayoutItem({ refPayoutId: 'p2', tossSellerId: 'seller_1', amount: 1000, scheduleType: 'SCHEDULED', payoutDate: '2026-11-20', description: '아주 긴 적요 문구' });
		expect(s.ok && [s.item.payoutDate, s.item.transactionDescription]).toEqual(['2026-11-20', '아주 긴 적요']);
	});
	it('거절 — 금액 0 · 10억 이상 · 셀러 없음 · 예약일 없음 · 날짜 형식 · ref 50자 넘음', () => {
		const code = (over: Record<string, unknown>) => {
			const r = buildTossPayoutItem({ refPayoutId: 'p1', tossSellerId: 'seller_1', amount: 1000, scheduleType: 'EXPRESS', ...over } as never);
			return r.ok ? 'ok' : r.code;
		};
		expect([code({ amount: 0 }), code({ amount: 1_000_000_000 }), code({ tossSellerId: '' }), code({ scheduleType: 'SCHEDULED' }), code({ scheduleType: 'SCHEDULED', payoutDate: '11/20' }), code({ refPayoutId: 'x'.repeat(51) })]).toEqual([
			'BAD_AMOUNT',
			'BAD_AMOUNT',
			'NO_SELLER',
			'DATE_REQUIRED',
			'BAD_DATE',
			'BAD_REF'
		]);
	});
	it('100건씩 나눈다', () => {
		expect(chunkPayouts(Array.from({ length: 205 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 5]);
		expect(chunkPayouts([])).toEqual([]);
	});
});

describe('응답 · 웹훅 읽기', () => {
	it('셀러 · 지급 — id · status 가 없으면 읽지 않는다', () => {
		expect(parseTossSeller({ id: 'seller_1', status: 'APPROVAL_REQUIRED', refSellerId: 'm1', businessType: 'INDIVIDUAL_BUSINESS' })).toMatchObject({ id: 'seller_1', status: 'APPROVAL_REQUIRED', refSellerId: 'm1' });
		expect(parseTossSeller({ id: 'seller_1' })).toBeNull();
		expect(parseTossPayout({ id: 'p_1', status: 'FAILED', error: { code: 'INVALID_ACCOUNT', message: '계좌 오류' }, amount: { currency: 'KRW', value: 1000 } })).toMatchObject({
			id: 'p_1',
			status: 'FAILED',
			error: { code: 'INVALID_ACCOUNT', message: '계좌 오류' },
			amount: { value: 1000 }
		});
	});
	it('목록 — 토스 v2 실측 모양 { hasMore, size, nextCursor, items } · 배열 · { data } 도 · 못 읽는 줄은 건너뜀', () => {
		expect(parseTossList({ hasMore: true, size: 2, nextCursor: 'c2', items: [{ id: 'a', status: 'APPROVED' }, { bad: 1 }] }, parseTossSeller)).toEqual({
			items: [expect.objectContaining({ id: 'a' })],
			hasMore: true,
			nextCursor: 'c2'
		});
		expect(parseTossList([{ id: 'a', status: 'APPROVED' }], parseTossSeller)?.items.length).toBe(1);
		expect(parseTossList({ data: [{ id: 'a', status: 'APPROVED' }] }, parseTossSeller)?.items.length).toBe(1);
		expect(parseTossList({ nope: true }, parseTossSeller)).toBeNull();
	});
	it('웹훅 — 이벤트 종류가 맞을 때만', () => {
		expect(parseSellerWebhook({ eventType: 'seller.changed', createdAt: '2026-11-19T10:00:00+09:00', data: { id: 's', status: 'PARTIALLY_APPROVED' } })?.data.status).toBe('PARTIALLY_APPROVED');
		expect(parseSellerWebhook({ eventType: 'payout.changed', data: { id: 's', status: 'X' } })).toBeNull();
		expect(parsePayoutWebhook({ eventType: 'payout.changed', data: { id: 'p', status: 'COMPLETED' } })?.data.id).toBe('p');
		expect(parsePayoutWebhook({ eventType: 'payout.changed', data: {} })).toBeNull();
	});
});
