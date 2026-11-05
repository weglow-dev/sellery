/**
 * 상품 에디터 입력값(ProductDraft) ↔ 저장 본문(0073 `myr_app_seller_save_product` payload · `@sellery/myr-core/seller-products`).
 * 저장 실패 코드 → 문구 · 돌아갈 단계 · 내 제품에서 상품을 눌렀을 때의 메뉴. 순수 — src/test/product-draft.test.ts.
 * 서버(0073)가 길이 · 필수 · 이미지 폴더를 다시 본다 — 여기는 모양만 맞춘다.
 */
import type { SellerProductDetail, SellerProductPayload, SetStatusAction } from '@sellery/myr-core/seller-products';
import { TILE_BG, TILE_ICON, TILE_KEYS, type ProductDraft, type ProductStatus, type TileKey } from './data';
import { blankDraft, formatPriceInput, parsePrice } from './rules';

const t = (v: string | null | undefined) => (v ?? '').trim();

/** "액상 / 스틱포" → 제형 · 포장 */
export function splitFormPack(v: string): { form: string; pack: string } {
	const [form = '', ...rest] = (v ?? '').split('/');
	return { form: form.trim(), pack: rest.join('/').trim() };
}
export const joinFormPack = (form: string, pack: string) => [t(form), t(pack)].filter(Boolean).join(' / ');

/** 업로드가 끝난 이미지만(브라우저 미리보기 blob: 은 저장하지 않는다) */
export const savedImages = (images: string[]) => images.filter((u) => /^https?:\/\//.test(u));

export function draftToPayload(ed: ProductDraft): SellerProductPayload {
	const { form, pack } = splitFormPack(ed.formPack);
	return {
		name: t(ed.name),
		price: parsePrice(ed.price),
		unit: t(ed.unit),
		category: ed.cat,
		tile: TILE_BG[ed.tile],
		icon: TILE_ICON[ed.tile],
		image_urls: savedImages(ed.images),
		chips: ed.chips.map(t),
		note: t(ed.note),
		story_title: t(ed.storyTitle),
		story: t(ed.story),
		ingredient_rows: ed.ingredients.map((r) => ({ name: t(r.name), why: t(r.why), amount: t(r.amount) })),
		howto_steps: ed.steps.map((s) => ({ t: t(s.title), d: t(s.desc) })),
		faq: ed.faq.map((f) => ({ q: t(f.q), a: t(f.a) })),
		form,
		pack,
		shelf_life: t(ed.shelfLife),
		storage_method: t(ed.storageMethod)
	};
}

/** DB 의 타일(그라데이션) → 에디터 색 키. 모르는 값이면 아이콘으로, 그래도 없으면 기본 */
export function tileKeyOf(tile: string | null, icon: string): TileKey {
	return TILE_KEYS.find((k) => TILE_BG[k] === tile) ?? TILE_KEYS.find((k) => TILE_ICON[k] === icon) ?? 'lemon';
}

const pad = <T>(list: T[], min: number, blank: () => T): T[] => [...list, ...Array.from({ length: Math.max(0, min - list.length) }, blank)];

export function detailToDraft(d: SellerProductDetail): ProductDraft {
	const b = blankDraft();
	return {
		...b,
		images: d.image_urls,
		name: d.name,
		price: d.price ? formatPriceInput(String(d.price)) : '',
		unit: d.unit,
		cat: d.category,
		tile: tileKeyOf(d.tile, d.icon),
		chips: pad(d.chips.slice(0, 3), 3, () => ''),
		note: d.note,
		storyTitle: d.story_title,
		story: d.story,
		ingredients: pad(d.ingredient_rows, b.ingredients.length, () => ({ name: '', why: '', amount: '' })),
		steps: pad(d.howto_steps.map((s) => ({ title: s.t, desc: s.d })), b.steps.length, () => ({ title: '', desc: '' })),
		formPack: joinFormPack(d.form, d.pack),
		shelfLife: d.shelf_life,
		storageMethod: d.storage_method,
		faq: pad(d.faq, b.faq.length, () => ({ q: '', a: '' }))
	};
}

/** 저장 실패 → 안내 · 돌아갈 단계(있으면) */
export function saveFailure(code: string, field?: string | null): { message: string; step?: number } {
	if (code === 'INVALID_INPUT') {
		switch (field) {
			case 'name':
				return { message: '제품명을 입력해주세요', step: 1 };
			case 'price':
				return { message: '판매가를 입력해주세요', step: 1 };
			case 'category':
				return { message: '카테고리를 골라주세요', step: 1 };
			case 'images':
				return { message: '이미지는 6장까지 올릴 수 있어요', step: 1 };
			case 'note':
				return { message: '레시피 노트를 써주세요', step: 2 };
			default:
				return { message: '입력한 내용을 다시 확인해주세요' };
		}
	}
	if (code === 'BAD_IMAGE') return { message: '이미지를 다시 올려주세요', step: 1 };
	if (code === 'NOT_EDITABLE') return { message: '심사 중이거나 판매 중인 상품은 여기서 고칠 수 없어요' };
	if (code === 'NOT_FOUND') return { message: '상품을 찾을 수 없어요' };
	return { message: '저장하지 못했어요. 잠시 후 다시 시도해주세요' };
}

/** 에디터로 바로 고치는 상태(4-1) — 임시저장 · 반려 */
export const isEditableStatus = (s: ProductStatus) => s === 'draft' || s === 'rejected';
/** 수정 심사로 고치는 상태(4-2) — 판매 중 · 일시중지(샵은 승인 전까지 지금 내용) */
export const isRevisableStatus = (s: ProductStatus) => s === 'live' || s === 'paused';

export type ProductMenuItem = { kind: 'edit' | SetStatusAction; label: string; danger?: boolean; confirm?: string };

/** 내 제품에서 상품을 눌렀을 때 메뉴 — 비면 메뉴 없이 안내만. 판매 중 · 일시중지는 "내용 수정"(수정 심사) — 수정 심사 중이면 빠진다 */
export function productMenu(s: ProductStatus, revisionPending = false): ProductMenuItem[] {
	const revise: ProductMenuItem[] = revisionPending ? [] : [{ kind: 'edit', label: '내용 수정' }];
	const end: ProductMenuItem = { kind: 'end', label: '판매 종료', danger: true, confirm: '판매를 종료하면 샵에서 내려가고 다시 열 수 없어요. 종료할까요?' };
	switch (s) {
		case 'draft':
			return [{ kind: 'edit', label: '이어서 작성' }, { kind: 'delete', label: '삭제', danger: true, confirm: '임시저장한 내용을 지울까요?' }];
		case 'rejected':
			return [{ kind: 'edit', label: '고쳐서 다시 심사 요청' }];
		case 'live':
			return [...revise, { kind: 'pause', label: '일시중지' }, end];
		case 'paused':
			return [...revise, { kind: 'resume', label: '다시 판매' }, end];
		default:
			return [];
	}
}

export const STATUS_ACTION_DONE: Record<SetStatusAction, string> = {
	pause: '일시중지했어요 · 샵에서 잠시 내려갔어요',
	resume: '다시 판매를 시작했어요',
	end: '판매를 종료했어요',
	delete: '임시저장을 지웠어요'
};
