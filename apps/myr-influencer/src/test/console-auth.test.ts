// 크리에이터 콘솔 로그인 규칙 — apps/myr-influencer/src/lib/console-auth.ts
import { describe, expect, it } from 'vitest';
import { LINK_ERROR, authErrorMessage, consoleNext, gateLocation, isPublicPath, loginPath, parseLoginForm, parseNewPassword } from '../lib/console-auth';

const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe('isPublicPath — 로그인 없이 열리는 곳', () => {
	it('로그인 · 비밀번호 찾기 · 메일 링크 착지 · robots', () => {
		for (const p of ['/login', '/password', '/auth/confirm', '/auth/signout', '/robots.txt']) expect(isPublicPath(p), p).toBe(true);
	});
	it('콘솔 화면 · 새 비밀번호 · 안내 화면은 세션이 필요', () => {
		for (const p of ['/', '/cs', '/cs/cs1', '/products', '/products/new', '/password/new', '/unlinked', '/suspended', '/loginx']) expect(isPublicPath(p), p).toBe(false);
	});
});

describe('consoleNext · loginPath — 같은 오리진 경로만', () => {
	it('콘솔 경로는 그대로 · 바깥 주소와 루프 경로는 홈', () => {
		expect(consoleNext('/cs/cs1?x=1')).toBe('/cs/cs1?x=1');
		for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/login', '/auth/confirm', '', null, undefined]) expect(consoleNext(bad)).toBe('/');
	});
	it('loginPath — 홈이면 next 생략, 아니면 인코딩해서 싣는다', () => {
		expect(loginPath('/')).toBe('/login');
		expect(loginPath('/products/new?draft=d1')).toBe('/login?next=%2Fproducts%2Fnew%3Fdraft%3Dd1');
		expect(loginPath('https://evil.com')).toBe('/login');
	});
});

describe('gateLocation — 콘솔 상태별 이동', () => {
	it('anon → 로그인(next) · unlinked → 안내 · suspended → 안내 · ok → 그대로', () => {
		expect(gateLocation('anon', '/cs')).toBe('/login?next=%2Fcs');
		expect(gateLocation('unlinked', '/cs')).toBe('/unlinked');
		expect(gateLocation('suspended', '/cs')).toBe('/suspended');
		expect(gateLocation('ok', '/cs')).toBeNull();
	});
});

describe('parseLoginForm', () => {
	it('이메일은 공백 제거 · 소문자', () => {
		expect(parseLoginForm(fd({ email: '  Minji@Example.COM ', password: 'abcd1234' }))).toEqual({ ok: true, input: { email: 'minji@example.com', password: 'abcd1234' } });
	});
	it('이메일 형식 · 비밀번호 8자 미만은 해당 칸 오류', () => {
		expect(parseLoginForm(fd({ email: 'nope', password: 'abcd1234' }))).toMatchObject({ ok: false, field: 'email' });
		expect(parseLoginForm(fd({ email: 'a@b.co', password: 'short' }))).toMatchObject({ ok: false, field: 'password' });
		expect(parseLoginForm(fd({}))).toMatchObject({ ok: false, field: 'email' });
	});
	it('비밀번호 앞뒤 공백은 그대로 둔다(비밀번호 일부일 수 있다)', () => {
		const r = parseLoginForm(fd({ email: 'a@b.co', password: ' abcd123 ' }));
		expect(r.ok && r.input.password).toBe(' abcd123 ');
	});
});

describe('parseNewPassword', () => {
	it('8자 이상 · 72자 이하 · 확인 칸과 같아야', () => {
		expect(parseNewPassword(fd({ password: 'abcd1234', confirm: 'abcd1234' }))).toEqual({ ok: true, password: 'abcd1234' });
		expect(parseNewPassword(fd({ password: 'abc', confirm: 'abc' })).ok).toBe(false);
		expect(parseNewPassword(fd({ password: 'abcd1234', confirm: 'abcd12345' }))).toMatchObject({ ok: false, message: '두 비밀번호가 달라요' });
		expect(parseNewPassword(fd({ password: 'a'.repeat(73), confirm: 'a'.repeat(73) })).ok).toBe(false);
	});
});

describe('authErrorMessage — 계정 존재 여부를 드러내지 않는다', () => {
	it('자격 증명 오류는 한 문구 · 나머지는 사유별 · 모르는 오류는 일반 문구', () => {
		expect(authErrorMessage('Invalid login credentials')).toBe('이메일 또는 비밀번호가 맞지 않아요');
		expect(authErrorMessage('Email not confirmed')).toContain('메일 인증');
		expect(authErrorMessage('Request rate limit reached')).toContain('잠시 후');
		expect(authErrorMessage('New password should be different from the old password.')).toContain('다른 비밀번호');
		expect(authErrorMessage('something odd')).toBe('잠시 후 다시 시도해주세요');
		expect(authErrorMessage(null)).toBe('잠시 후 다시 시도해주세요');
	});
	it('메일 링크 오류 문구', () => {
		expect(LINK_ERROR.expired).toContain('만료');
	});
});
