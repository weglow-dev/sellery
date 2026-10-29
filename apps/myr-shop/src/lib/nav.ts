import { goto } from '$app/navigation';

/** 앱 안에서 이동한 횟수 — 뒤로가기가 사이트 이탈이 되지 않게. 레이아웃의 afterNavigate 가 올린다. */
let depth = 0;
export const bumpDepth = () => depth++;

/** 헤더의 [뒤로] — 앱 안에서 온 길이 있으면 브라우저 뒤로, 바로 들어온 페이지면 홈으로 */
export function goBack() {
	if (depth > 0) {
		depth--;
		history.back();
	} else {
		goto('/');
	}
}
