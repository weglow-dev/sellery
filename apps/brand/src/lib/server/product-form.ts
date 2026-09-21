/**
 * 상품 등록·수정 폼의 서버 공통 — `/products/new` 와 `/products/[code]` 의 `?/save` 가 같은 코드를 쓴다 (docs/brand-console-plan.md §5 `/brand/products/new` `/[code]` · §6 2단계 (a)(b)).
 *   productFormValues(product)      BrandProduct → 폼 프리필 문자열 맵 (ProductForm.svelte 의 values — 총 수수료율은 commissionToTotalRate · 옵션은 optionLines)
 *   saveProductAction(event, code)  multipart 폼 → parseProductInput(순수 검증, 이미지 업로드 전) → 썸네일·상세 이미지 업로드(`uploadProductImage`, 4MB · Vercel 본문 4.5MB) → `upsertBrandProduct`
 *                                   → 성공 303 `/products/<code>?msg=created|saved|rereview` · 실패 `fail(400, { message, field, values, thumb_url, image_urls })` — 입력값을 되돌려 다시 그린다(JS 불필요).
 * 이미지 필드: `thumb_url`(hidden · 기존) + `thumb_file` + `remove_thumb` · `image_urls`(hidden 반복 · 기존) + `remove_images`(체크 · 지울 URL) + `image_files`(multiple) — 합쳐서 4장 이하.
 * 잠긴 상품(가격·요율·옵션 disabled)은 폼이 hidden 으로 원래 값을 함께 보낸다 — 서버 함수가 값이 바뀌었을 때만 LOCKED_FIELD.
 */
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import {
	IMAGE_URLS_MAX,
	PRODUCT_FAIL_MESSAGES,
	PRODUCT_FIELD_MESSAGES,
	commissionToTotalRate,
	optionLines,
	parseProductInput,
	productFailMessage,
	type ProductField
} from '@sellery/db/brand/product-rules';
import {
	PRODUCT_IMAGE_TYPES,
	RATE_LIMIT_MESSAGE,
	brandPath,
	rateLimit,
	requireBrand,
	upsertBrandProduct,
	uploadProductImage,
	type BrandProduct
} from './brand';

/** 폼 안내·검사 상한 — Vercel 서버리스 본문 4.5MB 가 Storage 한도(10MB)보다 먼저 막는다 (docs/inf-console-plan.md §5.9) */
export const PRODUCT_FORM_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const PRODUCT_FORM_IMAGE_ACCEPT = Object.keys(PRODUCT_IMAGE_TYPES).join(',');

/** 폼 필드 이름 = ProductInput 키(샘플 정책은 평면 `sample_*`) — ProductForm.svelte 의 name 과 1:1 */
export type ProductFormValues = Record<string, string>;

export function productFormValues(p: BrandProduct | null): ProductFormValues {
	if (!p) {
		// 데모 ProductModal 기본값 (소비자가 39,000 · 판매가 29,900 · 총 30% · 재고 1,000 · 샘플 '무상 1개' · 무상 등급 실버)
		return {
			name: '',
			description: '',
			category: '',
			consumer_price: '39000',
			sale_price: '29900',
			total_rate: '30',
			stock: '1000',
			sample_text: '무상 1개',
			sample_free_grade: '실버',
			sample_buy_mode: 'auto',
			sample_fixed_price: '',
			sample_refund: '',
			exclusive_grade: '',
			exclusive_label: '',
			options: ''
		};
	}
	return {
		name: p.name,
		description: p.description ?? '',
		category: p.category,
		consumer_price: String(p.consumer_price),
		sale_price: String(p.sale_price),
		total_rate: String(commissionToTotalRate(p.commission_rate)),
		stock: String(p.stock),
		sample_text: p.sample_text ?? '',
		sample_free_grade: p.sample_free_grade ?? '실버',
		sample_buy_mode: p.sample_buy_mode ?? 'auto',
		sample_fixed_price: p.sample_fixed_price ? String(p.sample_fixed_price) : '',
		sample_refund: p.sample_refund ? 'on' : '',
		exclusive_grade: p.exclusive_grade ?? '',
		exclusive_label: p.exclusive_label ?? '',
		options: optionLines(p.options)
	};
}

export type ProductFormFail = {
	message: string;
	field: ProductField | 'image_files' | null;
	values: ProductFormValues;
	thumb_url: string | null;
	image_urls: string[];
};

const strings = (fd: FormData, k: string): string[] => fd.getAll(k).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
const files = (fd: FormData, k: string): File[] => fd.getAll(k).filter((v): v is File => v instanceof File && v.size > 0);

function badFile(f: File): boolean {
	return !(f.type in PRODUCT_IMAGE_TYPES) || f.size > PRODUCT_FORM_IMAGE_MAX_BYTES;
}

/**
 * `?/save` 본체. `code` 가 null 이면 등록. 반환은 fail() 결과 — 성공은 redirect(303) 로 빠져나간다.
 */
export async function saveProductAction(event: RequestEvent, code: string | null) {
	const self = code === null ? '/products/new' : `/products/${encodeURIComponent(code)}`;
	const r = await requireBrand(event, { next: self });
	if (!r.ok) redirect(303, r.location);
	const { brand, user } = r.ctx;

	const fd = await event.request.formData();
	const values: ProductFormValues = {};
	for (const [k, v] of fd.entries()) if (typeof v === 'string' && !(k in values)) values[k] = v;

	// 기존 이미지(hidden) — 삭제 체크된 것은 뺀다
	const removeThumb = fd.get('remove_thumb') === 'on';
	const existingThumb = removeThumb ? null : (typeof fd.get('thumb_url') === 'string' && (fd.get('thumb_url') as string).trim()) || null;
	const removeImages = new Set(strings(fd, 'remove_images'));
	const existingImages = strings(fd, 'image_urls').filter((u) => !removeImages.has(u));
	const bad = (message: string, field: ProductFormFail['field'] = null) =>
		fail(400, { message, field, values, thumb_url: existingThumb, image_urls: existingImages } satisfies ProductFormFail);

	if (!rateLimit(`product-save:${user.id}`)) return bad(RATE_LIMIT_MESSAGE);

	// 1) 순수 검증 — 이미지를 올리기 전에 (실패해도 고아 객체가 남지 않게)
	const parsed = parseProductInput({ ...values, thumb_url: existingThumb ?? '', image_urls: existingImages });
	if (!parsed.ok) return bad(parsed.message, parsed.field);

	// 2) 파일 검사 — 형식 · 4MB · 장수
	const thumbFile = files(fd, 'thumb_file')[0] ?? null;
	const imageFiles = files(fd, 'image_files');
	if (thumbFile && badFile(thumbFile)) return bad(PRODUCT_FAIL_MESSAGES.BAD_FILE, 'thumb_url');
	if (imageFiles.some(badFile)) return bad(PRODUCT_FAIL_MESSAGES.BAD_FILE, 'image_files');
	if (existingImages.length + imageFiles.length > IMAGE_URLS_MAX) return bad(PRODUCT_FIELD_MESSAGES.image_urls, 'image_files');

	// 3) 업로드
	const input = parsed.input;
	if (thumbFile) {
		const up = await uploadProductImage(brand.id, { bytes: await thumbFile.arrayBuffer(), type: thumbFile.type, size: thumbFile.size });
		if (!up.ok) return bad(PRODUCT_FAIL_MESSAGES[up.code], 'thumb_url');
		input.thumb_url = up.url;
	}
	for (const f of imageFiles) {
		const up = await uploadProductImage(brand.id, { bytes: await f.arrayBuffer(), type: f.type, size: f.size });
		if (!up.ok) return bad(PRODUCT_FAIL_MESSAGES[up.code], 'image_files');
		input.image_urls.push(up.url);
	}

	// 4) 저장
	const res = await upsertBrandProduct(brand.id, code, input);
	if (!res.ok) {
		if (res.code === 'NOT_FOUND') redirect(303, `${brandPath('/products')}?msg=not_found`);
		const field = res.field && res.field in PRODUCT_FIELD_MESSAGES ? (res.field as ProductField) : res.code === 'STOCK_BELOW_ALLOCATED' ? 'stock' : null;
		return bad(productFailMessage(res), field);
	}
	const to = res.code ?? code;
	if (!to) redirect(303, `${brandPath('/products')}?msg=created`);
	redirect(303, `${brandPath(`/products/${encodeURIComponent(to)}`)}?msg=${res.created ? 'created' : res.rereview ? 'rereview' : res.status === 'pending' ? 'pending_saved' : 'saved'}`);
}
