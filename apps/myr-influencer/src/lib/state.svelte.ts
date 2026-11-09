/** 콘솔 클라이언트 상태 — 목 제품(홈 지표 전 시드) · 프로필 사진 · 토스트 · CS 뱃지 수. 상품 저장 · 내 제품(0071 · 0073) · 교환 · 환불(0078)은 서버.
 *  UI 단계라 메모리에만 있다(새로고침하면 시드로 돌아간다). 인증·DB 를 붙이면 목록은 서버 load 로, 변경은 form action/RPC 로 옮긴다.
 *  규칙 계산은 전부 lib/rules.ts(순수 · 테스트됨). 상태 변경은 이 모듈의 메서드로만. */
import { seedProducts, type Product } from './data';
import type { CopyKey } from './product-edit';

class ConsoleState {
	products = $state<Product[]>(seedProducts());
	toast = $state<string | null>(null);
	/** 방금 심사 요청한 제품명 — 제출 완료 화면이 읽는다 */
	lastSubmitted = $state<string | null>(null);
	/** 방금 제출이 새 상품 심사인지 수정 심사인지 — 완료 화면 문구(product-edit MODE_COPY) */
	lastSubmitMode = $state<CopyKey>('new');
	/** 고객 문의 답변 대기 수(0075) — 첫 값은 콘솔 레이아웃 데이터, CS · 홈 화면이 새로 읽을 때마다 덮는다(뱃지 · 홈 카드). null = 아직 화면이 안 읽음 */
	inqWaiting = $state<number | null>(null);

	/** 교환 · 환불 처리 대기 수(0078) — inqWaiting 과 같은 방식(첫 값은 레이아웃, CS · 홈 · 상세가 새로 읽을 때마다 덮는다) */
	claimWaiting = $state<number | null>(null);

	/** CS 관리 뱃지 — 교환 · 환불 처리 대기 + 고객 문의 답변 대기. 인자 = 콘솔 레이아웃의 첫 값(page.data.inqWaiting · claimWaiting) */
	csBadge(layoutInq: unknown, layoutClaim: unknown): number {
		const n = (v: unknown) => (typeof v === 'number' ? v : 0);
		return (this.claimWaiting ?? n(layoutClaim)) + (this.inqWaiting ?? n(layoutInq));
	}

	private toastTimer: ReturnType<typeof setTimeout> | undefined;

	showToast(msg: string) {
		clearTimeout(this.toastTimer);
		this.toast = msg;
		this.toastTimer = setTimeout(() => (this.toast = null), 2400);
	}
}

export const app = new ConsoleState();
