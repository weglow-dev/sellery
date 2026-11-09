// 사업자 · 정산 정보(0085) — packages/myr-core/src/settle-info.ts (DB 0085 와 같은 규칙)
import { describe, expect, it } from 'vitest';
import { bizNoValid, formatBizNo, holderMatches, needsSettleInfo, parseSettleBody, settleErrors, settleInfoFromJson, settleSaveMessage, type SettleValues } from '../settle-info';

const ok: SettleValues = { company: '민지랩', ceo: '김민지', bizNo: '124-81-00998', bank: '신한은행', account: '110-123-456789', holder: '김민지' };

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
		expect(Object.keys(settleErrors({ company: '', ceo: '', bizNo: '', bank: '', account: '', holder: '' })).sort()).toEqual(['account', 'bank', 'bizNo', 'ceo', 'company', 'holder']);
		expect(settleErrors({ ...ok, holder: '박하루' }).holder).toBe('예금주는 상호 또는 대표자와 같아야 해요');
		expect(settleErrors({ ...ok, bizNo: '124-81-00999' }).bizNo).toBe('사업자등록번호를 다시 확인해 주세요');
		expect(settleErrors({ ...ok, account: '1234' }).account).toBe('계좌번호는 숫자 8~16자리예요');
		expect(settleErrors({ ...ok, bizNo: '', account: '' }, { hasBizNo: true, hasAccount: true })).toEqual({});
	});
});

describe('API 본문 · 응답', () => {
	it('본문 — 숫자만 · 빈 사업자번호 · 계좌는 null(저장된 값 그대로) · 필수 빠지면 null', () => {
		expect(parseSettleBody(ok)).toEqual({ company: '민지랩', ceo: '김민지', bizNo: '1248100998', bank: '신한은행', account: '110123456789', holder: '김민지' });
		expect(parseSettleBody({ ...ok, bizNo: '', account: '' })).toMatchObject({ bizNo: null, account: null });
		expect(parseSettleBody({ ...ok, company: '' })).toBeNull();
		expect(parseSettleBody(null)).toBeNull();
	});
	it('응답 파서 · 상태 · 배너 판정 · 거부 문구', () => {
		const i = settleInfoFromJson({ company: '민지랩', ceo: '김민지', biz_no_masked: '***-**-00998', has_biz_no: true, bank: '신한은행', holder: '김민지', account_masked: '****6789', has_account: true, tax_email: 'a@b.c', status: 'rejected', note: '예금주 확인 불가' })!;
		expect([i.status, i.note, i.accountMasked, i.taxEmail]).toEqual(['rejected', '예금주 확인 불가', '****6789', 'a@b.c']);
		expect(settleInfoFromJson({ status: 'weird' })!.status).toBe('none');
		expect([needsSettleInfo(null), needsSettleInfo({ status: 'none' }), needsSettleInfo({ status: 'rejected' }), needsSettleInfo({ status: 'pending' }), needsSettleInfo({ status: 'verified' })]).toEqual([true, true, true, false, false]);
		expect(settleSaveMessage('HOLDER_MISMATCH')).toEqual({ field: 'holder', message: '예금주는 상호 또는 대표자와 같아야 해요' });
		expect(settleSaveMessage('???').message).toContain('저장하지 못했어요');
	});
});
