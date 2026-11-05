/**
 * 크리에이터 "내 제품" 조회(서버 전용 · 0071) — 크리에이터 id 는 호출자가 세션(requireSeller)에서 정해 넘긴다(결정 3 · 폼 값을 받지 않는다).
 * DB 오류는 throw — 화면이 "제품 없음" 으로 잘못 보이지 않게(페이지 500).
 */
import { PRODUCT_IMAGE_BUCKET, PRODUCT_IMAGE_MAX_BYTES, productImagePath } from '../product-images';
import { sniffImageType } from '../refund-rules';
import {
	parseSellerProductDetail,
	parseSellerProductRevision,
	parseSellerProductRows,
	type SaveProductCode,
	type SellerProductDetail,
	type SellerProductPayload,
	type SellerProductRevision,
	type SellerProductRow,
	type SetStatusAction,
	type SubmitRevisionCode
} from '../seller-products';
import { admin } from './admin.server';

export type { SellerProductDetail, SellerProductPayload, SellerProductRevision, SellerProductRow } from '../seller-products';

export async function listSellerProducts(sellerId: string): Promise<SellerProductRow[]> {
	const { data, error } = await admin().rpc('myr_app_seller_products', { p_seller: sellerId });
	if (error) throw new Error(`myr_app_seller_products failed: ${error.message}`);
	return parseSellerProductRows(data);
}

/** 로그인 계정으로 바로 조회(0072) — 콘솔이 크리에이터 게이트와 **동시에** 보내 DB 왕복 대기를 1번 줄인다. 게이트가 통과해야 결과를 쓴다(호출자 책임) */
export async function listSellerProductsOfUser(userId: string): Promise<SellerProductRow[]> {
	const { data, error } = await admin().rpc('myr_app_seller_products_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_products_of_user failed: ${error.message}`);
	return parseSellerProductRows(data);
}

/* ---------------- 상품 등록 저장(0073 · 4-1) — 판정은 전부 RPC 안에 있다 ---------------- */

/** 에디터로 다시 열 상품 1건 + 열린 수정본(0074 · 심사 중 · 반려) — 내 상품이 아니면 null */
export async function getSellerProduct(sellerId: string, productId: string): Promise<{ product: SellerProductDetail; revision: SellerProductRevision | null } | null> {
	const { data, error } = await admin().rpc('myr_app_seller_product', { p_seller: sellerId, p_id: productId });
	if (error) throw new Error(`myr_app_seller_product failed: ${error.message}`);
	const r = data as { ok?: boolean; product?: unknown; revision?: unknown } | null;
	const product = r?.ok ? parseSellerProductDetail(r.product) : null;
	return product ? { product, revision: parseSellerProductRevision(r?.revision) } : null;
}

export type SaveProductResult = { ok: true; id: string; code: string; status: string } | { ok: false; code: SaveProductCode; field?: string; status?: string };

/** 임시저장(submit=false) · 심사 요청(submit=true). id 없으면 새 상품 */
export async function saveSellerProduct(sellerId: string, productId: string | null, payload: SellerProductPayload, submit: boolean): Promise<SaveProductResult> {
	const { data, error } = await admin().rpc('myr_app_seller_save_product', { p_seller: sellerId, p_id: productId, p_payload: payload, p_submit: submit });
	if (error) {
		console.error('[seller-products] save failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = (data ?? {}) as Record<string, unknown>;
	if (r.ok) return { ok: true, id: String(r.id), code: String(r.code), status: String(r.status) };
	return { ok: false, code: (r.code as SaveProductCode) ?? 'DB_ERROR', ...(r.field ? { field: String(r.field) } : {}), ...(r.status ? { status: String(r.status) } : {}) };
}

export type SubmitRevisionResult = { ok: true; revisionId: string } | { ok: false; code: SubmitRevisionCode; field?: string; status?: string };

/** 판매 중 · 일시중지 상품의 수정 심사 요청(0074) — 승인되면 샵에 반영. 대상 · 필수 칸 · 바뀐 게 없음 · 이미지 판정은 RPC 가 정답 */
export async function submitSellerProductRevision(sellerId: string, productId: string, payload: SellerProductPayload): Promise<SubmitRevisionResult> {
	const { data, error } = await admin().rpc('myr_app_seller_submit_revision', { p_seller: sellerId, p_id: productId, p_payload: payload });
	if (error) {
		console.error('[seller-products] submit_revision failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = (data ?? {}) as Record<string, unknown>;
	if (r.ok) return { ok: true, revisionId: String(r.revision_id) };
	return { ok: false, code: (r.code as SubmitRevisionCode) ?? 'DB_ERROR', ...(r.field ? { field: String(r.field) } : {}), ...(r.status ? { status: String(r.status) } : {}) };
}

export type SetStatusResult = { ok: true; status: string } | { ok: false; code: 'NOT_FOUND' | 'BAD_ACTION' | 'WRONG_STATUS' | 'DB_ERROR'; status?: string };

/** 일시중지 · 다시 판매 · 판매 종료 · 임시저장 삭제 */
export async function setSellerProductStatus(sellerId: string, productId: string, action: SetStatusAction): Promise<SetStatusResult> {
	const { data, error } = await admin().rpc('myr_app_seller_set_status', { p_seller: sellerId, p_id: productId, p_action: action });
	if (error) {
		console.error('[seller-products] set_status failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = (data ?? {}) as Record<string, unknown>;
	if (r.ok) return { ok: true, status: String(r.status) };
	return { ok: false, code: (r.code as 'NOT_FOUND' | 'BAD_ACTION' | 'WRONG_STATUS') ?? 'DB_ERROR', ...(r.status ? { status: String(r.status) } : {}) };
}

export type UploadProductImageResult = { ok: true; url: string } | { ok: false; code: 'BAD_FILE' | 'DB_ERROR' };

/** 상품 이미지 1장 — 그 크리에이터 폴더에 올리고 공개 URL. 형식은 매직 바이트로 확인(확장자 · Content-Type 은 믿지 않는다) */
export async function uploadProductImage(sellerId: string, file: { bytes: Uint8Array; size: number }): Promise<UploadProductImageResult> {
	if (file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_BYTES || file.bytes.byteLength !== file.size) return { ok: false, code: 'BAD_FILE' };
	const kind = sniffImageType(file.bytes);
	if (!kind) return { ok: false, code: 'BAD_FILE' };
	const store = admin().storage.from(PRODUCT_IMAGE_BUCKET);
	const path = productImagePath(sellerId, kind.ext);
	const { error } = await store.upload(path, file.bytes, { contentType: kind.type, upsert: false, cacheControl: '31536000' });
	if (error) {
		console.error('[seller-products] image upload failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	return { ok: true, url: store.getPublicUrl(path).data.publicUrl };
}
