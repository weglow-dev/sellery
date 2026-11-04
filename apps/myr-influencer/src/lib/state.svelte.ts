/** 콘솔 클라이언트 상태(목) — CS 요청 · 내 제품 · 프로필 사진 · 추가 카테고리 · 토스트.
 *  UI 단계라 메모리에만 있다(새로고침하면 시드로 돌아간다). 인증·DB 를 붙이면 목록은 서버 load 로, 변경은 form action/RPC 로 옮긴다.
 *  규칙 계산은 전부 lib/rules.ts(순수 · 테스트됨). 상태 변경은 이 모듈의 메서드로만. */
import { BASE_CATEGORIES, seedCs, seedProducts, type Category, type CsRequest, type Product, type ProductDraft, type Resolution } from './data';
import { parsePrice, resolveCs as applyResolution, approveLabel } from './rules';

class ConsoleState {
	cs = $state<CsRequest[]>(seedCs());
	products = $state<Product[]>(seedProducts());
	profilePhoto = $state('');
	customCats = $state<Category[]>([]);
	toast = $state<string | null>(null);
	/** 방금 심사 요청한 제품명 — 제출 완료 화면이 읽는다 */
	lastSubmitted = $state<string | null>(null);

	pending = $derived(this.cs.filter((c) => c.status === 'pending'));
	liveCount = $derived(this.products.filter((p) => p.status === 'live').length);
	/** 홈 카드 "N개 심사 · 임시저장" */
	draftCount = $derived(this.products.filter((p) => p.status === 'review' || p.status === 'draft').length);
	categories = $derived([...BASE_CATEGORIES, ...this.customCats]);

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

	/** 카테고리 추가 — 같은 이름이 있으면 그걸 고른다. 고른(또는 만든) id 를 돌려준다 */
	addCategory(raw: string): string | null {
		const name = raw.trim();
		if (!name) return null;
		const exists = this.categories.find((c) => c.name === name);
		if (exists) {
			this.showToast(`'${name}' 선택했어요`);
			return exists.id;
		}
		const id = `c${Date.now()}`;
		this.customCats = [...this.customCats, { id, name }];
		this.showToast(`'${name}' 카테고리를 등록했어요`);
		return id;
	}

	/** 임시저장 — 처음이면 새 행, 이어 쓰던 초안이면 그 행을 덮어쓴다. 저장한 행 id 를 돌려준다(제품명이 비면 null) */
	saveDraft(ed: ProductDraft, draftId: string | null): string | null {
		const name = ed.name.trim();
		if (!name) {
			this.showToast('제품명을 입력하면 임시저장할 수 있어요');
			return null;
		}
		const id = draftId ?? `d${Date.now()}`;
		const row: Product = { id, name, price: parsePrice(ed.price), stock: 0, status: 'draft', tile: ed.tile, thumbUrl: ed.images[0] ?? null, sold: 0, meta: '방금 저장', draft: $state.snapshot(ed) };
		this.products = draftId && this.products.some((p) => p.id === draftId) ? this.products.map((p) => (p.id === draftId ? row : p)) : [row, ...this.products];
		this.showToast('임시저장했어요');
		return id;
	}

	/** 심사 요청 — 상태 review(운영팀 검수 대기)로 맨 위에. 이어 쓰던 초안 행은 지운다 */
	submitProduct(ed: ProductDraft, draftId: string | null) {
		const name = ed.name.trim();
		const row: Product = { id: `new${Date.now()}`, name, price: parsePrice(ed.price), stock: 0, status: 'review', tile: ed.tile, thumbUrl: ed.images[0] ?? null, sold: 0, meta: '방금 제출' };
		this.products = [row, ...this.products.filter((p) => p.id !== draftId)];
		this.lastSubmitted = name;
	}
}

export const app = new ConsoleState();
