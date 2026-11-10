/** 공구 링크 유입 기억(0086) — 순수 모듈(테스트 src/test/groupbuy-link.test.ts).
 *  `/g/<code>` 로 들어오면 쿠키 `myr_gb` 에 { 상품 code: 공구 code } 를 남기고 상품 페이지로 보낸다. 상품 페이지는 이 쿠키로만 공구가를 보여 준다 —
 *  링크로 들어온 고객만 공구가(기본가는 그대로 · §9-6). 홈으로 나갔다 다시 와도 유지되고, 끝난 공구는 서버가 ended 로 알려 준다.
 *  쿠키 값은 서버가 다시 확인하므로(myr_groupbuy_lookup) 고쳐 써도 다른 상품 · 끝난 공구의 가격은 나오지 않는다. */
import { GB_CODE_RE } from '@sellery/myr-core/groupbuy';

export const GB_COOKIE = 'myr_gb';
export const GB_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
/** 기억하는 상품 수 — 넘치면 오래된 것부터 버린다 */
export const GB_COOKIE_MAX = 10;
/** 링크로 막 들어왔다는 표시(값 = 상품 code · 1분) — 상품 페이지 서버 load 가 한 번 읽고 지운다(끝난 공구 토스트를 그때만) */
export const GB_ARRIVED_COOKIE = 'myr_gb_new';
export const GB_ARRIVED_MAX_AGE = 60;
const PRODUCT_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** 쿠키 값 → { 상품 code: 공구 code } · 형식이 틀린 항목은 버린다 */
export function readGbCookie(raw: string | undefined | null): Record<string, string> {
	if (!raw) return {};
	try {
		const v = JSON.parse(raw) as unknown;
		if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
		return Object.fromEntries(
			Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => PRODUCT_RE.test(e[0]) && typeof e[1] === 'string' && GB_CODE_RE.test(e[1]))
		);
	} catch {
		return {};
	}
}

/** 새 유입을 더한 쿠키 값 — 같은 상품이면 바꾸고 맨 뒤로, 많으면 앞에서 자른다 */
export function writeGbCookie(map: Record<string, string>, productCode: string, gbCode: string): string {
	const entries = Object.entries(map).filter(([k]) => k !== productCode);
	entries.push([productCode, gbCode]);
	return JSON.stringify(Object.fromEntries(entries.slice(-GB_COOKIE_MAX)));
}
