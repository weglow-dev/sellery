import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	REQUEST_FREE_SAMPLE_MESSAGES,
	notFreeMessage,
	parseShippingInput,
	parseStoredShipping,
	quotaLine,
	sampleButton,
	sampleLine,
	samplePayHref,
	type ShippingField
} from '@sellery/db/partner/sample-rules';
import { exclusiveButton, exclusiveFailMessage } from '@sellery/db/partner/exclusive-rules';
import {
	exclusiveEligibility,
	getProductForSeller,
	myExclusiveRequest,
	RATE_LIMIT_MESSAGE,
	rateLimit,
	requestExclusive,
	requestFreeSample,
	requireSeller,
	sellerPath
} from '$lib/server/partner';

/**
 * `/products/[code]` — 상품 상세 + 샘플 섹션 3단계 (docs/inf-console-plan.md §6 `/products/[code]` · 프로토타입 productDetailModal · sampleBuyModal 진입 · reqSample).
 * load: `getProductForSeller(seller.id, code)` — listed 가 아니거나 없는 코드는 404(셸 안 +error). 견적(`quote.mode`)으로 샘플 섹션이 갈린다:
 *   free → 배송지 폼(프리필 `sellers.sample_address`) → `?/requestFree` · buy → [샘플 구매 ₩N] 링크 → `/pay/new?product=<code>`(4단계 결제 화면 · 🥬 사용 선택은 거기서)
 *   · locked → 독점 안내 · active → 진행 중 캠페인 링크.
 * action requestFree: requireSeller → rateLimit → `parseShippingInput(FormData)` → `requestFreeSample` RPC → 성공 `redirect(303, /campaigns/<code>)`.
 *   실패는 `fail(400, { message, field, values, campaignCode })` — 평범한 POST 라 입력값을 `form` 으로 되돌려 다시 그린다(JS 불필요).
 *   ALREADY_ACTIVE 는 그 캠페인 링크, NOT_FREE 는 `notFreeMessage(reason)`(그 사이 한도·등급이 바뀐 경우).
 * action requestExclusive(0025): 독점권 신청 — `requestExclusive(seller.id, product_id)`. 자격 판정은 DB(`seller_exclusive_eligible`)가
 *   하므로 여기서는 등급을 다시 계산하지 않는다. 성공/멱등 모두 303 `?msg=exclusive|exclusiveAlready`(평범한 POST · JS 불필요).
 *   버튼 문구는 `exclusiveButton(eligibility, mine)` — 프로토타입 `ProductDetailModal` 분기 순서 그대로.
 */
export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireSeller(event, { next: `/products/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const found = await getProductForSeller(seller.id, code);
	if (!found) error(404, { message: '상품을 찾을 수 없습니다' });
	const { product, performance } = found;
	const q = product.quote;

	// 독점권 — 오퍼가 걸린 상품만 조회한다(없으면 DB 왕복 2번을 아낀다)
	const hasOffer = product.exclusive_label !== null || product.exclusive_grade !== null;
	const productId = q?.product_id ?? null;
	const [eligibility, mineReq] =
		hasOffer && productId
			? await Promise.all([
					exclusiveEligibility(seller.id, productId),
					myExclusiveRequest(seller.id, productId)
				])
			: [null, null];

	return {
		seller: { name: seller.name, grade: seller.grade },
		balance,
		product: {
			code: product.code ?? code,
			name: product.name,
			description: product.description,
			emoji: product.emoji,
			thumb_url: product.thumb_url,
			image_urls: product.image_urls,
			category: product.category,
			consumer_price: product.consumer_price,
			sale_price: product.sale_price,
			commission_rate: product.commission_rate,
			sample_text: product.sample_text,
			stock: product.stock,
			exclusive_grade: product.exclusive_grade,
			exclusive_label: product.exclusive_label,
			brand: { name: product.brand.name, grade: product.brand.grade, logo_url: product.brand.logo_url, category: product.brand.category }
		},
		performance,
		quote: q,
		button: sampleButton(q),
		line: sampleLine(q),
		quotaText: q && q.mode !== 'unlisted' ? quotaLine(q) : null,
		shipping: parseStoredShipping(seller.sample_address),
		campaignHref: q?.campaign_code ? sellerPath(`/campaigns/${encodeURIComponent(q.campaign_code)}`) : null,
		payHref: q?.mode === 'buy' ? samplePayHref(product.code ?? code) : null,
		exclusive:
			eligibility !== null
				? { button: exclusiveButton(eligibility, mineReq), status: mineReq?.status ?? null }
				: null,
		listPath: sellerPath('/products'),
		campaignsPath: sellerPath('/campaigns'),
		myPath: sellerPath('/my')
	};
};

export const actions: Actions = {
	requestFree: async (event) => {
		const code = event.params.code;
		const r = await requireSeller(event, { next: `/products/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const formData = await event.request.formData();
		const values = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const bad = (message: string, field: ShippingField | 'shipping' | null = null, campaignCode: string | null = null) =>
			fail(400, { message, field, values, campaignCode });

		if (!rateLimit(`sample-free:${r.ctx.user.id}`)) return bad(RATE_LIMIT_MESSAGE);
		const parsed = parseShippingInput(formData);
		if (!parsed.ok) return bad(REQUEST_FREE_SAMPLE_MESSAGES.BAD_SHIPPING, parsed.field);

		const res = await requestFreeSample(r.ctx.seller.id, code, parsed.shipping);
		if (!res.ok) {
			if (res.code === 'BAD_SHIPPING') return bad(REQUEST_FREE_SAMPLE_MESSAGES.BAD_SHIPPING, (res.field as ShippingField | undefined) ?? 'shipping');
			if (res.code === 'ALREADY_ACTIVE') return bad(REQUEST_FREE_SAMPLE_MESSAGES.ALREADY_ACTIVE, null, res.campaignCode ?? null);
			if (res.code === 'NOT_FREE') {
				// 그 사이 등급·한도가 바뀐 경우 — 최신 견적으로 기준 등급·한도를 채워 안내
				const again = await getProductForSeller(r.ctx.seller.id, code);
				const q = again?.product.quote ?? null;
				return bad(notFreeMessage(res.reason ?? q?.reason ?? null, q?.free_grade ?? null, q ? q.quota + q.extra : 0));
			}
			return bad(REQUEST_FREE_SAMPLE_MESSAGES[res.code]);
		}
		redirect(303, `${sellerPath(`/campaigns/${encodeURIComponent(res.campaignCode)}`)}?msg=requested`);
	},

	/** 독점권 신청 — 등급 판정은 DB 가 한다. 상품 id 는 서버에서 code 로 다시 찾는다(클라이언트 값을 믿지 않는다). */
	requestExclusive: async (event) => {
		const code = event.params.code;
		const r = await requireSeller(event, { next: `/products/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const self = sellerPath(`/products/${encodeURIComponent(code)}`);

		if (!rateLimit(`exclusive:${r.ctx.user.id}`)) return fail(400, { message: RATE_LIMIT_MESSAGE, field: null, values: {}, campaignCode: null });

		const found = await getProductForSeller(r.ctx.seller.id, code);
		const productId = found?.product.quote?.product_id ?? null;
		if (!productId) return fail(400, { message: exclusiveFailMessage('NOT_LISTED'), field: null, values: {}, campaignCode: null });

		const res = await requestExclusive(r.ctx.seller.id, productId);
		if (!res.ok) return fail(400, { message: exclusiveFailMessage(res.code), field: null, values: {}, campaignCode: null });
		redirect(303, `${self}?msg=${res.already ? 'exclusiveAlready' : 'exclusive'}`);
	}
};
