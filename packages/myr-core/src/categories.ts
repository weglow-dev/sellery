/**
 * MYR 상품 카테고리 6개 — DB(0056 myr_products.category check)가 정답이고, 콘솔 에디터 · 운영 화면이 이 목록을 쓴다(자유 추가 없음 · 2026-11-05).
 * 샵(apps/myr-shop lib/data.ts CATS)은 아이콘 · "전체" 가 붙은 자기 목록을 쓴다 — 이름은 같게 둔다.
 */
export const MYR_CATEGORIES = [
	{ id: 'diet', name: '다이어트' },
	{ id: 'inner', name: '이너뷰티' },
	{ id: 'derma', name: '더마' },
	{ id: 'hair', name: '헤어 & 바디' },
	{ id: 'mental', name: '멘탈 웰니스' },
	{ id: 'mens', name: '맨즈 웰니스' }
] as const;
export type MyrCategoryId = (typeof MYR_CATEGORIES)[number]['id'];
export const isMyrCategory = (v: unknown): v is MyrCategoryId => MYR_CATEGORIES.some((c) => c.id === v);
export const myrCategoryName = (id: string | null | undefined): string => MYR_CATEGORIES.find((c) => c.id === id)?.name ?? '';
