/** 0056 공개 RPC 응답(`myr_home_products` · `myr_product_card`) 의 행 1건 → `Product`. 순수 모듈 — 테스트 `src/test/product-row.test.ts`.
 *  서버(`lib/server/db.ts`)만 부르지만 `$env` 를 import 하지 않아 vitest 에서 바로 돌릴 수 있다. */
import { genericDetail, type Creator, type Product } from './data';

export type Row = Record<string, unknown>;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function creatorOfRow(c: unknown): Creator {
	const r = (c ?? {}) as Row;
	return { id: str(r.id), name: str(r.name, '크리에이터'), handle: str(r.handle, '@'), avatarUrl: typeof r.avatar_url === 'string' ? r.avatar_url : null };
}

/** 상세 섹션이 비어 있으면 기본 템플릿(운영 스크립트가 채우지만 방어) · tag 는 BEST/NEW 만 · 타일 없으면 회색 */
export function fromRow(r: Row): Product {
	const ingredients = arr<string>(r.ingredients);
	const howto = str(r.howto);
	const fallback = genericDetail({ ingredients, howto });
	const tag = str(r.tag);
	return {
		id: str(r.id),
		code: str(r.code),
		cat: str(r.category),
		creator: creatorOfRow(r.creator),
		name: str(r.name),
		price: typeof r.price === 'number' ? r.price : 0,
		unit: str(r.unit),
		tile: str(r.tile, 'linear-gradient(145deg,#6b7280,#262a33)'),
		thumbUrl: typeof r.thumb_url === 'string' ? r.thumb_url : null,
		ic: str(r.icon, 'pill'),
		form: str(r.form),
		pack: str(r.pack),
		flavor: str(r.flavor),
		tag: tag === 'BEST' || tag === 'NEW' ? tag : '',
		chips: arr<string>(r.chips),
		ingredients,
		note: str(r.note),
		howto,
		specs: arr(r.specs),
		soldOut: r.sold_out === true,
		storyTitle: str(r.story_title) || fallback.storyTitle,
		story: str(r.story) || fallback.story,
		points: arr(r.points).length ? arr(r.points) : fallback.points,
		ingredientRows: arr(r.ingredient_rows).length ? arr(r.ingredient_rows) : fallback.ingredientRows,
		howtoTitle: str(r.howto_title) || fallback.howtoTitle,
		howtoSteps: arr(r.howto_steps).length ? arr(r.howto_steps) : fallback.howtoSteps,
		faq: arr(r.faq).length ? arr(r.faq) : fallback.faq
	};
}
