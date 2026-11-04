import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sellerCtxOf } from '$lib/server/seller';

/** 콘솔 게이트의 안내 화면(suspended) — 상태가 바뀌었으면(연결됨 · 정지 해제) 콘솔로, 다른 상태면 그 안내로 */
export const load: PageServerLoad = async (event) => {
	const ctx = await sellerCtxOf(event);
	if (ctx.state === 'ok') redirect(303, '/');
	if (ctx.state !== 'suspended') redirect(303, ctx.state === 'anon' ? '/login' : '/' + ctx.state);
	return { email: ctx.user.email ?? null };
};
