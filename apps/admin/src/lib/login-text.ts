/**
 * 관리자 로그인 화면 문구 — 한국어 · 영어(`$lib/lang` · 메타 앱 검수자가 처음 보는 화면). 순수 모듈.
 * `en` 은 `LoginText`(= `ko` 의 모양) 타입 — 칸이 빠지면 check 가 실패한다.
 */
import type { Lang } from './lang';

const ko = {
	title: '로그인 — 셀러리 관리자',
	label: '관리자 콘솔',
	heading: '로그인',
	intro: '셀러리 관리자 계정으로 로그인합니다. 관리자 계정은 고객·인플루언서·브랜드 계정과 별개의 이메일 계정이에요.',
	role: { seller: '인플루언서', brand: '브랜드', customer: '고객(카카오)' } as Record<string, string>,
	/** 다른 역할로 로그인돼 있을 때 — `who` = 이메일 또는 역할 이름, `role` = 역할 이름(없으면 null) */
	foreign: (who: string | null, role: string | null) =>
		({ before: '지금 ', who: who ?? '다른', after: ` 계정${role ? `(${role})` : ''}으로 로그인돼 있어요. 관리자 콘솔은 별도의 운영팀 계정으로 들어갑니다 — 먼저 로그아웃한 뒤 관리자 계정으로 로그인해주세요.` }),
	foreignSignout: '로그아웃하고 관리자 계정으로',
	email: '이메일',
	password: '비밀번호',
	passwordPh: '8자 이상',
	show: '표시',
	hide: '숨김',
	toggleAria: '비밀번호 표시 전환',
	submit: '로그인 →',
	busy: '로그인 중…',
	foot: '관리자 계정은 운영팀이 직접 발급합니다',
	site: '← 셀러리 고객 사이트',
	demo: '관리자 데모 화면',
	err: {
		email: '이메일 형식을 확인해주세요.',
		short: '비밀번호는 8자 이상이에요.',
		credentials: '이메일 또는 비밀번호가 올바르지 않아요.',
		unconfirmed: '이메일 인증이 아직 끝나지 않았어요.',
		rate: '시도가 너무 많아요 — 잠시 후 다시 시도해주세요.',
		generic: '로그인에 실패했어요. 잠시 후 다시 시도해주세요.'
	}
};

export type LoginText = typeof ko;

const en: LoginText = {
	title: 'Sign in — Sellery Admin',
	label: 'Admin console',
	heading: 'Sign in',
	intro: 'Sign in with a Sellery admin account. Admin accounts are separate email accounts — not customer, creator or brand accounts.',
	role: { seller: 'creator', brand: 'brand', customer: 'customer (Kakao)' },
	foreign: (who, role) =>
		({ before: 'You are signed in as ', who: who ?? 'another account', after: `${role ? ` (${role})` : ''}. The admin console uses a separate team account — please sign out first, then sign in with an admin account.` }),
	foreignSignout: 'Sign out and use an admin account',
	email: 'Email',
	password: 'Password',
	passwordPh: '8 characters or more',
	show: 'Show',
	hide: 'Hide',
	toggleAria: 'Toggle password visibility',
	submit: 'Sign in →',
	busy: 'Signing in…',
	foot: 'Admin accounts are issued by the operations team',
	site: '← Sellery store',
	demo: 'Admin demo',
	err: {
		email: 'Please check the email address.',
		short: 'The password must be at least 8 characters.',
		credentials: 'The email or password is incorrect.',
		unconfirmed: 'This email address has not been confirmed yet.',
		rate: 'Too many attempts — please try again in a moment.',
		generic: 'Sign-in failed. Please try again in a moment.'
	}
};

const TEXT: Record<Lang, LoginText> = { ko, en };

export function loginText(lang: Lang): LoginText {
	return TEXT[lang];
}
