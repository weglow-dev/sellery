// 크리에이터 표시 — packages/myr-core/src/creator.ts (샵 상품 카드 · 크리에이터 콘솔 공용)
import { describe, expect, it } from 'vitest';
import { creatorStyle, handleSlug } from '../creator';

describe('creatorStyle · handleSlug', () => {
	it('디자인의 네 크리에이터는 디자인 색 · 그 밖은 핸들 해시로 결정적', () => {
		expect(creatorStyle({ name: '민지 루틴', handle: '@minji.routine' })).toEqual({ bg: '#FFB088', initial: '민' });
		expect(creatorStyle({ name: '하루 웰', handle: '@haru.well' })).toEqual({ bg: '#C4B5FD', initial: '하' });
		const x = creatorStyle({ name: 'alice', handle: '@Alice.Kim' });
		expect(x.initial).toBe('A');
		expect(creatorStyle({ name: 'alice', handle: '@alice.kim' }).bg).toBe(x.bg);
	});
	it('활동명이 비면 이니셜 M', () => {
		expect(creatorStyle({ name: '  ', handle: '@x' }).initial).toBe('M');
	});
	it('handleSlug 는 @ 제거 + 소문자', () => {
		expect(handleSlug('@@Minji.Routine')).toBe('minji.routine');
	});
});
