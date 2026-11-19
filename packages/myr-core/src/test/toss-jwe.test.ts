// 토스 지급대행 암호화(JWE dir · A256GCM) — packages/myr-core/src/toss-jwe.ts(셀러리 packages/payments/src/jwe.ts 복사본). 왕복 · 헤더 · 변조 거부
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, hexKeyBytes, isJweCompact, jweDecrypt, jweEncrypt, jweHeaderOf, tossIat } from '../toss-jwe';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex = 32 bytes(테스트 전용 · 실제 키 아님)

describe('base64url · 키 · iat', () => {
	it('base64url 왕복(패딩 없음 · -_)', () => {
		const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
		const s = b64urlEncode(bytes);
		expect(s).not.toMatch(/[+/=]/);
		expect(Array.from(b64urlDecode(s))).toEqual(Array.from(bytes));
	});
	it('보안 키는 64자 16진수만 · 32바이트 · 틀리면 키 값 없이 throw', () => {
		expect(hexKeyBytes(KEY).length).toBe(32);
		expect(() => hexKeyBytes('abc')).toThrow(/64 hex/);
		expect(() => hexKeyBytes('zz' + KEY.slice(2))).toThrow();
	});
	it('iat — KST +09:00 · 초 단위', () => {
		expect(tossIat(new Date('2026-11-19T00:30:15.123Z'))).toBe('2026-11-19T09:30:15+09:00');
		expect(tossIat(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01T00:00:00+09:00');
	});
});

describe('JWE 왕복', () => {
	it('암호화 → 5조각 · 헤더 alg dir / enc A256GCM / iat / nonce · 복호하면 원문', async () => {
		const compact = await jweEncrypt('{"hello":"MYR"}', KEY, { iat: '2026-11-19T09:00:00+09:00', nonce: 'n-1' });
		expect(isJweCompact(compact)).toBe(true);
		expect(compact.split('.')[1]).toBe('');
		expect(jweHeaderOf(compact)).toEqual({ alg: 'dir', enc: 'A256GCM', iat: '2026-11-19T09:00:00+09:00', nonce: 'n-1' });
		expect(await jweDecrypt(compact, KEY)).toBe('{"hello":"MYR"}');
	});
	it('같은 원문도 iv 가 달라 암호문이 다르다 · 기본 iat · nonce 자동', async () => {
		const a = await jweEncrypt('x', KEY);
		expect(a).not.toBe(await jweEncrypt('x', KEY));
		expect(jweHeaderOf(a)?.iat).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
		expect(jweHeaderOf(a)?.nonce).toMatch(/^[0-9a-f-]{36}$/);
	});
	it('다른 키 · 태그 변조 · 헤더 변조 · 모르는 alg 는 복호 실패', async () => {
		const compact = await jweEncrypt('secret', KEY);
		await expect(jweDecrypt(compact, 'f'.repeat(64))).rejects.toThrow();
		const p = compact.split('.');
		p[4] = (p[4][0] === 'A' ? 'B' : 'A') + p[4].slice(1);
		await expect(jweDecrypt(p.join('.'), KEY)).rejects.toThrow();
		const h = compact.split('.');
		h[0] = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'dir', enc: 'A256GCM', iat: 'x', nonce: 'y' })));
		await expect(jweDecrypt(h.join('.'), KEY)).rejects.toThrow();
		const rsa = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RSA-OAEP', enc: 'A256GCM' })));
		await expect(jweDecrypt(`${rsa}..AAAA.AAAA.AAAA`, KEY)).rejects.toThrow(/unsupported/);
	});
	it('JSON 본문은 암호문이 아니다', () => {
		expect(isJweCompact('{"code":"X"}')).toBe(false);
		expect(isJweCompact('')).toBe(false);
		expect(isJweCompact('a.b.c')).toBe(false);
		expect(isJweCompact('eyJh..aXY.Y3Q.dGFn')).toBe(true);
	});
});
