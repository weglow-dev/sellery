/**
 * 토스트 버스 — web/src/components/toast.tsx 의 이식 (계약 docs/app-plan.md §10.0 `showToast(msg)`).
 * 모듈 수준 `$state` 목록 — **이벤트 핸들러·onMount 에서만** mutate 한다(docs/monorepo-migration.md §8.3 runes 위험).
 * 서버에서는 `showToast` 가 아무것도 하지 않는다(목록은 항상 비어 있다). <ToastHost/> 가 레이아웃에 1개 — 하단 중앙 2.6초.
 */

export type ToastItem = { id: number; msg: string };

export const DURATION_MS = 2600;

export const toasts = $state<{ list: ToastItem[] }>({ list: [] });

let seq = 0;

export function showToast(msg: string): void {
	if (typeof window === 'undefined' || typeof msg !== 'string' || !msg) return;
	const id = ++seq;
	toasts.list.push({ id, msg });
	window.setTimeout(() => {
		const i = toasts.list.findIndex((t) => t.id === id);
		if (i >= 0) toasts.list.splice(i, 1);
	}, DURATION_MS);
}
