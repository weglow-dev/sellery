/**
 * 콘솔 게이트 — 모든 콘솔 page load · form action 이 부른다(레이아웃에만 두지 않는다 · `@sellery/myr-core/server/seller` 주석).
 *   const seller = await requireSeller(event);   // ok 가 아니면 로그인 · /unlinked · /suspended 로 redirect(throw)
 * 요청당 한 번만 DB 를 본다(`locals.sellerCtx`). seller.id 는 이후 콘솔 RPC 의 유일한 소유자 값(결정 3).
 */
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { gateLocation } from '$lib/console-auth';
import './env';
import { hasAdmin } from '@sellery/myr-core/server/admin';
import { sellerContext, type SellerContext, type SellerSummary } from '@sellery/myr-core/server/seller';

export type { SellerContext, SellerSummary };

export function sellerCtxOf(event: RequestEvent): Promise<SellerContext> {
	event.locals.sellerCtx ??= event.locals.safeGetSession().then(({ user }) => {
		// 크리에이터 연결은 service role 로 조회한다 — 키가 없으면(Vercel 환경변수 누락) 원인이 보이는 503 으로
		if (user && !hasAdmin()) {
			console.error('[seller] SUPABASE_SERVICE_ROLE_KEY 없음 — docs/deploy.md 크리에이터 콘솔 절');
			error(503, { message: '콘솔 서버 설정이 아직 끝나지 않았어요. 잠시 후 다시 시도해주세요.' });
		}
		return sellerContext(user);
	});
	return event.locals.sellerCtx;
}

export async function requireSeller(event: RequestEvent): Promise<SellerSummary> {
	const ctx = await sellerCtxOf(event);
	const to = gateLocation(ctx.state, event.url.pathname + event.url.search);
	if (to || ctx.state !== 'ok') redirect(303, to ?? '/login');
	return ctx.seller;
}
