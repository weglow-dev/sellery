/**
 * 크리에이터 초대 가입 규칙 — 칸 검증 · 남은 칸 수 · 대표 채널 · 약관 · 초대 유효기간 표시.
 * 시안 "MYR Influencer Signup"(모바일 · PC)의 renderVals 계산을 순수 함수로 옮겼다. `$env` · `$app` 을 import 하지 않는다 — `src/test/signup-rules.test.ts`.
 * 이메일은 초대받은 주소로 고정이라(초대 링크가 이메일 소유를 증명한다) 폼에서 검증하지 않는다 — docs/myr.md §4.2.1 10번.
 * 가입 action(서버)도 이 검증을 먼저 돌리고, 저장은 0070 `myr_app_invite_accept` 가 같은 규칙으로 다시 본다(서버의 정답).
 * 핸들 중복 · 예약어는 서버만 안다 — 칸을 벗어날 때 물어본 결과(HandleStatus)를 받아 문구만 고른다.
 */
import type { AcceptCode, HandleStatus } from '@sellery/myr-core/invite-rules';
import { PHONE_RE, formatPhone } from '@sellery/myr-core/phone';
import { PASSWORD_MIN } from './console-auth';

/** 대표 채널 — DB `sellers.platform` 값과 같은 id. 시안은 세 개(네이버 블로그는 넣지 않았다) */
export const PLATFORMS = [
	{ id: 'instagram', name: '인스타그램', dot: '#F58FB4' },
	{ id: 'youtube', name: '유튜브', dot: '#FF6B6B' },
	{ id: 'tiktok', name: '틱톡', dot: '#8FE3F0' }
] as const;
export type PlatformId = (typeof PLATFORMS)[number]['id'];
export const isPlatform = (v: unknown): v is PlatformId => PLATFORMS.some((p) => p.id === v);
export const platformName = (id: string | null | undefined): string => PLATFORMS.find((p) => p.id === id)?.name ?? '';

/** 필수 약관 — 문서 링크는 약관이 확정되면 붙인다 */
export const TERMS = [
	{ id: 'tos', name: '크리에이터 이용약관' },
	{ id: 'privacy', name: '개인정보 수집 · 이용' }
] as const;
export type TermId = (typeof TERMS)[number]['id'];

/** 핸들 — 영문 소문자 · 숫자 · `.` · `_` 2~30자(`@` 없이 저장 칸에 쓴다 · DB 에는 `@` 를 붙인다) */
export const HANDLE_RE = /^[a-z0-9._]+$/;
export const HANDLE_MIN = 2;
export const HANDLE_MAX = 30;

/** 핸들 칸 입력 정리 — 앞의 `@` · 공백 제거 · 소문자 */
export const cleanHandleInput = (v: string): string => String(v ?? '').replace(/\s/g, '').replace(/^@+/, '').toLowerCase();

export type SignupValues = {
	password: string;
	confirm: string;
	name: string;
	handle: string;
	platform: string | null;
	phone: string;
	agreed: Record<TermId, boolean>;
};
export type SignupField = 'password' | 'confirm' | 'name' | 'handle' | 'platform' | 'phone';
export const SIGNUP_FIELDS: SignupField[] = ['password', 'confirm', 'name', 'handle', 'platform', 'phone'];

export const NAME_MAX = 30;

/** 서버 핸들 확인 결과 → 문구(사용 가능이면 빈 문자열) */
export const HANDLE_STATUS_MESSAGE: Record<Exclude<HandleStatus, 'available'>, string> = {
	taken: '이미 다른 크리에이터가 쓰고 있어요',
	reserved: 'MYR 공식 계정처럼 보이는 이름이라 쓸 수 없어요',
	bad: '영문 소문자, 숫자, . _ 만 쓸 수 있어요'
};

/** 칸마다 오류 문구(없으면 빈 문자열). checked = 핸들별 서버 확인 결과(칸을 벗어날 때 물어본 것) */
export function signupErrors(v: SignupValues, checked: Readonly<Record<string, HandleStatus>> = {}): Record<SignupField, string> {
	const name = v.name.trim();
	const handle = cleanHandleInput(v.handle);
	const phone = formatPhone(v.phone);
	return {
		password: !v.password ? '비밀번호를 입력해주세요' : v.password.length < PASSWORD_MIN ? `비밀번호는 ${PASSWORD_MIN}자 이상이에요` : v.password.length > 72 ? '비밀번호는 72자까지 쓸 수 있어요' : '',
		confirm: !v.confirm ? '비밀번호를 한 번 더 입력해주세요' : v.confirm !== v.password ? '비밀번호가 서로 달라요' : '',
		name: !name ? '활동명을 입력해주세요' : name.length > NAME_MAX ? `활동명은 ${NAME_MAX}자까지 쓸 수 있어요` : '',
		handle: !handle
			? '핸들을 입력해주세요'
			: !HANDLE_RE.test(handle)
				? '영문 소문자, 숫자, . _ 만 쓸 수 있어요'
				: handle.length < HANDLE_MIN
					? `핸들은 ${HANDLE_MIN}자 이상이에요`
					: handle.length > HANDLE_MAX
						? `핸들은 ${HANDLE_MAX}자까지 쓸 수 있어요`
						: checked[handle] && checked[handle] !== 'available'
							? HANDLE_STATUS_MESSAGE[checked[handle] as Exclude<HandleStatus, 'available'>]
							: '',
		platform: !isPlatform(v.platform) ? '대표 채널을 하나 골라주세요' : '',
		phone: !phone ? '휴대폰 번호를 입력해주세요' : !PHONE_RE.test(phone) ? '휴대폰 번호를 확인해주세요' : ''
	};
}

export const allAgreed = (agreed: Record<TermId, boolean>): boolean => TERMS.every((t) => agreed[t.id]);

/** 아직 못 채운 칸 수 — 제출 버튼 "가입 완료하기 · N개 남음". 약관은 한 칸으로 센다 */
export function missingCount(errs: Record<SignupField, string>, agreed: Record<TermId, boolean>): number {
	return SIGNUP_FIELDS.filter((k) => !!errs[k]).length + (allAgreed(agreed) ? 0 : 1);
}

/** 가입 폼(form action) → 값 — 칸 이름: password · confirm · name · handle · platform · phone · agree_tos · agree_privacy */
export function parseSignupForm(fd: { get(name: string): unknown }): SignupValues {
	const str = (k: string) => String(fd.get(k) ?? '');
	return {
		password: str('password'),
		confirm: str('confirm'),
		name: str('name'),
		handle: cleanHandleInput(str('handle')),
		platform: str('platform') || null,
		phone: formatPhone(str('phone')),
		agreed: { tos: fd.get('agree_tos') === '1', privacy: fd.get('agree_privacy') === '1' }
	};
}

/** 서버가 가입을 거절했을 때 화면이 할 일 — 링크가 닫혔으면 만료 화면 · 칸 문제면 그 칸 · 그 밖은 폼 위 안내 */
export type SignupFailure = { screen: 'expired' } | { field: SignupField | 'terms'; message: string } | { message: string };
export function acceptFailure(code: AcceptCode | string, field?: string | null): SignupFailure {
	switch (code) {
		case 'NOT_FOUND':
		case 'EXPIRED':
		case 'USED':
		case 'REVOKED':
			return { screen: 'expired' };
		case 'HANDLE_TAKEN':
			return { field: 'handle', message: HANDLE_STATUS_MESSAGE.taken };
		case 'RESERVED_HANDLE':
			return { field: 'handle', message: HANDLE_STATUS_MESSAGE.reserved };
		case 'WEAK_PASSWORD':
			return { field: 'password', message: '더 길거나 복잡한 비밀번호를 써주세요' };
		case 'INVALID_INPUT':
			if (field === 'terms') return { field: 'terms', message: '약관과 개인정보 수집 · 이용에 동의해주세요' };
			if (field && (SIGNUP_FIELDS as string[]).includes(field)) return { field: field as SignupField, message: '입력한 값을 다시 확인해주세요' };
			return { message: '입력한 값을 다시 확인해주세요' };
		case 'EMAIL_HAS_ACCOUNT':
			return { message: '이 이메일로 만든 계정이 이미 있어요. 로그인하거나 MYR 파트너팀에 알려주세요' };
		case 'ALREADY_CREATOR':
		case 'ALREADY_LINKED':
		case 'EMAIL_MISMATCH':
			return { message: '이미 크리에이터로 등록된 이메일이에요. 로그인해주세요' };
		default:
			return { message: '가입을 마치지 못했어요. 잠시 후 다시 시도해주세요' };
	}
}

export const submitLabel = (missing: number): string => (missing === 0 ? '가입 완료하기' : `가입 완료하기 · ${missing}개 남음`);

/**
 * 초대 유효기간 표시 — "12월 4일까지 · 30일 남음". 날짜는 한국 시각 기준.
 * daysLeft 는 남은 시간을 하루 단위로 올림(오늘 안에 끝나면 "오늘까지").
 */
export function inviteValidity(expiresAt: string, now: Date = new Date()): { until: string; left: string; expired: boolean } {
	const end = new Date(expiresAt);
	const ms = end.getTime() - now.getTime();
	if (!Number.isFinite(ms) || ms <= 0) return { until: '', left: '', expired: true };
	const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).formatToParts(end);
	const m = parts.find((p) => p.type === 'month')?.value ?? '';
	const d = parts.find((p) => p.type === 'day')?.value ?? '';
	const days = Math.ceil(ms / 86_400_000);
	return { until: `${m}월 ${d}일까지`, left: days <= 1 ? '오늘까지' : `${days}일 남음`, expired: false };
}
