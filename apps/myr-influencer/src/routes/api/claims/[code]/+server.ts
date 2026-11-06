import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { CLAIM_CODE_RE, DECIDE_MESSAGES, parseClaimDecideBody } from '@sellery/myr-core/claim-rules';
import { decideClaim } from '$lib/server/claims';
import { apiSeller } from '$lib/server/seller';

/**
 * 교환 · 환불 요청 승인 · 반려(7번 · 0078) — CS 관리 › 교환 · 환불 상세.
 *   POST { decision: 'approve', resolution, message } | { decision: 'reject', message }
 *     → { ok, claim } · 실패 { ok:false, code, message }
 * 승인 · 반려하면 고객에게 메일. 콘솔은 돈을 움직이지 않는다 — 회수 없이 바로 환불하는 처리(파손 · 누액 환불)도 "환불할 차례" 로 남기고
 * 샵 크론(reconcile · 10분마다)이 토스 부분 취소를 한다(결제 키는 샵에만 · 2026-11-06 대표 결정).
 * 크리에이터 · 계정은 세션에서만(결정 3) — 내 상품 요청인지 · 고를 수 있는 처리 방법인지는 RPC 가 본다.
 */
export const config: Config = { maxDuration: 30 };
const fail = (status: number, code: string) => json({ ok: false, code, message: DECIDE_MESSAGES[code] ?? DECIDE_MESSAGES.DB_ERROR }, { status });

export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	const code = event.params.code.toLowerCase();
	if (!CLAIM_CODE_RE.test(code)) return fail(404, 'NOT_FOUND');
	const body = parseClaimDecideBody(await event.request.json().catch(() => null));
	if (!body) return fail(400, 'BAD_REQUEST');
	const r = await decideClaim(user.id, code, body);
	if (!r.ok) return fail(r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : r.code === 'NOT_PENDING' ? 409 : 400, r.code);
	return json({ ok: true, claim: r.claim });
};
