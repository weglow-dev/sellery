import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { quotaLine, sampleButton, sampleLine } from '@sellery/db/partner/sample-rules';
import { listProductsForSeller, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * `/products` — 상품 갤러리 3단계 (docs/inf-console-plan.md §6 `/products` · 프로토타입 js/20-seller.js vExplore · prodCard).
 * 읽기: `listProductsForSeller(seller.id)` — listed 상품 + 브랜드 요약 + 상품별 견적(`app_sample_quotes` 1회) + 카테고리 목록.
 * 카드 문구(`sampleLine` · `sampleButton`)는 순수 규칙이라 여기서 만들어 넘긴다 — 화면은 표시만. `?cat=` 은 카테고리 칩(전체 = 없음).
 * 이달 무상 한도(상단 "이번 달 샘플 요청 N회 남음")는 첫 견적의 quota/left — 인플루언서 기준이라 상품마다 같다.
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/products' });
	if (!r.ok) redirect(303, r.location);
	const { seller } = r.ctx;

	const { products, categories } = await listProductsForSeller(seller.id);
	const catParam = event.url.searchParams.get('cat') ?? '';
	const cat = categories.includes(catParam) ? catParam : '전체';

	const cards = products
		.filter((p) => cat === '전체' || p.category === cat)
		.map((p) => ({
			code: p.code,
			name: p.name,
			description: p.description,
			emoji: p.emoji,
			thumb_url: p.thumb_url,
			category: p.category,
			consumer_price: p.consumer_price,
			sale_price: p.sale_price,
			commission_rate: p.commission_rate,
			sample_text: p.sample_text,
			exclusive_label: p.exclusive_label,
			exclusive_grade: p.exclusive_grade,
			boosted: !!p.boosted_at,
			brand: { name: p.brand.name, grade: p.brand.grade, logo_url: p.brand.logo_url },
			line: sampleLine(p.quote),
			button: sampleButton(p.quote),
			href: sellerPath(`/products/${encodeURIComponent(p.code ?? '')}`),
			hasCode: !!p.code
		}));

	const firstQuote = products.find((p) => p.quote && p.quote.mode !== 'unlisted')?.quote ?? null;
	const quota = firstQuote ? { left: firstQuote.left, line: quotaLine(firstQuote) } : null;

	return { seller, cat, categories, cards, total: products.length, quota, listPath: sellerPath('/products') };
};
