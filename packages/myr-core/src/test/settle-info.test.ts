// 사업자 · 정산 정보(0085 · 0121 대표자 휴대폰 · 토스 동의 · 개인사업자/법인) — packages/myr-core/src/settle-info.ts (DB 0085 와 같은 규칙)
import { describe, expect, it } from 'vitest';
import { TOSS_ACCOUNT_MAX } from '../toss-payout-rules';
import { ACCOUNT_MAX, ACCOUNT_RE, SETTLE_USED_FIELDS, settleChangedFields, settleSavedToast, settleStatusDesc, TOSS_CONSENT, bizNoValid, formatBizNo, holderMatches, homeSettleBanner, parseSettleBody, settleErrors, settleInfoFromJson, settleSaveMessage, type SettleValues } from '../settle-info';

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
		// 0124 — 토스로 지급 가능은 서버 값(toss_ready · 0122 myr_toss_ready) · true 일 때만
		expect([settleInfoFromJson({ toss_ready: true })!.tossReady, settleInfoFromJson({ toss_ready: 'true' })!.tossReady, settleInfoFromJson({})!.tossReady]).toEqual([true, false, false]);
		// 홈 배너 — 보일지는 서버 보류 이유(hold · 0116) · 확인 중은 "확인 중"(정산 탭과 같은 값)
		const hold = { code: 'settle_info', label: '사업자 · 정산 정보 확인 전' };
		expect(i.hold).toBeNull();
		expect(settleInfoFromJson({ status: 'pending', hold })!.hold).toEqual(hold);
		const t = null; // 토스에서 할 일(toss_ask) 없음
		expect(homeSettleBanner(null)).toBeNull();
		expect(homeSettleBanner({ status: 'verified', hold: null, tossAsk: t })).toBeNull();
		expect(homeSettleBanner({ status: 'pending', hold: { code: 'tax_invoice', label: '' }, tossAsk: t })).toBeNull();
		expect([homeSettleBanner({ status: 'none', hold, tossAsk: t })?.tone, homeSettleBanner({ status: 'rejected', hold, tossAsk: t })?.title, homeSettleBanner({ status: 'pending', hold, tossAsk: null })])
			.toEqual(['hold', '사업자 · 정산 정보를 다시 입력해 주세요', { title: '사업자 · 정산 정보를 확인하고 있어요', body: '운영팀이 확인하면 정산금이 지급돼요', tone: 'wait' }]);
		// 0124 토스 인증 대기 — 운영 확인 문구 없이 본인인증 안내
		expect(homeSettleBanner({ status: 'toss', hold, tossAsk: t })).toEqual({ title: '토스 본인인증을 마쳐 주세요', body: '인증을 마치면 사업자 · 정산 정보 확인이 끝나요', tone: 'wait' });
		expect(homeSettleBanner({ status: 'toss', hold, tossAsk: 'fix' })?.title).toBe('토스페이먼츠가 정보를 확인하지 못했어요');
		// 2026-11-20 — 토스 본인인증 전(toss_ask auth)이면 "확인하고 있어요"보다 먼저 · 보류가 없어도(운영이 직접 확인 완료한 크리에이터 · 재인증) · 다시 입력 요청이 먼저
		const auth = { title: '토스 본인인증을 해 주세요', body: '대표자 휴대폰으로 온 토스페이먼츠 알림톡에서 대표자 본인 명의로 인증해 주세요', tone: 'hold' };
		expect([homeSettleBanner({ status: 'pending', hold, tossAsk: 'auth' }), homeSettleBanner({ status: 'verified', hold: null, tossAsk: 'auth' }), homeSettleBanner({ status: 'toss', hold, tossAsk: 'auth' })]).toEqual([auth, auth, auth]);
		expect(homeSettleBanner({ status: 'rejected', hold, tossAsk: 'auth' })?.title).toBe('사업자 · 정산 정보를 다시 입력해 주세요');
		expect(homeSettleBanner({ status: 'verified', hold: null, tossAsk: 'kyc' })?.title).toBe('토스페이먼츠 추가 인증을 해 주세요');
		expect(homeSettleBanner({ status: 'verified', hold: null, tossAsk: null })).toBeNull();
		// 첫 등록이 끝나지 않은 토스 인증 대기 — 알림톡이 오지 않으니 다시 등록 안내 · 확인 완료(0124 전에 확인된 크리에이터 · 토스에서 할 일 없음)는 배너 없음
		expect(homeSettleBanner({ status: 'toss', hold, tossAsk: 'register' })).toEqual({ title: '토스페이먼츠 등록을 마쳐 주세요', body: '내 정보의 토스 본인인증 카드에서 다시 등록해 주세요', tone: 'hold' });
		expect(homeSettleBanner({ status: 'verified', hold: null, tossAsk: 'register' })).toBeNull();
		// 0124 전에 확인된 크리에이터(확인 완료 · 토스 미등록) — 토스 방식에서 "토스 본인인증 전"으로 지급이 막히면(서버 보류 이유 toss_auth) 홈에도 안내
		const tossHold = { code: 'toss_auth', label: '토스 본인인증 전' };
		expect([homeSettleBanner({ status: 'verified', hold: tossHold, tossAsk: 'register' })?.title, homeSettleBanner({ status: 'verified', hold: tossHold, tossAsk: 'waiting' })?.title, homeSettleBanner({ status: 'verified', hold: tossHold, tossAsk: 'fix' })?.title])
			.toEqual(['토스페이먼츠 등록을 마쳐 주세요', '토스페이먼츠 등록을 확인하고 있어요', '토스페이먼츠가 정보를 확인하지 못했어요']);
		expect(homeSettleBanner({ status: 'verified', hold: tossHold, tossAsk: null })).toBeNull();
		expect(homeSettleBanner({ status: 'toss', hold, tossAsk: 'waiting' })).toEqual({ title: '토스페이먼츠 등록을 확인하고 있어요', body: '잠시 뒤 다시 확인해 주세요', tone: 'wait' });
		expect(settleSaveMessage('HOLDER_MISMATCH')).toEqual({ field: 'holder', message: '예금주는 상호 또는 대표자와 같아야 해요' });
		expect([settleSaveMessage('BAD_CEO_PHONE').field, settleSaveMessage('TOSS_CONSENT_REQUIRED').message]).toEqual(['ceoPhone', '토스페이먼츠 정보 제공에 동의해 주세요']);
		expect(settleSaveMessage('???').message).toContain('저장하지 못했어요');
	});
});

describe('정보 변경 안내(0124 — 등록된 크리에이터의 변경은 운영 승인 때 토스에 반영)', () => {
	it('토스 등록 진행 중 저장 거절 REGISTER_WAITING 안내(2026-11-20)', () => {
		expect(settleSaveMessage('REGISTER_WAITING')).toEqual({ message: '토스페이먼츠 등록 응답을 기다리고 있어요. 잠시 뒤 다시 저장해 주세요' });
	});
	it('확인 중 잠금(서버 edit_locked) · 저장 거절 REVIEW_PENDING 안내', () => {
		expect([settleInfoFromJson({ edit_locked: true })!.editLocked, settleInfoFromJson({})!.editLocked]).toEqual([true, false]);
		expect(settleSaveMessage('REVIEW_PENDING')).toEqual({ message: '운영팀이 확인하는 동안에는 정보를 바꿀 수 없어요. 확인이 끝난 뒤 다시 시도해 주세요' });
	});
	it('서버 값 읽기 — review_on_change · toss_after_review · edit_locked(true 일 때만) · 저장 거절 REVIEW_PENDING 안내', () => {
		expect(settleInfoFromJson({ review_on_change: true, toss_after_review: true, edit_locked: true, reauth_after_review: true })).toMatchObject({ reviewOnChange: true, tossAfterReview: true, editLocked: true, reauthAfterReview: true });
		expect([settleInfoFromJson({ toss_ask: 'auth' })!.tossAsk, settleInfoFromJson({ toss_ask: 'kyc' })!.tossAsk, settleInfoFromJson({ toss_ask: 'fix' })!.tossAsk, settleInfoFromJson({ toss_ask: 'register' })!.tossAsk, settleInfoFromJson({ toss_ask: 'waiting' })!.tossAsk, settleInfoFromJson({ toss_ask: 'wait' })!.tossAsk, settleInfoFromJson({})!.tossAsk]).toEqual(['auth', 'kyc', 'fix', 'register', 'waiting', null, null]);
		expect(settleInfoFromJson({ review_on_change: 'true', reauth_after_review: 'true' })).toMatchObject({ reviewOnChange: false, tossAfterReview: false, editLocked: false, reauthAfterReview: false });
		// 0126 — 지급 방식이 토스인가(서버 payout_toss · true 일 때만)
		expect([settleInfoFromJson({ payout_toss: true })!.payoutToss, settleInfoFromJson({ payout_toss: 'true' })!.payoutToss, settleInfoFromJson({})!.payoutToss]).toEqual([true, false, false]);
		expect(settleSaveMessage('REVIEW_PENDING')).toEqual({ message: '운영팀이 확인하는 동안에는 정보를 바꿀 수 없어요. 확인이 끝난 뒤 다시 시도해 주세요' });
	});
	it('바뀐 칸 — 입력 값 ↔ 저장된 값 · 사업자번호 · 계좌는 새로 입력했으면 · 하이픈 무관 · 공백 무관', () => {
		const info = settleInfoFromJson({ company: '민지랩', ceo: '김민지', bank: '신한은행', holder: '김민지', ceo_phone: '01012345678' });
		const same = { company: ' 민지랩 ', ceo: '김민지', ceoPhone: '010-1234-5678', bizNo: '', bank: '신한은행', account: '', holder: '김민지' };
		expect(settleChangedFields(same, info)).toEqual([]);
		expect(settleChangedFields({ ...same, ceoPhone: '010-9999-0000', account: '110123456789' }, info).map((c) => c.label)).toEqual(['대표자 휴대폰', '계좌번호']);
		expect(settleChangedFields({ ...same, bizNo: '1248100998', holder: '민지랩' }, info).map((c) => c.field)).toEqual(['bizNo', 'holder']);
	});
	it('상태 카드 설명 · 저장 뒤 안내 — 서버 값(tossAfterReview · recheck)으로 고른다', () => {
		const r = { reauthAfterReview: false };
		expect(settleStatusDesc({ ...r, status: 'pending', tossAfterReview: true })).toBe('바뀐 사업자 · 정산 정보를 운영팀이 확인하고 있어요. 확인이 끝나면 토스페이먼츠에 등록돼요.');
		expect(settleStatusDesc({ status: 'pending', tossAfterReview: true, reauthAfterReview: true })).toBe('바뀐 사업자 · 정산 정보를 운영팀이 확인하고 있어요. 확인이 끝나면 대표자 휴대폰으로 토스 본인인증을 다시 해야 해요.');
		expect(settleStatusDesc({ ...r, status: 'toss', tossAfterReview: false })).not.toContain('운영팀');
		expect(settleInfoFromJson({ status: 'toss' })!.status).toBe('toss');
		expect(settleStatusDesc({ ...r, status: 'pending', tossAfterReview: false })).toMatch(/사업자 · 계좌 정보를 확인하고/);
		expect(settleStatusDesc(null)).toMatch(/입력해 주세요/);
		expect([settleSavedToast({ status: 'pending', tossAfterReview: true, reauthAfterReview: true }, true), settleSavedToast({ ...r, tossAfterReview: true, status: 'pending' }, true), settleSavedToast({ ...r, tossAfterReview: false, status: 'toss' }, false), settleSavedToast({ ...r, tossAfterReview: false, status: 'pending' }, true), settleSavedToast({ ...r, tossAfterReview: false, status: 'verified' }, false)]).toEqual([
			'저장했어요 · 운영팀 확인 뒤 토스 본인인증을 다시 해 주세요',
			'저장했어요 · 운영팀 확인 뒤 토스페이먼츠에 반영돼요',
			'저장했어요 · 토스페이먼츠에 바로 등록돼요',
			'저장했어요 · 운영팀이 확인해야 정산금이 지급돼요',
			'저장했어요'
		]);
	});
});
