// 크리에이터 초대 가입 규칙 — apps/myr-influencer/src/lib/signup-rules.ts
import { describe, expect, it } from 'vitest';
import { HANDLE_MAX, PLATFORMS, TERMS, allAgreed, cleanHandleInput, inviteValidity, isPlatform, missingCount, platformName, signupErrors, submitLabel, type SignupValues } from '../lib/signup-rules';

const ok: SignupValues = {
	password: 'abcd1234',
	confirm: 'abcd1234',
	name: '민지 루틴',
	handle: 'minji.routine',
	platform: 'instagram',
	phone: '010-1234-5678',
	agreed: { tos: true, privacy: true }
};

describe('signupErrors — 시안의 칸별 문구', () => {
	it('모두 채우면 오류 없음 · 남은 칸 0 · 버튼 문구', () => {
		const e = signupErrors(ok);
		expect(Object.values(e).every((m) => m === '')).toBe(true);
		expect(missingCount(e, ok.agreed)).toBe(0);
		expect(submitLabel(0)).toBe('가입 완료하기');
	});
	it('빈 폼 — 6칸 + 약관 = 7개 남음', () => {
		const empty: SignupValues = { password: '', confirm: '', name: '', handle: '', platform: null, phone: '', agreed: { tos: false, privacy: false } };
		const e = signupErrors(empty);
		expect(e).toEqual({
			password: '비밀번호를 입력해주세요',
			confirm: '비밀번호를 한 번 더 입력해주세요',
			name: '활동명을 입력해주세요',
			handle: '핸들을 입력해주세요',
			platform: '대표 채널을 하나 골라주세요',
			phone: '휴대폰 번호를 입력해주세요'
		});
		expect(missingCount(e, empty.agreed)).toBe(7);
		expect(submitLabel(7)).toBe('가입 완료하기 · 7개 남음');
	});
	it('비밀번호 — 8자 미만 · 72자 초과 · 확인 불일치', () => {
		expect(signupErrors({ ...ok, password: 'short', confirm: 'short' }).password).toBe('비밀번호는 8자 이상이에요');
		expect(signupErrors({ ...ok, password: 'a'.repeat(73), confirm: 'a'.repeat(73) }).password).toContain('72자');
		expect(signupErrors({ ...ok, confirm: 'abcd12345' }).confirm).toBe('비밀번호가 서로 달라요');
	});
	it('핸들 — 형식 · 길이 · 이미 쓰는 핸들', () => {
		expect(signupErrors({ ...ok, handle: 'Minji!' }).handle).toBe('영문 소문자, 숫자, . _ 만 쓸 수 있어요');
		expect(signupErrors({ ...ok, handle: 'm' }).handle).toBe('핸들은 2자 이상이에요');
		expect(signupErrors({ ...ok, handle: 'a'.repeat(HANDLE_MAX + 1) }).handle).toContain('30자');
		expect(signupErrors(ok, ['minji.routine']).handle).toBe('이미 다른 크리에이터가 쓰고 있어요');
		expect(signupErrors({ ...ok, handle: '@Minji.Routine' }).handle).toBe(''); // 입력 정리 뒤 판정
	});
	it('채널 · 연락처', () => {
		expect(signupErrors({ ...ok, platform: 'naver' }).platform).toBe('대표 채널을 하나 골라주세요');
		expect(signupErrors({ ...ok, phone: '010-1234' }).phone).toBe('휴대폰 번호를 확인해주세요');
		expect(signupErrors({ ...ok, phone: '01012345678' }).phone).toBe(''); // 하이픈 없이 와도 정리 뒤 판정
	});
	it('약관은 둘 다 동의해야 한 칸이 채워진다', () => {
		expect(allAgreed({ tos: true, privacy: false })).toBe(false);
		expect(missingCount(signupErrors(ok), { tos: true, privacy: false })).toBe(1);
	});
});

describe('입력 정리 · 목록', () => {
	it('cleanHandleInput — @ · 공백 제거 · 소문자', () => expect(cleanHandleInput(' @@Minji Routine ')).toBe('minjiroutine'));
	it('채널 세 개 · 이름', () => {
		expect(PLATFORMS.map((p) => p.id)).toEqual(['instagram', 'youtube', 'tiktok']);
		expect(isPlatform('youtube')).toBe(true);
		expect(platformName('tiktok')).toBe('틱톡');
		expect(platformName(null)).toBe('');
	});
	it('필수 약관 두 개', () => expect(TERMS.map((t) => t.id)).toEqual(['tos', 'privacy']));
});

describe('inviteValidity — 한국 시각 날짜 · 남은 일수', () => {
	const now = new Date('2026-11-04T03:00:00Z'); // 11월 4일 12시(KST)
	it('7일 남음', () => expect(inviteValidity('2026-11-11T03:00:00Z', now)).toEqual({ until: '11월 11일까지', left: '7일 남음', expired: false }));
	it('하루 안이면 오늘까지', () => expect(inviteValidity('2026-11-04T14:00:00Z', now).left).toBe('오늘까지'));
	it('지난 시각 · 잘못된 값은 만료', () => {
		expect(inviteValidity('2026-11-01T00:00:00Z', now).expired).toBe(true);
		expect(inviteValidity('nope', now).expired).toBe(true);
	});
	it('날짜는 KST — UTC 로는 전날 15시인 시각도 한국 날짜로', () => expect(inviteValidity('2026-11-10T15:30:00Z', now).until).toBe('11월 11일까지'));
});
