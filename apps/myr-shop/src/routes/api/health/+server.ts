import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { healthBody, type HealthChecks } from '$lib/health';
import { admin, hasAdmin } from '$lib/server/admin';

/**
 * GET /api/health — 배포 뒤 서버 비밀 점검 (apps/shop api/health 의 골격 복사 · docs/deploy.md MYR 표 "배포 후 확인").
 * 로그인 없이 `SUPABASE_SERVICE_ROLE_KEY` 가 **실제로 이 프로젝트의 키인지** 본다 — service role 로 `myr_cart_get(null)`(빈 배열) 1회.
 * 키가 없으면(미설정) · 다른 프로젝트 키면(Invalid API key) · anon 키면(권한 없음) fail. 데이터는 돌려주지 않는다.
 * 전부 ok 면 200, 아니면 503. 원인은 Vercel Logs 에만(공개 엔드포인트). 토스 키 검사는 결제(S4b)가 들어올 때 더한다.
 */
export const GET: RequestHandler = async () => {
	const checks: HealthChecks = { supabaseAdmin: 'fail' };
	if (!hasAdmin()) {
		console.error('[health] supabase admin: SUPABASE_SERVICE_ROLE_KEY 또는 PUBLIC_SUPABASE_URL 미설정');
	} else {
		try {
			const { error } = await admin().rpc('myr_cart_get', { p_user_id: null });
			if (error) console.error('[health] supabase admin:', error.message);
			else checks.supabaseAdmin = 'ok';
		} catch (e) {
			console.error('[health] supabase admin:', e instanceof Error ? e.message : e);
		}
	}
	const { status, body } = healthBody(checks);
	return json(body, { status, headers: { 'cache-control': 'no-store' } });
};
