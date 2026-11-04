/**
 * SEO 규칙 — 사이트 주소 · 제목 · 설명 · 색인 제외 경로 · 구조화 데이터(JSON-LD) · robots.txt · sitemap.xml.
 * `$env` · `$app` 을 import 하지 않는 순수 모듈 — `src/test/seo.test.ts`. 화면은 `lib/components/Seo.svelte`, 라우트는 `routes/{robots.txt,sitemap.xml}`.
 *
 * 사이트 오리진은 `PUBLIC_SITE_URL`(도메인이 정해지면 값만 교체) · 없으면 `SITE_URL_FALLBACK`. 메일 링크(`@sellery/myr-core` server/mail)도 같은 함수(`@sellery/myr-core/site`)를 쓴다.
 * canonical · og:url · sitemap 은 전부 이 오리진 기준 — 요청 호스트(`*.vercel.app` 프리뷰 등)를 그대로 쓰면 같은 페이지가 주소 여러 개로 색인된다.
 */
import { siteOrigin } from '@sellery/myr-core/site';
import { CATS, catName, handleSlug, type Creator, type Product } from './data';

/** 사이트 오리진 — 메일 링크와 같은 함수(공용 패키지). 여기서 다시 내보내 화면·라우트가 seo 한 곳에서 가져간다 */
export { SITE_URL_FALLBACK, siteOrigin } from '@sellery/myr-core/site';

export const SITE_NAME = 'MYR Shop';
export const BRAND_NAME = 'Make Your Recipe';
export const DEFAULT_TITLE = 'MYR Shop — 내가 믿는 사람이 직접 만든 웰니스';
export const DEFAULT_DESCRIPTION =
	'인플루언서가 성분부터 맛·패키지까지 직접 고른 다이어트 · 이너뷰티 · 웰니스 제품만 모았어요. 만든 사람이 보이는 레시피 샵, Make Your Recipe.';
/** static/og.png — 1200×630. 제품 사진이 없는 페이지의 공유 미리보기 */
export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;

/**
 * 색인하지 않는 경로 — 개인화 · 결제 · 인증 · 주문 · 문의 · API. hooks 가 `X-Robots-Tag: noindex` 를 붙이고, robots.txt 가 수집을 막는다.
 * 접두 일치(`/orders` 는 `/orders/lookup` · `/orders/g/…` 포함).
 */
export const NOINDEX_PREFIXES = ['/api', '/auth', '/login', '/cart', '/checkout', '/my', '/orders', '/cs'] as const;

export function isNoindexPath(pathname: string): boolean {
	return NOINDEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** 경로(쿼리 포함 가능) 또는 절대 URL → 절대 URL. 이미 http(s) 면 그대로 */
export function absUrl(origin: string, pathOrUrl: string): string {
	if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
	return `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/** 페이지 제목 — 홈은 기본 제목 그대로, 나머지는 "제목 — MYR Shop" */
export const pageTitle = (title?: string | null): string => (title && title.trim() ? `${title.trim()} — ${SITE_NAME}` : DEFAULT_TITLE);

/** 메타 설명용 — 공백 정리 후 n자(기본 150)로 자르고 말줄임 */
export function clip(text: string, n = 150): string {
	const t = text.replace(/\s+/g, ' ').trim();
	return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

/** 상품 메타 설명 — "크리에이터의 제품명 · 제형 · 구성. 레시피 노트(또는 스토리)" */
export function productDescription(p: Product): string {
	const head = [`${p.creator.name}의 ${p.name}`, p.form, p.unit].filter(Boolean).join(' · ');
	const body = p.note || p.story || p.howto;
	return clip(body ? `${head}. ${body}` : head);
}

/** 카테고리 · 크리에이터 목록 — 제목과 설명 */
export function categoryMeta(cat: string, creator: Creator | null, count: number): { title: string; description: string } {
	if (creator) {
		return {
			title: `${creator.name}의 레시피`,
			description: clip(`크리에이터 ${creator.name}(${creator.handle}) 님이 직접 만든 제품 ${count}개 — 성분부터 패키지까지 직접 고른 레시피를 MYR Shop 에서 만나보세요.`)
		};
	}
	const name = catName(cat);
	if (cat === 'all') return { title: '전체 레시피', description: clip(`MYR Shop 의 모든 크리에이터 레시피 ${count}개 — 다이어트 · 이너뷰티 · 더마 · 헤어&바디 · 멘탈 · 맨즈 웰니스.`) };
	return { title: name, description: clip(`${name} 카테고리 — 인플루언서가 직접 만든 ${name} 제품 ${count}개를 모았어요.`) };
}

/** 카테고리 페이지의 정식 경로 — 필터가 없으면 `/category`, 있으면 정해진 순서의 쿼리(같은 화면이 주소 하나로) */
export function categoryPath(cat: string, creatorSlug: string | null): string {
	const q = new URLSearchParams();
	if (cat && cat !== 'all') q.set('cat', cat);
	if (creatorSlug) q.set('creator', creatorSlug);
	const s = q.toString();
	return s ? `/category?${s}` : '/category';
}

/** 공유 미리보기 이미지 — 제품 사진이 있으면 그것, 없으면 사이트 기본 */
export function productImage(p: Product, origin: string): string {
	return p.thumbUrl ? absUrl(origin, p.thumbUrl) : absUrl(origin, OG_IMAGE.path);
}

type JsonLd = Record<string, unknown>;

export function websiteJsonLd(origin: string): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE_NAME,
		alternateName: [BRAND_NAME, 'MYR'],
		url: `${origin}/`,
		inLanguage: 'ko-KR'
	};
}

export function organizationJsonLd(origin: string): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: BRAND_NAME,
		alternateName: 'MYR',
		url: `${origin}/`,
		logo: absUrl(origin, '/apple-touch-icon.png')
	};
}

/** 상품 — Google 상품 리치 결과용(이름 · 이미지 · 설명 · 가격 · 재고). 리뷰·평점은 없으므로 넣지 않는다(지어내지 않는다) */
export function productJsonLd(p: Product, origin: string): JsonLd {
	const url = absUrl(origin, `/p/${p.code}`);
	return {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: p.name,
		sku: p.code,
		url,
		image: [productImage(p, origin)],
		description: productDescription(p),
		category: catName(p.cat),
		brand: { '@type': 'Brand', name: p.creator.name },
		offers: {
			'@type': 'Offer',
			url,
			priceCurrency: 'KRW',
			price: p.price,
			availability: p.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
			itemCondition: 'https://schema.org/NewCondition',
			seller: { '@type': 'Organization', name: BRAND_NAME }
		}
	};
}

export function breadcrumbJsonLd(origin: string, items: { name: string; path: string }[]): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absUrl(origin, it.path) }))
	};
}

/** `<script type="application/ld+json">` 안에 넣을 문자열 — `</script>` 로 태그가 끝나지 않게 `<` 를 이스케이프 */
export function jsonLdText(data: JsonLd | JsonLd[]): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function robotsTxt(origin: string): string {
	return ['User-agent: *', 'Allow: /', ...NOINDEX_PREFIXES.map((p) => `Disallow: ${p}`), '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 사이트맵에 넣을 경로 — 홈 · 카테고리(전체 + 각 카테고리) · 크리에이터 목록 · 판매 중인 상품 */
export function sitemapPaths(products: Product[]): string[] {
	const paths = ['/', ...CATS.map((c) => categoryPath(c.id, null))];
	const creators = new Map<string, true>();
	for (const p of products) creators.set(handleSlug(p.creator.handle), true);
	for (const slug of creators.keys()) paths.push(categoryPath('all', slug));
	for (const p of products) paths.push(`/p/${p.code}`);
	return [...new Set(paths)];
}

export function sitemapXml(origin: string, paths: string[]): string {
	const urls = paths.map((p) => `  <url><loc>${xmlEscape(absUrl(origin, p))}</loc></url>`);
	return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}
