// 사업자 · 정산 정보(0085 · 0121 대표자 휴대폰 · 토스 동의 · 개인사업자/법인) — packages/myr-core/src/settle-info.ts (DB 0085 와 같은 규칙)
import { describe, expect, it } from 'vitest';
import { TOSS_ACCOUNT_MAX } from '../toss-payout-rules';
import { ACCOUNT_MAX, ACCOUNT_RE, SETTLE_USED_FIELDS, TOSS_CONSENT, bizNoValid, formatBizNo, holderMatches, homeSettleBanner, parseSettleBody, settleErrors, settleInfoFromJson, settleSaveMessage, type SettleValues } from '../settle-info';

const ok: SettleValues = { company: '민지랩', ceo: '김민지', ceoPhone: '010-1234-5678', bizNo: '124-81-00998', bank: '신한은행', account: '110-123-456789', holder: '김민지' };

describe('칸 규칙', () => {
	it('사업자번호 체크섬 — 0085 myr_biz_no_valid 와 같다', () => {
		expect(['124-81-00998', '2208162517'].every(bizNoValid)).toBe(true);
		expect(['1248100999', '12481', ''].some(bizNoValid)).toBe(false);
		expect(formatBizNo('1248100998')).toBe('124-81-00998');
		expect(formatBizNo('12481')).toBe('124-81');
	});
	it('예금주 = 상호 또는 대표자(공백 · (주) · ㈜ · 주식회사 무시) · 개인 계좌는 대표자', () => {
		expect(holderMatches('김민지', '민지랩', '김민지')).toBe(true);
		expect(holderMatches('민지 랩', '(주)민지랩', '김민지')).toBe(true);
		expect(holderMatches('주식회사 민지랩', '㈜민지랩', '김민지')).toBe(true);
		expect(holderMatches('박하루', '민지랩', '김민지')).toBe(false);
		expect(holderMatches('', '민지랩', '김민지')).toBe(false);
	});
	it('칸 오류 — 정상 · 빈 칸 · 예금주 불일치 · 저장된 사업자번호 · 계좌는 비워도 된다', () => {
		expect(settleErrors(ok)).toEqual({});
		expect(Object.keys(settleErrors({ company: '', ceo: '', ceoPhone: '', bizNo: '', bank: '', account: '', holder: '' })).sort()).toEqual(['account', 'bank', 'bizNo', 'ceo', 'ceoPhone', 'company', 'holder']);
		expect(settleErrors({ ...ok, holder: '박하루' }).holder).toBe('예금주는 상호 또는 대표자와 같아야 해요');
		expect(settleErrors({ ...ok, bizNo: '124-81-00999' }).bizNo).toBe('사업자등록번호를 다시 확인해 주세요');
		expect(settleErrors({ ...ok, account: '1234' }).account).toBe('계좌번호는 숫자 8~14자리예요');
		expect(settleErrors({ ...ok, account: '1'.repeat(15) }).account).toBe('계좌번호는 숫자 8~14자리예요');
		expect(settleErrors({ ...ok, account: '1234-5678-901234' }).account).toBeUndefined();
		expect(settleErrors({ ...ok, bizNo: '', account: '' }, { hasBizNo: true, hasAccount: true })).toEqual({});
	});
	it('계좌번호 형식(0122) — 숫자 8~14자리 · 입력 칸 최대 = 정규식 위 한도 = 토스 한도', () => {
		expect(['12345678', '1'.repeat(14)].every((a) => ACCOUNT_RE.test(a))).toBe(true);
		expect(['1234567', '1'.repeat(15), '1234-5678', ''].some((a) => ACCOUNT_RE.test(a))).toBe(false);
		expect(ACCOUNT_RE.source.match(/,(\d+)\}/)?.[1]).toBe(String(ACCOUNT_MAX));
		expect(TOSS_ACCOUNT_MAX).toBe(ACCOUNT_MAX);
		// 저장 거부 — 저장된 계좌가 규칙 밖(0122 ACCOUNT_REENTER)은 계좌 칸에 "다시 입력" · 직접 입력이 틀리면 8~14자리 안내
		expect([settleSaveMessage('ACCOUNT_REENTER'), settleSaveMessage('BAD_ACCOUNT')]).toEqual([
			{ field: 'account', message: '저장된 계좌번호는 14자리가 넘어 지급할 수 없어요. 계좌번호를 다시 입력해 주세요' },
			{ field: 'account', message: '계좌번호는 숫자 8~14자리예요' }
		]);
	});
	it('대표자 휴대폰(0121) — 입력 형식만(서버 myr_mobile_ok 가 최종) · 하이픈 무관 · 유선 · 짧음', () => {
		expect(settleErrors({ ...ok, ceoPhone: '01012345678' }).ceoPhone).toBeUndefined();
		expect(settleErrors({ ...ok, ceoPhone: '' }).ceoPhone).toBe('대표자 휴대폰 번호를 입력해 주세요');
		expect(['02-123-4567', '010-123'].map((p) => settleErrors({ ...ok, ceoPhone: p }).ceoPhone)).toEqual(['휴대폰 번호를 확인해 주세요', '휴대폰 번호를 확인해 주세요']);
	});
	it('가입 폼 04 를 썼는지 — 대표자 휴대폰은 빼고 본다(연락처로 미리 채워진다)', () => {
		expect(SETTLE_USED_FIELDS).not.toContain('ceoPhone');
		expect(TOSS_CONSENT.rows.map(([k]) => k)).toEqual(['받는 곳', '목적', '항목', '보유 기간']);
	});
});

describe('API 본문 · 응답', () => {
	it('본문 — 숫자만 · 빈 사업자번호 · 계좌는 null(저장된 값 그대로) · 필수 빠지면 null', () => {
		expect(parseSettleBody(ok)).toEqual({ company: '민지랩', ceo: '김민지', bizNo: '1248100998', bank: '신한은행', account: '110123456789', holder: '김민지', ceoPhone: '01012345678', tossAgreed: false });
		expect(parseSettleBody({ ...ok, tossAgreed: true })?.tossAgreed).toBe(true);
		expect(parseSettleBody({ ...ok, tossAgreed: 'yes' })?.tossAgreed).toBe(false);
		expect(parseSettleBody({ ...ok, bizNo: '', account: '' })).toMatchObject({ bizNo: null, account: null });
		expect(parseSettleBody({ ...ok, company: '' })).toBeNull();
		expect(parseSettleBody(null)).toBeNull();
	});
	it('응답 파서 · 상태 · 배너 판정 · 거부 문구', () => {
		const i = settleInfoFromJson({ company: '민지랩', ceo: '김민지', biz_no_masked: '***-**-00998', has_biz_no: true, bank: '신한은행', holder: '김민지', account_masked: '****6789', has_account: true, tax_email: 'a@b.c', status: 'rejected', note: '예금주 확인 불가' })!;
		expect([i.status, i.note, i.accountMasked, i.taxEmail]).toEqual(['rejected', '예금주 확인 불가', '****6789', 'a@b.c']);
		expect(settleInfoFromJson({ status: 'weird' })!.status).toBe('none');
		// 0121 — 대표자 휴대폰 · 동의 · 개인사업자/법인은 서버 값 그대로(모르는 값은 null)
		expect(settleInfoFromJson({ ceo_phone: '01012345678', toss_agreed: true, biz_kind: 'corporate' })).toMatchObject({ ceoPhone: '01012345678', tossAgreed: true, bizKind: 'corporate' });
		expect(settleInfoFromJson({ biz_kind: 'weird' })).toMatchObject({ ceoPhone: null, tossAgreed: false, bizKind: null });
		// 홈 배너 — 보일지는 서버 보류 이유(hold · 0116) · 확인 중은 "확인 중"(정산 탭과 같은 값)
		const hold = { code: 'settle_info', label: '사업자 · 정산 정보 확인 전' };
		expect(i.hold).toBeNull();
		expect(settleInfoFromJson({ status: 'pending', hold })!.hold).toEqual(hold);
		expect(homeSettleBanner(null)).toBeNull();
		expect(homeSettleBanner({ status: 'verified', hold: null })).toBeNull();
		expect(homeSettleBanner({ status: 'pending', hold: { code: 'tax_invoice', label: '' } })).toBeNull();
		expect([homeSettleBanner({ status: 'none', hold })?.tone, homeSettleBanner({ status: 'rejected', hold })?.title, homeSettleBanner({ status: 'pending', hold })])
			.toEqual(['hold', '사업자 · 정산 정보를 다시 입력해 주세요', { title: '사업자 · 정산 정보를 확인하고 있어요', body: '운영팀이 확인하면 정산금이 지급돼요', tone: 'wait' }]);
		expect(settleSaveMessage('HOLDER_MISMATCH')).toEqual({ field: 'holder', message: '예금주는 상호 또는 대표자와 같아야 해요' });
		expect([settleSaveMessage('BAD_CEO_PHONE').field, settleSaveMessage('TOSS_CONSENT_REQUIRED').message]).toEqual(['ceoPhone', '토스페이먼츠 정보 제공에 동의해 주세요']);
		expect(settleSaveMessage('???').message).toContain('저장하지 못했어요');
	});
});
