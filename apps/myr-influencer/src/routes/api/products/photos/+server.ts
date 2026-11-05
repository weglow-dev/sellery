import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PRODUCT_IMAGE_MAX_BYTES } from '@sellery/myr-core/product-images';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import { apiSeller } from '$lib/server/seller';
import { uploadProductImage } from '$lib/server/seller-products';

/**
 * 상품 이미지 올리기(0073 · 공개 버킷 myr-products) — 에디터에서 사진을 고르는 즉시 1장씩.
 *   POST multipart `file` → { ok, url } · { ok:false, code: BAD_FILE | TOO_LARGE | RATE_LIMITED | DB_ERROR }
 * 크리에이터 폴더(<seller id>/)에만 올린다 · 형식은 매직 바이트로 · 4MB(Vercel 요청 4.5MB 한도). 저장 때 RPC 가 폴더를 다시 본다.
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	if (!rateLimit(`product-photo:${seller.id}`, 60, 10 * 60 * 1000)) return json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
	const fd = await event.request.formData().catch(() => null);
	const file = fd?.get('file');
	if (!(file instanceof File)) return json({ ok: false, code: 'BAD_FILE' }, { status: 400 });
	if (file.size > PRODUCT_IMAGE_MAX_BYTES) return json({ ok: false, code: 'TOO_LARGE' }, { status: 413 });
	const r = await uploadProductImage(seller.id, { bytes: new Uint8Array(await file.arrayBuffer()), size: file.size });
	return json(r, { status: r.ok ? 200 : r.code === 'BAD_FILE' ? 400 : 500 });
};
