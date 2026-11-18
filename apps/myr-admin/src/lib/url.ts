import { goto } from '$app/navigation';

/** 목록 화면의 탭 · 하위 필터 · 열린 서랍은 주소가 가진다(?tab= · ?sub= · ?id=) — 새로고침 · 공유 · 뒤로가기가 그대로 된다.
 *  탭 · 필터는 기록을 쌓지 않고(replace), 서랍을 열 때만 쌓아서 뒤로가기로 닫힌다 */
export function setParams(url: URL, patch: Record<string, string | null>, push = false) {
	const u = new URL(url);
	for (const [k, v] of Object.entries(patch)) {
		if (v) u.searchParams.set(k, v);
		else u.searchParams.delete(k);
	}
	return goto(`${u.pathname}${u.search}`, { replaceState: !push, keepFocus: true, noScroll: true });
}

/** 서랍 닫기 — id 만 지운다(뒤로가기로 닫아도 같은 결과) */
export const closeDrawer = (url: URL) => setParams(url, { id: null });
