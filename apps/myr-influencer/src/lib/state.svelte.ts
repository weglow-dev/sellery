/** 콘솔 클라이언트 상태(목) — CS 요청 · 홈 지표용 목 제품 · 프로필 사진 · 토스트. 상품 저장 · 내 제품은 서버(0071 · 0073)로 옮겼다.
 *  UI 단계라 메모리에만 있다(새로고침하면 시드로 돌아간다). 인증·DB 를 붙이면 목록은 서버 load 로, 변경은 form action/RPC 로 옮긴다.
 *  규칙 계산은 전부 lib/rules.ts(순수 · 테스트됨). 상태 변경은 이 모듈의 메서드로만. */
import { seedCs, seedProducts, type CsRequest, type Product, type Resolution } from './data';
import { resolveCs as applyResolution, approveLabel } from './rules';
import type { CopyKey } from './product-edit';

class ConsoleState {
	cs = $state<CsRequest[]>(seedCs());
	products = $state<Product[]>(seedProducts());
	profilePhoto = $state('');
	toast = $state<string | null>(null);
	/** 방금 심사 요청한 제품명 — 제출 완료 화면이 읽는다 */
	lastSubmitted = $state<string | null>(null);
	/** 방금 제출이 새 상품 심사인지 수정 심사인지 — 완료 화면 문구(product-edit MODE_COPY) */
	lastSubmitMode = $state<CopyKey>('new');
	/** 고객 문의 답변 대기 수(0075) — 첫 값은 콘솔 레이아웃 데이터, CS · 홈 화면이 새로 읽을 때마다 덮는다(뱃지 · 홈 카드). null = 아직 화면이 안 읽음 */
	inqWaiting = $state<number | null>(null);

	/** CS 관리 뱃지 — 교환·환불 대기(목) + 고객 문의 답변 대기. layoutWaiting = 콘솔 레이아웃의 첫 값(page.data.inqWaiting) */
	csBadge(layoutWaiting: unknown): number {
		return this.pending.length + (this.inqWaiting ?? (typeof layoutWaiting === 'number' ? layoutWaiting : 0));
	}

	pending = $derived(this.cs.filter((c) => c.status === 'pending'));

	private toastTimer: ReturnType<typeof setTimeout> | undefined;

	showToast(msg: string) {
		clearTimeout(this.toastTimer);
		this.toast = msg;
		this.toastTimer = setTimeout(() => (this.toast = null), 2400);
	}

	/** CS 승인(progress) · 반려(rejected) — actorName 은 로그인한 크리에이터 활동명(타임라인 "방금 · 이름") */
	resolveCs(id: string, status: 'progress' | 'rejected', resolution: Resolution, actorName: string) {
		const cur = this.cs.find((c) => c.id === id);
		if (!cur) return;
		this.cs = this.cs.map((c) => (c.id === id ? applyResolution(c, status, resolution, actorName) : c));
		this.showToast(status === 'rejected' ? `${cur.no} 반려 처리했어요` : `${cur.no} ${approveLabel(cur, resolution)}했어요`);
	}

	setProfilePhoto(file: File) {
		if (this.profilePhoto) URL.revokeObjectURL(this.profilePhoto);
		this.profilePhoto = URL.createObjectURL(file);
		this.showToast('프로필 사진을 바꿨어요');
	}
}

export const app = new ConsoleState();
