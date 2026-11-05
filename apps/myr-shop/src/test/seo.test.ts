// SEO 규칙 — apps/myr-shop/src/lib/seo.ts
import { describe, expect, it } from 'vitest';
import { MOCK_PRODUCTS, type Product } from '../lib/data';
import {
	DEFAULT_TITLE,
	NOINDEX_PREFIXES,
	SITE_URL_FALLBACK,
	absUrl,
	breadcrumbJsonLd,
	categoryMeta,
	categoryPath,
	clip,
	isNoindexPath,
	jsonLdText,
	pageTitle,
	productDescription,
	productImage,
	productJsonLd,
	robotsTxt,
	siteOrigin,
	sitemapPaths,
	sitemapXml
} from '../lib/seo';

const O = 'https://shop.example.com';
const p0 = MOCK_PRODUCTS[0];

describe('siteOrigin · absUrl', () => {
	it('PUBLIC_SITE_URL 이 있으면 오리진만(경로·끝 슬래시 제거)', () => {
		expect(siteOrigin('https://shop.example.com/')).toBe(O);
		expect(siteOrigin('  https://shop.example.com/foo?x=1 ')).toBe(O);
	});
	it('비었거나 URL 이 아니거나 http(s) 가 아니면 기본값', () => {
		for (const v of [undefined, null, '', '   ', 'not a url', 'ftp://x.com', 42]) expect(siteOrigin(v)).toBe(SITE_URL_FALLBACK);
	});
	it('경로는 오리진에 붙이고 절대 URL 은 그대로', () => {
		expect(absUrl(O, '/p/a')).toBe(`${O}/p/a`);
		expect(absUrl(O, 'og.png')).toBe(`${O}/og.png`);
		expect(absUrl(O, 'https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
	});
});

describe('isNoindexPath', () => {
	it('개인화·결제·주문·문의·로그인·API 는 접두 일치로 제외', () => {
		for (const p of ['/cart', '/checkout', '/checkout/success', '/my', '/orders/lookup', '/orders/g/o1001', '/cs/cs1001', '/login', '/auth/callback', '/api/health']) {
			expect(isNoindexPath(p), p).toBe(true);
		}
	});
	it('공개 페이지와 이름만 비슷한 경로는 색인', () => {
		for (const p of ['/', '/category', '/p/minji-grape-jelly', '/robots.txt', '/sitemap.xml', '/mybox', '/cartoon']) expect(isNoindexPath(p), p).toBe(false);
	});
});

describe('제목 · 설명', () => {
	it('pageTitle — 비면 기본 제목, 있으면 "제목 — MYR Shop"', () => {
		expect(pageTitle(null)).toBe(DEFAULT_TITLE);
		expect(pageTitle('  ')).toBe(DEFAULT_TITLE);
		expect(pageTitle('다이어트')).toBe('다이어트 — MYR Shop');
	});
	it('clip — 공백 정리 · 넘치면 말줄임으로 n자', () => {
		expect(clip('a  b\n c')).toBe('a b c');
		const long = clip('가'.repeat(200), 150);
		expect(long).toHaveLength(150);
		expect(long.endsWith('…')).toBe(true);
	});
	it('productDescription — 크리에이터·제품·제형·구성 + 레시피 노트, 150자 이내', () => {
		const d = productDescription(p0);
		expect(d.startsWith(`${p0.creator.name}의 ${p0.name}`)).toBe(true);
		expect(d.length).toBeLessThanOrEqual(150);
		const bare: Product = { ...p0, form: '', unit: '', note: '', story: '', howto: '' };
		expect(productDescription(bare)).toBe(`${p0.creator.name}의 ${p0.name}`);
	});
	it('categoryMeta — 크리에이터 > 카테고리 > 전체', () => {
		expect(categoryMeta('diet', null, 3).title).toBe('다이어트');
		expect(categoryMeta('all', null, 8).title).toBe('전체 레시피');
		expect(categoryMeta('diet', p0.creator, 2).title).toBe(`${p0.creator.name}의 레시피`);
		expect(categoryMeta('diet', p0.creator, 2).description).toContain(p0.creator.handle);
	});
});

describe('categoryPath — 같은 목록은 주소 하나', () => {
	it('필터 없음 · 카테고리 · 크리에이터 · 둘 다', () => {
		expect(categoryPath('all', null)).toBe('/category');
		expect(categoryPath('diet', null)).toBe('/category?cat=diet');
		expect(categoryPath('all', 'minji.routine')).toBe('/category?creator=minji.routine');
		expect(categoryPath('diet', 'minji.routine')).toBe('/category?cat=diet&creator=minji.routine');
	});
});

describe('구조화 데이터', () => {
	it('productJsonLd — 가격(KRW) · 재고 · 정식 URL · 크리에이터 브랜드, 평점은 넣지 않는다', () => {
		const ld = productJsonLd(p0, O) as Record<string, any>;
		expect(ld['@type']).toBe('Product');
		expect(ld.url).toBe(`${O}/p/${p0.code}`);
		expect(ld.brand.name).toBe(p0.creator.name);
		expect(ld.offers).toMatchObject({ priceCurrency: 'KRW', price: p0.price, availability: 'https://schema.org/InStock' });
		expect(ld).not.toHaveProperty('aggregateRating');
		expect((productJsonLd({ ...p0, soldOut: true }, O) as Record<string, any>).offers.availability).toBe('https://schema.org/OutOfStock');
	});
	it('productJsonLd 이미지 — 사진 전부(넘겨보기 순서) · 없으면 공유 이미지 하나', () => {
		const imgs = ['https://x.supabase.co/a.jpg', 'https://x.supabase.co/b.jpg'];
		expect((productJsonLd({ ...p0, thumbUrl: imgs[0], images: imgs }, O) as Record<string, any>).image).toEqual(imgs);
		expect((productJsonLd(p0, O) as Record<string, any>).image).toEqual([productImage(p0, O)]);
	});
	it('productImage — 제품 사진이 있으면 그것, 없으면 사이트 기본 og.png', () => {
		expect(productImage({ ...p0, thumbUrl: null }, O)).toBe(`${O}/og.png`);
		expect(productImage({ ...p0, thumbUrl: 'https://cdn.example.com/a.jpg' }, O)).toBe('https://cdn.example.com/a.jpg');
	});
	it('breadcrumbJsonLd — 1부터 순서 · 절대 URL', () => {
		const ld = breadcrumbJsonLd(O, [
			{ name: '홈', path: '/' },
			{ name: '다이어트', path: '/category?cat=diet' }
		]) as Record<string, any>;
		expect(ld.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: '다이어트', item: `${O}/category?cat=diet` });
	});
	it('jsonLdText — </script> 로 태그가 끝나지 않게 < 를 이스케이프', () => {
		const t = jsonLdText({ name: '</script><script>alert(1)</script>' });
		expect(t).not.toContain('<');
		expect(JSON.parse(t).name).toBe('</script><script>alert(1)</script>');
	});
});

describe('robots.txt · sitemap.xml', () => {
	it('robots — 전체 허용 + 제외 경로 전부 + sitemap 주소', () => {
		const r = robotsTxt(O);
		expect(r).toContain('Allow: /\n');
		for (const p of NOINDEX_PREFIXES) expect(r).toContain(`Disallow: ${p}\n`);
		expect(r).toContain(`Sitemap: ${O}/sitemap.xml`);
	});
	it('sitemapPaths — 홈 · 카테고리 7 · 크리에이터 · 상품, 중복 없음', () => {
		const paths = sitemapPaths(MOCK_PRODUCTS);
		expect(paths[0]).toBe('/');
		expect(paths).toContain('/category');
		expect(paths).toContain('/category?cat=diet');
		expect(paths).toContain('/category?creator=minji.routine');
		for (const p of MOCK_PRODUCTS) expect(paths).toContain(`/p/${p.code}`);
		expect(new Set(paths).size).toBe(paths.length);
		expect(sitemapPaths([])).toEqual(['/', '/category', '/category?cat=diet', '/category?cat=inner', '/category?cat=derma', '/category?cat=hair', '/category?cat=mental', '/category?cat=mens']);
	});
	it('sitemapXml — 절대 URL · & 이스케이프', () => {
		const x = sitemapXml(O, ['/', '/category?cat=diet&creator=a']);
		expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(x).toContain(`<loc>${O}/</loc>`);
		expect(x).toContain(`<loc>${O}/category?cat=diet&amp;creator=a</loc>`);
	});
});
