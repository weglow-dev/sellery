// 크리에이터 비밀번호 재설정 — 링크 · 토큰 형식 · 메일(MYR 문구 · 셀러리 문구 없음) (2026-11-05)
import { describe, expect, it } from 'vitest';
import { passwordResetMail } from '../mail/templates';
import { RESET_PER_EMAIL, isTokenHash, recoveryLink } from '../password-reset';

const HASH = 'a3f1'.repeat(14);

describe('recoveryLink', () => {
	it('콘솔 /auth/confirm · token_hash · type=recovery · next=/password/new · 끝 슬래시 정리', () => {
		const u = new URL(recoveryLink('https://myr-influencer.vercel.app/', HASH));
		expect(u.origin + u.pathname).toBe('https://myr-influencer.vercel.app/auth/confirm');
		expect(Object.fromEntries(u.searchParams)).toEqual({ token_hash: HASH, type: 'recovery', next: '/password/new' });
	});
	it('토큰 형식', () => {
		expect(isTokenHash(HASH)).toBe(true);
		for (const bad of ['', 'xyz', HASH.toUpperCase(), 'ab', null, 1]) expect(isTokenHash(bad), String(bad)).toBe(false);
	});
	it('이메일당 상한은 10분 3회', () => expect(RESET_PER_EMAIL).toEqual({ max: 3, windowMs: 600_000 }));
});

describe('passwordResetMail', () => {
	const m = passwordResetMail({ name: '민지 루틴', email: 'minji@myr.kr', link: recoveryLink('https://myr-influencer.vercel.app', HASH), tokenHash: HASH });
	it('MYR 문구 · 버튼 링크 · 1회용/1시간 안내 · 셀러리 문구 없음', () => {
		expect(m.subject).toBe('[MYR] 크리에이터 스튜디오 비밀번호 재설정');
		expect(m.text).toContain('민지 루틴님');
		expect(m.text).toContain(`새 비밀번호 정하기: https://myr-influencer.vercel.app/auth/confirm?token_hash=${HASH}`);
		expect(m.text).toContain('1시간');
		expect(m.html).toContain('MYR');
		expect(m.html + m.text).not.toContain('셀러리');
		expect(m.tag).toBe('myr_password_reset');
	});
	it('멱등 키는 토큰마다 다르다(요청마다 새 메일)', () => {
		const other = passwordResetMail({ name: 'a', email: 'a@b.co', link: 'x', tokenHash: 'b'.repeat(56) });
		expect(m.idempotencyKey).toMatch(/^myr_password_reset:/);
		expect(other.idempotencyKey).not.toBe(m.idempotencyKey);
	});
});
