/** 지급 건 동작 모달을 여는 곳 — 홈 · 지급 목록 · 지급 서랍 어디서든 같은 모달(레이아웃의 PayoutModals 하나).
 *  [다시 보내기]는 토스 바로지급 접수 시간(영업일 08:00~15:00) 밖이면 모달 없이 서버 문구만 보여 준다 */
import { server } from './mock/server.svelte';
import type { PayoutAction } from './mock/types';
import { app } from './state.svelte';

class PayModal {
	open = $state<{ action: PayoutAction | 'download'; ids: string[] } | null>(null);
	show(action: PayoutAction | 'download', ids: string[] = []) {
		if (action === 'resend' && server.resendClosed) return app.showToast(server.resendClosed, 'error');
		this.open = { action, ids };
	}
	close() {
		this.open = null;
	}
}

export const payModal = new PayModal();
