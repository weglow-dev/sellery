/** 문자열 정리 — packages/db/src/text.ts 복사(docs/myr.md: 셀러리 코드는 복사만). 배송지·주문자 이름은 발주 CSV·택배사로 흘러가므로 저장 시점에 이모지·비BMP·제어문자를 뺀다. */
const STRIP_RE =
	/[\u{10000}-\u{10FFFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200B}-\u{200F}\u{FEFF}\u{0000}-\u{0008}\u{000B}\u{000C}\u{000E}-\u{001F}\u{007F}-\u{009F}]/gu;

export function cleanText(s: unknown): string {
	if (typeof s !== 'string') return '';
	return s.replace(STRIP_RE, '').replace(/\s+/g, ' ').trim();
}

/** 여러 줄 글(고객 문의 본문 · 교환·환불 상세 · 고객에게 보낼 메시지) — 줄바꿈 · 이모지는 그대로 두고 제어문자만 뺀다.
 *  CRLF → LF · 빈 줄 3개 이상 → 2개 · 앞뒤 공백. 0063 `myr_cs_normalize_body` 와 같은 결과. 이름 · 주소처럼 한 줄로 흘러가는 값은 cleanText */
export function cleanMultiline(s: unknown): string {
	if (typeof s !== 'string') return '';
	return s
		.replace(/\r\n?/g, '\n')
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** 글자 수 — 이모지 하나를 1자로(DB char_length · left() 와 같은 기준). JS length 는 이모지를 2로 센다 */
export const charLength = (s: string): number => [...s].length;
/** 앞에서 max 자까지 — 이모지를 반으로 자르지 않는다(반쪽 이모지는 DB 저장 때 오류가 난다) */
export const sliceChars = (s: string, max: number): string => (charLength(s) > max ? [...s].slice(0, max).join('') : s);

/** 숫자만 남겨 8~15자리면 그 값, 아니면 null ('010-1234-5678' → '01012345678' · 토스 customerMobilePhone 제약) */
export function normalizePhone(s: unknown): string | null {
	if (typeof s !== 'string') return null;
	const digits = s.replace(/\D/g, '');
	return /^\d{8,15}$/.test(digits) ? digits : null;
}
