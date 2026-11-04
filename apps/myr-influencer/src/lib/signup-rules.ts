/**
 * 크리에이터 초대 가입 규칙 — 칸 검증 · 남은 칸 수 · 대표 채널 · 약관 · 초대 유효기간 표시.
 * 시안 "MYR Influencer Signup"(모바일 · PC)의 renderVals 계산을 순수 함수로 옮겼다. `$env` · `$app` 을 import 하지 않는다 — `src/test/signup-rules.test.ts`.
 * 이메일은 초대받은 주소로 고정이라(초대 링크가 이메일 소유를 증명한다) 폼에서 검증하지 않는다 — docs/myr.md §4.2.1 10번.
 * 서버 저장(가입 기능 단계)도 이 검증을 그대로 쓴다.
 */
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

/** 칸마다 오류 문구(없으면 빈 문자열). takenHandles = 이미 쓰는 핸들(서버가 알려준 값 · 미리보기는 예시 목록) */
export function signupErrors(v: SignupValues, takenHandles: readonly string[] = []): Record<SignupField, string> {
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
						: takenHandles.includes(handle)
							? '이미 다른 크리에이터가 쓰고 있어요'
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

export const submitLabel = (missing: number): string => (missing === 0 ? '가입 완료하기' : `가입 완료하기 · ${missing}개 남음`);

/**
 * 초대 유효기간 표시 — "11월 11일까지 · 7일 남음". 날짜는 한국 시각 기준.
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
