import { replaceState } from '$app/navigation';

/**
 * 목록 화면의 보던 탭 · 필터를 주소(?key=값)에 남긴다 — 상세에 들어갔다가 뒤로 오면 그 탭 그대로(2026-11-06 대표 피드백).
 * 값은 실제 주소창(location)에서 읽는다 — 얕은 replaceState 라 page.url 은 처음 들어온 주소에 머문다(cs/+page.svelte 주석 · 2026-11-05).
 * 콘솔은 ssr=false 라 location 을 바로 쓸 수 있다. 기본값은 주소에서 뺀다(/orders · /cs 처럼 깔끔하게).
 */
export function readParam<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
	const v = new URLSearchParams(location.search).get(key);
	return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 값이 바뀌었을 때만 주소를 고친다(같으면 아무것도 안 함 — 첫 렌더에서 라우터를 건드리지 않는다) */
export function syncParam(key: string, value: string, fallback: string): void {
	const q = new URLSearchParams(location.search);
	const want = value === fallback ? null : value;
	if (q.get(key) === want) return;
	if (want === null) q.delete(key);
	else q.set(key, want);
	const s = q.toString();
	replaceState(`${location.pathname}${s ? `?${s}` : ''}`, {});
}
