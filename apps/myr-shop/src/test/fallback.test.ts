// 샵 데이터 폴백 규칙 — apps/myr-shop/src/lib/fallback.ts (목 데이터는 dev 에서만 · 운영은 빈 화면 + 에러 로그)
import { describe, expect, it } from 'vitest';
import { fallbackLog, useMock } from '../lib/fallback';

describe('useMock', () => {
	it('dev 면 환경변수 없음 · RPC 실패 모두 목으로', () => {
		expect(useMock(true, 'no-env')).toBe(true);
		expect(useMock(true, 'rpc-error')).toBe(true);
	});
	it('운영·Preview(dev 아님)는 어느 경우도 목을 쓰지 않는다', () => {
		expect(useMock(false, 'no-env')).toBe(false);
		expect(useMock(false, 'rpc-error')).toBe(false);
	});
});

describe('fallbackLog', () => {
	it('운영은 error 레벨 + "빈 화면" 안내', () => {
		const l = fallbackLog(false, 'no-env');
		expect(l.level).toBe('error');
		expect(l.message).toContain('PUBLIC_SUPABASE_URL/ANON_KEY 가 비어 있음');
		expect(l.message).toContain('빈 화면');
	});
	it('dev 는 warn + 목 데이터 안내 · RPC 실패는 상세를 붙인다', () => {
		const l = fallbackLog(true, 'rpc-error', 'myr_home_products boom');
		expect(l.level).toBe('warn');
		expect(l.message).toContain('RPC 실패: myr_home_products boom');
		expect(l.message).toContain('목 데이터');
	});
});
