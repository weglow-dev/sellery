/**
 * 크리에이터 "내 제품" 행(순수) — 0071 `myr_app_seller_products` 응답 모양과 방어적 파서. DB·환경 없음 · src/test/seller-products.test.ts.
 * 콘솔(apps/myr-influencer)이 화면 모양으로 바꾸고(lib/product-row.ts), 이후 운영 콘솔(크리에이터 상세)도 같은 행을 쓴다.
 */

/** 0071 상태 — draft 임시저장 · pending 심사 중 · listed 판매 중 · paused 일시중지 · rejected 반려 · ended 판매 종료 */
export const SELLER_PRODUCT_STATUSES = ['draft', 'pending', 'listed', 'paused', 'rejected', 'ended'] as const;
export type SellerProductStatus = (typeof SELLER_PRODUCT_STATUSES)[number];
export const isSellerProductStatus = (v: unknown): v is SellerProductStatus => SELLER_PRODUCT_STATUSES.includes(v as SellerProductStatus);

export type SellerProductRow = {
	id: string;
	code: string;
	name: string;
	status: SellerProductStatus;
	rejectReason: string | null;
	category: string;
	price: number;
	optionCount: number;
	stock: number;
	soldQty: number;
	/** 남은 재고 = 입고 − 판매(0 아래면 0) — 읽기 전용 */
	stockLeft: number;
	/** 타일 배경(CSS gradient) · 제형 아이콘 id · 제품 사진 — 샵과 같은 비주얼 */
	tile: string | null;
	icon: string;
	thumbUrl: string | null;
	submittedAt: string | null;
	reviewedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/** RPC 응답(jsonb 배열) → 행. 모양이 어긋난 행(id · 상태 없음)은 버린다 */
export function parseSellerProductRows(data: unknown): SellerProductRow[] {
	if (!Array.isArray(data)) return [];
	const out: SellerProductRow[] = [];
	for (const r of data as Record<string, unknown>[]) {
		if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !isSellerProductStatus(r.status)) continue;
		out.push({
			id: r.id,
			code: str(r.code),
			name: str(r.name),
			status: r.status,
			rejectReason: strOrNull(r.reject_reason),
			category: str(r.category),
			price: int(r.price),
			optionCount: int(r.option_count),
			stock: int(r.stock),
			soldQty: int(r.sold_qty),
			stockLeft: int(r.stock_left),
			tile: strOrNull(r.tile),
			icon: str(r.icon, 'pill') || 'pill',
			thumbUrl: strOrNull(r.thumb_url),
			submittedAt: strOrNull(r.submitted_at),
			reviewedAt: strOrNull(r.reviewed_at),
			createdAt: str(r.created_at),
			updatedAt: str(r.updated_at)
		});
	}
	return out;
}

/* ---------------- 상품 등록 저장(0073 · 4-1) ---------------- */

/** 저장 요청 본문 — 0073 myr_app_seller_save_product p_payload 와 같은 키 */
export type SellerProductPayload = {
	name: string;
	price: number;
	unit: string;
	category: string | null;
	tile: string | null;
	icon: string;
	image_urls: string[];
	chips: string[];
	note: string;
	story_title: string;
	story: string;
	ingredient_rows: { name: string; why: string; amount: string }[];
	howto_steps: { t: string; d: string }[];
	faq: { q: string; a: string }[];
	form: string;
	pack: string;
	shelf_life: string;
	storage_method: string;
};

/** 에디터로 다시 여는 상품 1건(0073 myr_app_seller_product) */
export type SellerProductDetail = SellerProductPayload & { id: string; code: string; status: SellerProductStatus; rejectReason: string | null };

const arrOf = <T>(v: unknown, f: (x: Record<string, unknown>) => T): T[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => f(x as Record<string, unknown>)) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function parseSellerProductDetail(v: unknown): SellerProductDetail | null {
	const r = v as Record<string, unknown> | null;
	if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !isSellerProductStatus(r.status)) return null;
	return {
		id: r.id,
		code: str(r.code),
		status: r.status,
		rejectReason: strOrNull(r.reject_reason),
		name: str(r.name),
		price: int(r.price),
		unit: str(r.unit),
		category: strOrNull(r.category),
		tile: strOrNull(r.tile),
		icon: str(r.icon, 'pill') || 'pill',
		image_urls: strs(r.image_urls),
		chips: strs(r.chips),
		note: str(r.note),
		story_title: str(r.story_title),
		story: str(r.story),
		ingredient_rows: arrOf(r.ingredient_rows, (x) => ({ name: str(x.name), why: str(x.why), amount: str(x.amount) })),
		howto_steps: arrOf(r.howto_steps, (x) => ({ t: str(x.t), d: str(x.d) })),
		faq: arrOf(r.faq, (x) => ({ q: str(x.q), a: str(x.a) })),
		form: str(r.form),
		pack: str(r.pack),
		shelf_life: str(r.shelf_life),
		storage_method: str(r.storage_method)
	};
}

/** 저장 · 상태 바꾸기 거절 코드(0073) */
export type SaveProductCode = 'NOT_FOUND' | 'NOT_EDITABLE' | 'INVALID_INPUT' | 'BAD_IMAGE' | 'DB_ERROR';
export type SetStatusAction = 'pause' | 'resume' | 'end' | 'delete';
export const SET_STATUS_ACTIONS: readonly SetStatusAction[] = ['pause', 'resume', 'end', 'delete'];
export const isSetStatusAction = (v: unknown): v is SetStatusAction => SET_STATUS_ACTIONS.includes(v as SetStatusAction);
