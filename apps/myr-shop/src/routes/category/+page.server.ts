import type { PageServerLoad } from './$types';
import { CATS, catName, creatorsOf, handleSlug } from '$lib/data';
import { listProducts } from '$lib/server/db';

/** 카테고리 — `?cat=<id>` · `?creator=<handle slug>` 필터는 서버에서 적용(상태는 URL 에만) */
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const catParam = url.searchParams.get('cat');
	const cat = CATS.some((c) => c.id === catParam) ? (catParam as string) : 'all';
	const creatorParam = handleSlug(url.searchParams.get('creator') ?? '');
	const { products, source } = await listProducts();
	const creator = creatorParam ? (creatorsOf(products).find((c) => handleSlug(c.handle) === creatorParam) ?? null) : null;
	const list = products.filter((p) => (cat === 'all' || p.cat === cat) && (!creator || p.creator.id === creator.id));
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	return { cat, creator, creatorParam, list, title: creator ? creator.name : catName(cat), source };
};
