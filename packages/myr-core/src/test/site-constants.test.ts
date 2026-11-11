// 샵 주소 · 공용 상수 — packages/myr-core/src/{site,constants}.ts
import { describe, expect, it } from 'vitest';
import { QTY_FORMAT_MAX, won } from '../constants';
import { SITE_URL_FALLBACK, siteOrigin } from '../site';

describe('siteOrigin — 메일 링크 · canonical 이 같은 오리진', () => {
	it('주소 값에서 오리진만 · 끝 슬래시 없이', () => {
		expect(siteOrigin('https://shop.example.com/')).toBe('https://shop.example.com');
		expect(siteOrigin(' https://shop.example.com/a/b?x=1 ')).toBe('https://shop.example.com');
		expect(siteOrigin('http://localhost:5178')).toBe('http://localhost:5178');
	});
	it('비었거나 URL 이 아니거나 http(s) 가 아니면 기본값', () => {
		for (const v of [undefined, null, '', '  ', 'nope', 'ftp://x.com', 1]) expect(siteOrigin(v)).toBe(SITE_URL_FALLBACK);
	});
});

describe('constants', () => {
	it('QTY_FORMAT_MAX 는 RPC 숫자 형식 범위(999,999)와 같다 — 구매 수량 상한은 없다(0095)', () => expect(QTY_FORMAT_MAX).toBe(999999));
	it('won — 원화 표시', () => {
		expect(won(32000)).toBe('₩32,000');
		expect(won(0)).toBe('₩0');
	});
});
