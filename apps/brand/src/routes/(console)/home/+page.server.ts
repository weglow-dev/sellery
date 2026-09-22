import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { stockLeftOf } from '@sellery/db/brand/product-rules';
import { storeUrl } from '@sellery/db/campaign';
import { SITE_URL } from '$lib/server/env';
import { brandPath, listBrandCampaigns, listBrandCs, listBrandOrders, listBrandProducts, listBrandRequests, requireBrand } from '$lib/server/brand';

/**
 * 브랜드 콘솔 홈 — 2단계 위젯 (docs/brand-console-plan.md §5 `/brand/home` "승인·처리 대기 · 진행 중·확정 판매 카드 · 상품 현황" · 프로토타입 js/40-brand.js vBrandHome).
 * `requireBrand()` 컨텍스트 + 읽기 3회(`listBrandProducts` · `listBrandRequests` · `listBrandCampaigns`) 로 "지금 할 일"(샘플 요청 · 발송 대기 · 일정 승인(3단계) · 검수 대기/반려 · 재고 소진 · 정산 정보)
 * · 진행 중(LIVE) · 확정(SCHEDULE_CONFIRMED) 캠페인 · 상품 현황 카운트 · 브랜드 카드를 만든다. 4단계: 미발송 주문(`listBrandOrders(unshipped)` totals) · 답변 대기 문의(`listBrandCs(OPEN)`) 할 일. 장부 4 KPI · 등급 카드 · 인플루언서 찾기는 5·6단계.
 * ok 가 아니면 location 으로 redirect(anon → /login · foreign → /login?switch=1 · guest → /apply · suspended → /suspended).
 */
export type HomeTodo = { kind: string; icon: string; title: string; desc: string; href: string; action: string | null; n: number };

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/home' });
	if (!r.ok) redirect(303, r.location);
	const { brand, balance } = r.ctx;

	const [products, requests, campaigns, orders, csOpen] = await Promise.all([listBrandProducts(brand.id), listBrandRequests(brand.id), listBrandCampaigns(brand.id), listBrandOrders(brand.id, 'unshipped'), listBrandCs(brand.id, 'OPEN')]);

	const requestsPath = brandPath('/requests');
	const productsPath = brandPath('/products');
	const campaignsPath = brandPath('/campaigns');
	const settlePath = brandPath('/settle');
	const ordersPath = brandPath('/orders');
	const csPath = brandPath('/cs');
	const nUnshipped = orders.totals.unshipped;
	const nCs = csOpen.length;
	const by = (st: string) => requests.filter((c) => c.status === st).length;
	const nReq = by('SAMPLE_REQUESTED');
	const nShip = by('SAMPLE_APPROVED') + by('SAMPLE_PURCHASED');
	const nSched = by('SCHEDULE_PROPOSED');
	const pc = (st: string) => products.filter((p) => p.status === st).length;
	const soldOut = products.filter((p) => p.status === 'listed' && stockLeftOf(p.stock, p.allocated) === 0);

	const todos: HomeTodo[] = [];
	if (nUnshipped) todos.push({ kind: 'orders_unshipped', icon: '🚚', title: `미발송 주문 ${nUnshipped}건`, desc: '발주서를 내려받고 운송장을 등록하면 고객 주문 화면에 배송 조회가 뜹니다', href: `${ordersPath}?f=unshipped`, action: '발송', n: nUnshipped });
	if (nCs) todos.push({ kind: 'cs_open', icon: '💬', title: `답변 대기 문의 ${nCs}건`, desc: '고객 문의는 브랜드에 바로 옵니다 — 배송·교환·반품은 직접, 결제·정산은 운영팀이 함께', href: `${csPath}?status=OPEN`, action: '답변', n: nCs });
	if (nReq) todos.push({ kind: 'sample_requested', icon: '📨', title: `샘플 요청 검토 ${nReq}건`, desc: '인플루언서 프로필을 보고 승인·거절해주세요 — 보통 24시간 내 응답', href: requestsPath, action: '검토', n: nReq });
	if (nShip) todos.push({ kind: 'sample_ship', icon: '📦', title: `샘플 발송 대기 ${nShip}건`, desc: '택배사·송장번호를 입력하면 인플루언서에게 배송 추적이 전달돼요', href: requestsPath, action: '발송', n: nShip });
	if (nSched) todos.push({ kind: 'schedule_proposed', icon: '📅', title: `일정 승인 대기 ${nSched}건`, desc: '인플루언서가 제안한 판매 기간 · 배정 재고를 확인하고 승인·반려해주세요 — 승인하면 판매가 확정돼요', href: requestsPath, action: '승인', n: nSched });
	if (pc('rejected')) todos.push({ kind: 'product_rejected', icon: '⚠️', title: `반려된 상품 ${pc('rejected')}건`, desc: '반려 사유를 확인하고 수정 후 저장하면 다시 검수를 요청합니다', href: productsPath, action: '수정', n: pc('rejected') });
	if (pc('pending')) todos.push({ kind: 'product_pending', icon: '🔍', title: `검수 대기 상품 ${pc('pending')}건`, desc: '운영팀 검수(영업일 1~2일) 뒤 인플루언서에게 노출돼요', href: productsPath, action: null, n: pc('pending') });
	if (soldOut.length) todos.push({ kind: 'stock_out', icon: '📉', title: `재고 소진 상품 ${soldOut.length}건`, desc: `${soldOut.map((p) => p.name).slice(0, 2).join(' · ')}${soldOut.length > 2 ? ' 외' : ''} — 재고를 늘리거나 노출을 중단해주세요`, href: productsPath, action: '재고', n: soldOut.length });
	if (!products.length) todos.push({ kind: 'first_product', icon: '🛍', title: '첫 상품 등록', desc: '등록한 상품은 운영팀 검수(pending) 뒤 인플루언서에게 공개돼요', href: brandPath('/products/new'), action: '등록', n: 1 });
	if (!brand.has_bank_info) todos.push({ kind: 'bank_info', icon: '🏦', title: '정산 계좌 등록', desc: '계좌 · 사업자번호 · 통신판매업 신고번호 — 판매 종료 D+21 지급 (5단계에서 열립니다)', href: settlePath, action: null, n: 1 });

	const live = campaigns
		.filter((c) => c.status === 'LIVE')
		.map((c) => ({
			code: c.code,
			chip: c.chip,
			start_date: c.start_date,
			end_date: c.end_date,
			qty: c.qty,
			sold_qty: c.sold_qty,
			product: { name: c.product.name, emoji: c.product.emoji, thumb_url: c.product.thumb_url, sale_price: c.product.sale_price, commission_rate: c.product.commission_rate },
			seller: { name: c.seller.name, handle: c.seller.handle, platform: c.seller.platform },
			href: brandPath(`/campaigns/${encodeURIComponent(c.code)}`),
			ordersHref: `${ordersPath}?campaign=${encodeURIComponent(c.code)}`,
			storeUrl: `${SITE_URL}${storeUrl(c.seller.handle, c.code)}`
		}));
	const soon = campaigns
		.filter((c) => c.status === 'SCHEDULE_CONFIRMED')
		.map((c) => ({
			code: c.code,
			start_date: c.start_date,
			end_date: c.end_date,
			qty: c.qty,
			product: { name: c.product.name, emoji: c.product.emoji, thumb_url: c.product.thumb_url },
			seller: { name: c.seller.name, handle: c.seller.handle, platform: c.seller.platform },
			href: brandPath(`/campaigns/${encodeURIComponent(c.code)}`)
		}));
	const clearing = campaigns.filter((c) => c.status === 'CLEARING').length;

	return {
		brand,
		balance,
		todos,
		pending: nReq + nShip + nSched + nUnshipped + nCs,
		unshipped: nUnshipped,
		csOpen: nCs,
		live,
		soon,
		clearing,
		products: { total: products.length, listed: pc('listed'), pending: pc('pending'), paused: pc('paused'), rejected: pc('rejected'), exclusive: products.filter((p) => p.exclusive_grade).length },
		campaignsTotal: campaigns.length,
		requestsPath,
		productsPath,
		newProductPath: brandPath('/products/new'),
		campaignsPath,
		ordersPath,
		csPath,
		liveListPath: `${campaignsPath}?f=live`
	};
};
