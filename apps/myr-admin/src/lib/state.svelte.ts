/** 콘솔 클라이언트 상태 — 토스트 · 모바일 전체 메뉴. 데이터와 판정은 mock/server.svelte.ts(기능 단계에서 RPC) */
class ConsoleState {
	toast = $state<string | null>(null);
	toastTone = $state<'ok' | 'error'>('ok');
	menuOpen = $state(false);

	private timer: ReturnType<typeof setTimeout> | undefined;

	showToast(msg: string, tone: 'ok' | 'error' = 'ok') {
		clearTimeout(this.timer);
		this.toast = msg;
		this.toastTone = tone;
		this.timer = setTimeout(() => (this.toast = null), 2600);
	}
}

export const app = new ConsoleState();
