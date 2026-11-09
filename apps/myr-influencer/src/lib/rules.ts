/** 콘솔 화면 규칙 — 내 제품 탭 필터 · 상품 에디터 검증과 미리보기 요약(교환 · 환불은 7번 · 0078 에서 lib/claims.ts 로).
 *  디자인(Claude Design "MYR Influencer Admin")의 renderVals 계산을 순수 함수로 옮겼다. $app · $env 를 import 하지 않는다 — src/test/rules.test.ts.
 *
 *  에디터 "예상 정산" 은 정산 정책(docs/myr.md §9-6 · 판매가의 60%)을 `@sellery/myr-core/settlement-rules` 에서 읽는다(2026-11-09 · 디자인 값 10% 폐기).
 *    단순 변심 왕복 배송비는 0078 부터 서버 값(platform_settings 'myr_claim_return_fee' · claim JSON return_fee). */
import { myrCategoryName } from '@sellery/myr-core/categories';
import { settlementOf } from '@sellery/myr-core/settlement-rules';
import { type Product, type ProductDraft, type ProductStatus } from './data';

export const MAX_IMAGES = 6;
export const EDITOR_STEPS = 8;

export const won = (n: number) => '₩' + Number(n || 0).toLocaleString('ko-KR');

/* ---------- 내 제품 ---------- */

export const PRODUCT_STATUS_META: Record<ProductStatus, { label: string; cls: string }> = {
	live: { label: '판매 중', cls: 'bg-mint/16 text-mint' },
	paused: { label: '일시중지', cls: 'bg-white/10 text-white/75' },
	review: { label: '심사 중', cls: 'bg-accent/16 text-accent' },
	rejected: { label: '반려', cls: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' },
	draft: { label: '임시저장', cls: 'bg-white/8 text-white/75' },
	ended: { label: '종료', cls: 'bg-white/6 text-white/45' }
};

/** 탭 — 시안의 판매 중 · 심사 중 · 임시저장 · 종료. 일시중지는 "판매 중"(다시 켤 수 있다), 반려는 "심사 중"(고쳐서 다시 제출)에 함께 둔다(2026-11-05) */
export type ProductTab = 'all' | 'live' | 'review' | 'draft' | 'ended';
export const PRODUCT_TABS: { id: ProductTab; name: string }[] = [
	{ id: 'all', name: '전체' },
	{ id: 'live', name: '판매 중' },
	{ id: 'review', name: '심사 중' },
	{ id: 'draft', name: '임시저장' },
	{ id: 'ended', name: '종료' }
];
const PRODUCT_TAB_STATUSES: Record<Exclude<ProductTab, 'all'>, ProductStatus[]> = {
	live: ['live', 'paused'],
	review: ['review', 'rejected'],
	draft: ['draft'],
	ended: ['ended']
};
/** 수정 심사 중인 판매 중 상품은 "판매 중" 과 "심사 중" 탭에 함께(시안) */
export const filterProducts = (list: Product[], tab: ProductTab) =>
	tab === 'all' ? list : list.filter((p) => PRODUCT_TAB_STATUSES[tab].includes(p.status) || (tab === 'review' && !!p.revision));
/** 재고를 보여줄 상태 — 샵에서 팔리는 중이거나 잠깐 멈춘 것만(나머지는 "—") */
export const showsStock = (s: ProductStatus) => s === 'live' || s === 'paused';
/** 품절 — 판매 중인데 남은 재고 0(샵이 품절로 보여 준다 · 판매 상태는 그대로 · 재고가 들어오면 다시 팔린다 · §9-6) */
export const isSoldOut = (p: { status: ProductStatus; stock: number }) => p.status === 'live' && p.stock <= 0;
export const productTabCounts = (list: Product[]) => PRODUCT_TABS.map((t) => ({ ...t, count: filterProducts(list, t.id).length }));

/* ---------- 상품 등록 에디터 ---------- */

export function blankDraft(): ProductDraft {
	return {
		images: [],
		name: '',
		price: '',
		unit: '',
		cat: null,
		tile: 'lemon',
		chips: ['', '', ''],
		note: '',
		storyTitle: '',
		story: '',
		ingredients: [
			{ name: '', why: '', amount: '' },
			{ name: '', why: '', amount: '' }
		],
		steps: [
			{ title: '', desc: '' },
			{ title: '', desc: '' },
			{ title: '', desc: '' }
		],
		formPack: '',
		shelfLife: '',
		storageMethod: '',
		faq: [
			{ q: '', a: '' },
			{ q: '', a: '' },
			{ q: '', a: '' }
		]
	};
}

const has = (v: string | null | undefined) => !!(v && v.trim());

/** "36,000" · "₩36000" · "36000원" → 36000 */
export const parsePrice = (v: string) => Number(String(v).replace(/\D/g, '')) || 0;
/** 입력 중인 가격 칸 — 숫자만 남기고 천 단위 콤마 */
export const formatPriceInput = (v: string) => {
	const n = parsePrice(v);
	return n ? n.toLocaleString('ko-KR') : '';
};
/** 예상 정산(개당) — 판매가의 60%(§9-6 · 제조금액 상계 전) */
export const marginText = (price: number) => (price ? `${won(settlementOf(price))} / 개` : '—');

export type SectionKey = 'basics' | 'note' | 'story' | 'ingredients' | 'howto' | 'info' | 'faq';

export function filledSections(ed: ProductDraft): Record<SectionKey, boolean> {
	return {
		basics: has(ed.name) && parsePrice(ed.price) > 0 && !!ed.cat,
		note: has(ed.note),
		story: has(ed.storyTitle) && has(ed.story),
		ingredients: ed.ingredients.some((r) => has(r.name)),
		howto: ed.steps.some((s) => has(s.title)),
		info: has(ed.formPack) || has(ed.shelfLife) || has(ed.storageMethod),
		faq: ed.faq.some((f) => has(f.q) && has(f.a))
	};
}

/** 단계별 필수 — 1단계(제품명 · 가격 · 카테고리) · 2단계(레시피 노트)만 필수, 3~7 은 비워도 된다(샵에서 숨김) */
export function stepValid(step: number, ed: ProductDraft): boolean {
	const f = filledSections(ed);
	if (step === 1) return f.basics;
	if (step === 2) return f.note;
	return true;
}

const OPTIONAL_STEP_KEY: Record<number, SectionKey> = { 3: 'story', 4: 'ingredients', 5: 'howto', 6: 'info', 7: 'faq' };

/** 하단 버튼 — 마지막은 "심사 요청하기", 선택 단계가 비어 있으면 "건너뛰기" */
export function nextLabel(step: number, ed: ProductDraft): string {
	if (step >= EDITOR_STEPS) return '심사 요청하기';
	const key = OPTIONAL_STEP_KEY[step];
	if (key && !filledSections(ed)[key]) return '건너뛰기';
	return '다음';
}

/** 에디터 헤더 아래 한 줄 — "제품명 · ₩가격 · 카테고리" (비면 "새 상품 등록") · 카테고리는 MYR 6개(@sellery/myr-core/categories) */
export function editorTrail(ed: ProductDraft): string {
	const price = parsePrice(ed.price);
	return [ed.name.trim(), price ? won(price) : '', myrCategoryName(ed.cat)].filter(Boolean).join('  ·  ') || '새 상품 등록';
}

/** 8단계 미리보기의 섹션 목록 — 비어 있는 섹션은 샵에서 숨긴다 */
export function previewSections(ed: ProductDraft) {
	const f = filledSections(ed);
	const price = parsePrice(ed.price);
	const hidden = '비어 있음 (샵에서 숨김)';
	return [
		{ key: 'basics', name: '구매 패널', step: 1, filled: f.basics, summary: f.basics ? `${ed.name.trim()} · ${won(price)}` : '제품명 · 가격 · 카테고리' },
		{ key: 'note', name: '레시피 노트', step: 2, filled: f.note, summary: has(ed.note) ? ed.note.trim() : '비어 있음' },
		{ key: 'story', name: '01 · 왜 만들었나요', step: 3, filled: f.story, summary: has(ed.storyTitle) ? ed.storyTitle.trim() : hidden },
		{ key: 'ingredients', name: '02 · 성분', step: 4, filled: f.ingredients, summary: f.ingredients ? ed.ingredients.filter((r) => has(r.name)).map((r) => r.name.trim()).join(', ') : hidden },
		{ key: 'howto', name: '03 · 섭취법', step: 5, filled: f.howto, summary: f.howto ? `${ed.steps.filter((s) => has(s.title)).length}스텝` : hidden },
		{ key: 'info', name: '04 · 제품 정보', step: 6, filled: f.info, summary: f.info ? `${[ed.formPack, ed.unit, ed.shelfLife, ed.storageMethod].filter(has).length + 1}개 항목` : hidden },
		{ key: 'faq', name: '05 · FAQ', step: 7, filled: f.faq, summary: f.faq ? `${ed.faq.filter((x) => has(x.q)).length}개 질문` : hidden }
	] satisfies { key: SectionKey; name: string; step: number; filled: boolean; summary: string }[];
}

/** 이미지 도움말 — 장수에 따라 */
export function imageHelp(count: number): string {
	if (count > 1) return '첫 번째가 대표 이미지예요. 사진을 탭하면 대표로 바뀌고, 나머지는 샵에서 옆으로 넘겨볼 수 있어요.';
	if (count === 1) return `사진을 더 올리면 샵에서 옆으로 넘겨볼 수 있어요. (최대 ${MAX_IMAGES}장)`;
	return '정사각형 또는 16:10 이미지를 권장해요. 여러 장 올릴 수 있고, 첫 번째가 대표 이미지예요.';
}

/** 홈 "판매 중 제품" 카드 — 판매 중 수 · 심사 중(반려 · 수정 심사 포함) + 임시저장 수 */
export function homeProductCounts(list: Product[]): { live: number; pending: number } {
	return {
		live: list.filter((p) => p.status === 'live').length,
		pending: list.filter((p) => p.status === 'review' || p.status === 'rejected' || p.status === 'draft' || !!p.revision).length
	};
}
