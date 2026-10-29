// 인증 순수 헬퍼 — apps/myr-shop/src/lib/auth.ts (packages/db auth.ts 복사본 · 셀러리 쪽 테스트 auth.test.ts 와 같은 계약)
import type { User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { avatarOf, displayName, safeNext } from '../lib/auth';

const user = (meta: Record<string, unknown>): User =>
	({ id: 'u', app_metadata: {}, user_metadata: meta, aud: 'authenticated', created_at: '' }) as unknown as User;

describe('safeNext — 오픈 리다이렉트 방지', () => {
	it('같은 오리진 경로만 통과 · 쿼리·해시 유지', () => {
		expect(safeNext('/my')).toBe('/my');
		expect(safeNext('/p/minji-grape-jelly?x=1#why')).toBe('/p/minji-grape-jelly?x=1#why');
	});
	it('외부·프로토콜 상대·제어문자·루프 경로는 "/"', () => {
		expect(safeNext('https://evil.com')).toBe('/');
		expect(safeNext('//evil.com')).toBe('/');
		expect(safeNext('/\\evil.com')).toBe('/');
		expect(safeNext('/\t/evil.com')).toBe('/');
		expect(safeNext('/login')).toBe('/');
		expect(safeNext('/auth/callback')).toBe('/');
		expect(safeNext('')).toBe('/');
		expect(safeNext(null)).toBe('/');
	});
});

describe('displayName · avatarOf — 카카오 user_metadata', () => {
	it('nickname 우선 · 없으면 name · 전부 없으면 "고객"', () => {
		expect(displayName(user({ nickname: ' 민지 ', name: 'x' }))).toBe('민지');
		expect(displayName(user({ name: '하루' }))).toBe('하루');
		expect(displayName(user({}))).toBe('고객');
	});
	it('avatar_url ?? picture ?? null', () => {
		expect(avatarOf(user({ avatar_url: 'https://a/1.png' }))).toBe('https://a/1.png');
		expect(avatarOf(user({ picture: 'https://a/2.png' }))).toBe('https://a/2.png');
		expect(avatarOf(user({}))).toBeNull();
	});
});
