import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { GB_CODE_RE } from '@sellery/myr-core/groupbuy';
import { GB_ARRIVED_COOKIE, GB_ARRIVED_MAX_AGE, GB_COOKIE, GB_COOKIE_MAX_AGE, readGbCookie, writeGbCookie } from '$lib/groupbuy-link';
import { hasAdmin } from '$lib/server/admin';
import { lookupGroupbuy } from '$lib/server/groupbuy';

/**
 * 공구 링크 `/g/<code>`(0086) — 크리에이터가 공유하는 주소. 공구를 찾으면 쿠키 `myr_gb` 에 기억하고 상품 페이지로 보낸다(303).
 * 시작 전 · 끝난 공구도 상품 페이지로 보낸다 — 상품 페이지가 "공구 예정" · "종료된 공구" 를 보여 준다. 없는 링크 · 샵에 없는 상품이면 404.
 * 쿠키 `myr_gb_new`(1분) = 링크로 막 들어왔다는 표시 — 상품 페이지 서버가 한 번 읽고 지운다. 끝난 공구면 그때만 토스트(다시 볼 때는 안 띄운다).
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const code = params.code.trim().toLowerCase();
	if (!GB_CODE_RE.test(code)) error(404, { message: '공구 링크를 찾을 수 없어요' });
	if (!hasAdmin()) {
		console.error('[g] SUPABASE_SERVICE_ROLE_KEY 없음 — 공구 링크 비활성');
		error(503, { message: '잠시 후 다시 시도해주세요' });
	}
	const found = await lookupGroupbuy(code);
	if (!found) error(404, { message: '공구 링크를 찾을 수 없어요' });
	cookies.set(GB_COOKIE, writeGbCookie(readGbCookie(cookies.get(GB_COOKIE)), found.productCode, code), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: GB_COOKIE_MAX_AGE
	});
	cookies.set(GB_ARRIVED_COOKIE, found.productCode, { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: GB_ARRIVED_MAX_AGE });
	redirect(303, `/p/${found.productCode}`);
};
