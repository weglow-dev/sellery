// 휴대폰 번호 — packages/myr-core/src/phone.ts
import { describe, expect, it } from 'vitest';
import { PHONE_RE, caretAfterFormat, formatPhone, phoneDigits } from '../phone';

describe('formatPhone', () => {
	it('숫자만 · 최대 11자리 · 3-4-4 / 3-3-4 / 입력 중', () => {
		expect(formatPhone('01012345678')).toBe('010-1234-5678');
		expect(formatPhone('0111234567')).toBe('011-123-4567');
		expect(formatPhone('010 1234-56789999')).toBe('010-1234-5678');
		expect(formatPhone('01')).toBe('01');
		expect(formatPhone('0101')).toBe('010-1');
		expect(formatPhone('abc')).toBe('');
	});
	it('PHONE_RE — 완성된 번호만', () => {
		expect(PHONE_RE.test('010-1234-5678')).toBe(true);
		expect(PHONE_RE.test('011-123-4567')).toBe(true);
		expect(PHONE_RE.test('010-1234-567')).toBe(false);
		expect(PHONE_RE.test('020-1234-5678')).toBe(false);
	});
	it('phoneDigits', () => expect(phoneDigits('010-1234-5678')).toBe('01012345678'));
});

describe('caretAfterFormat — 가운데를 고쳐도 커서가 맨 뒤로 튀지 않는다', () => {
	it('가운데에 숫자를 끼워 넣으면 그 숫자 바로 뒤', () => {
		// '010-123-5678' 의 '3' 뒤에 4 를 친 직후 칸 값은 '010-1234-5678'(아직 재배열 전 모양과 같음) · 커서는 '4' 뒤(8)
		const typed = '010-1234-5678';
		expect(caretAfterFormat(typed, 8, formatPhone(typed))).toBe(8);
		// 하이픈 자리가 바뀌는 경우 — '010-123-4567' 끝에서 8 을 치면 '010-1234-5678' 로 재배열 · 커서는 끝
		const grown = '010-123-45678';
		expect(caretAfterFormat(grown, grown.length, formatPhone(grown))).toBe('010-1234-5678'.length);
	});
	it('하이픈 바로 뒤에서 숫자를 지우면 같은 숫자 위치로', () => {
		const typed = '010-234-5678'; // '010-1234-5678' 에서 1 을 지운 상태, 커서 4
		const next = formatPhone(typed);
		expect(next).toBe('010-234-5678');
		expect(caretAfterFormat(typed, 4, next)).toBe(3);
	});
	it('커서가 맨 앞이면 0 · 맨 뒤면 끝', () => {
		expect(caretAfterFormat('010', 0, '010')).toBe(0);
		expect(caretAfterFormat('0101234', 7, formatPhone('0101234'))).toBe('010-1234'.length);
	});
});
