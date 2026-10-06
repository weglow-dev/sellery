import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { unlockMessage } from '@sellery/db/brand/gallery-rules';
import { brandPath, getBrandGallery, RATE_LIMIT_MESSAGE, rateLimit, requireBrand, unlockSellerData } from '$lib/server/brand';

/**
 * `/gallery` — 인플루언서 갤러리 · 🥬 데이터 열람 (프로토타입 `(demo)/gallery` · 0035).
 * load: `requireBrand` → `getBrandGallery(brand.id)` RPC 1회 — 맞춤 추천 2명 · 공개 인플루언서 ·
 *   익명 스카우트 + 이번 달 무료 열람 잔여.
 *
 * **잠긴 카드는 서버가 지표를 보내지 않는다**(0035) — 화면에서 가리는 게 아니다. 비공개(익명)
 *   인플루언서는 열람 전 이름·핸들·아바타도 오지 않는다. 파서가 한 번 더 덮는다(`parseGallery`).
 * 무료 열람: 함께 판매한 이력(영구) · 브랜드 등급 다이아·블랙 월 5회(`brand_grade_tiers`).
 * 가격은 인플루언서 등급별(`grade_tiers.data_price_cel` — 스타터·브론즈 1 … 블랙 5).
 *
 * action unlock: `kind`('data'=공개 성과 · 'ref'=익명 레퍼런스) 와 seller id 를 받아 `unlockSellerData`.
 *   성공/무료/멱등 모두 303 `?msg=` 로 돌려 평범한 POST 로 끝낸다(JS 불필요). 실패는 `?err=`.
 *   seller id 는 RPC 가 공개 여부와 `kind` 의 일치를 검사한다 — 익명 카드에서 'data' 를 보내
 *   신원을 캐는 걸 막는다(`KIND_MISMATCH`).
 *
 * 필터(등급·SNS)는 **클라이언트에서** 거른다 — 전체가 100명 이내이고 열람 상태가 섞여 있어
 *   서버 왕복보다 즉시 반응이 낫다(프로토타입도 `S.ui.galGrade` 로 즉시 필터).
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/gallery' });
	if (!r.ok) redirect(303, r.location);
	const { brand, balance } = r.ctx;

	const gallery = await getBrandGallery(brand.id);
	const msg = event.url.searchParams.get('msg');
	const err = event.url.searchParams.get('err');

	return {
		balance,
		gallery,
		failed: gallery === null,
		notice: err ? { tone: 'danger' as const, text: err } : msg ? { tone: 'ok' as const, text: msg } : null,
		productsPath: brandPath('/products'),
		myPath: brandPath('/my')
	};
};

const self = brandPath('/gallery');

export const actions: Actions = {
	unlock: async (event) => {
		const r = await requireBrand(event, { next: '/gallery' });
		if (!r.ok) redirect(303, r.location);
		if (!rateLimit(`gallery-unlock:${r.ctx.user.id}`)) redirect(303, `${self}?err=${encodeURIComponent(RATE_LIMIT_MESSAGE)}`);

		const fd = await event.request.formData();
		const sellerId = fd.get('seller');
		const kindRaw = fd.get('kind');
		const name = typeof fd.get('name') === 'string' ? (fd.get('name') as string) : null;
		if (typeof sellerId !== 'string' || sellerId.length === 0) return fail(400, { message: '인플루언서를 찾을 수 없어요' });
		const kind = kindRaw === 'ref' ? 'ref' : 'data';

		const out = await unlockSellerData(r.ctx.brand.id, sellerId, kind);
		const text = unlockMessage(out, kind, name);
		redirect(303, `${self}?${out.ok ? 'msg' : 'err'}=${encodeURIComponent(text)}`);
	}
};
