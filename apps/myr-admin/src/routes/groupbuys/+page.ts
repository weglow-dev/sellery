import { redirect } from '@sveltejs/kit';

/** 옛 주소 — 공구 링크는 상품 메뉴 안으로 옮겼다(2026-11-27 · /products/groupbuys) */
export const load = ({ url }) => {
	redirect(307, `/products/groupbuys${url.search}`);
};
