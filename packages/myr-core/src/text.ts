/** 문자열 정리 — packages/db/src/text.ts 복사(docs/myr.md: 셀러리 코드는 복사만). 배송지·주문자 이름은 발주 CSV·택배사로 흘러가므로 저장 시점에 이모지·비BMP·제어문자를 뺀다. */
const STRIP_RE =
	/[\u{10000}-\u{10FFFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200B}-\u{200F}\u{FEFF}\u{0000}-\u{0008}\u{000B}\u{000C}\u{000E}-\u{001F}\u{007F}-\u{009F}]/gu;

export function cleanText(s: unknown): string {
	if (typeof s !== 'string') return '';
	return s.replace(STRIP_RE, '').replace(/\s+/g, ' ').trim();
}

/** 숫자만 남겨 8~15자리면 그 값, 아니면 null ('010-1234-5678' → '01012345678' · 토스 customerMobilePhone 제약) */
export function normalizePhone(s: unknown): string | null {
	if (typeof s !== 'string') return null;
	const digits = s.replace(/\D/g, '');
	return /^\d{8,15}$/.test(digits) ? digits : null;
}
