/* ============ 전역 UI 상태: 토스트 · 모달 · 내비게이션 훅 ============ */
export interface Toast { id: number; msg: string }
export const toasts = $state<{ list: Toast[] }>({ list: [] });
let tid = 0;
export function toast(msg: string) {
	const id = ++tid;
	toasts.list.push({ id, msg });
	setTimeout(() => { const i = toasts.list.findIndex((t) => t.id === id); if (i > -1) toasts.list.splice(i, 1); }, 2600);
}

/** 모달은 kind + props 만 들고, 실제 컴포넌트는 @sellery/ui 의 ModalHost 가 kind 별로 렌더한다 */
export type ModalKind =
	| 'schedule' | 'sampleBuy' | 'sellerProfile' | 'invite' | 'product' | 'productDetail' | 'channel' | 'verify'
	| 'cs' | 'csReply' | 'trackOne' | 'verifyStore' | 'orderDone' | 'custRefund' | 'kakao' | 'topSeller' | 'brandGrade' | 'html';
export const modal = $state<{ kind: ModalKind | null; props: Record<string, unknown> }>({ kind: null, props: {} });
export function openModal(kind: ModalKind, props: Record<string, unknown> = {}) { modal.kind = kind; modal.props = props; }
export function closeModal() { modal.kind = null; modal.props = {}; }

/** 라우팅 훅 — 각 앱이 SvelteKit goto 를 등록한다. core 액션은 화면 키만 말한다. */
let navigate: (path: string) => void = (p) => { if (typeof location !== 'undefined') location.hash = p; };
export function setNavigate(fn: (path: string) => void) { navigate = fn; }
export const go = {
	to(path: string) { navigate(path); },
	screen(k: string) { navigate(k === 'home' ? '/' : '/' + k); },
	camp(cid: string) { navigate('/c/' + cid); },
	store(cid: string) { navigate('/s/' + cid); }
};
