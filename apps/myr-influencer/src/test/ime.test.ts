// 한글 조합 중 판정 — lib/ime.ts
import { describe, expect, it } from 'vitest';
import { isComposing } from '../lib/ime';

describe('isComposing', () => {
	it('조합 중인 input 이벤트만 true', () => {
		expect(isComposing({ isComposing: true } as unknown as Event)).toBe(true);
		expect(isComposing({ isComposing: false } as unknown as Event)).toBe(false);
		expect(isComposing({} as Event)).toBe(false); // compositionend · blur 처럼 속성이 없는 이벤트는 정리한다
	});
});
