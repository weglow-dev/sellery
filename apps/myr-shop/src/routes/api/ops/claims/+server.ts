import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { claimOpsMessage, parseClaimOpsInput } from '@sellery/myr-core/claim-rules';
import { hasAdmin } from '$lib/server/admin';
import { adminClaims, collectClaim, reshipClaim, retryClaimRefund } from '$lib/server/claims';
import { rejectCron } from '$lib/server/cron';

/**
 * 운영 API — 교환·환불 요청 처리(0078). 운영 콘솔(myr-admin)이 생기기 전까지 `packages/db/scripts/myr-ops.mjs claims · collected · reship-claim · claim-refund` 가 부른다.
 *   GET  ?all=1                                         진행 중(처리 대기 · 진행 중) 요청(기본) / 전부 → { ok, claims }
 *   POST { code, action: 'collected' }                  회수 확인 → 환불할 차례면 바로 환불(토스 · actor admin)
 *   POST { code, action: 'refund' }                     환불만 다시(승인 · 회수 직후 환불이 실패했을 때 — 크론도 5분 뒤 다시 한다)
 *   POST { code, action: 'reship', courier, trackingNo } 교환 재발송 송장 → 고객 메일(새 기록일 때)
 * 인증은 크론과 같은 `CRON_SECRET`(`Authorization: Bearer …`) — /api/ops/ship 과 같은 임시 경로. 콘솔이 생기면 관리자 세션으로 바꾸고 지운다.
 */
export const config: Config = { maxDuration: 30 };
const fail = (status: number, code: string, extra: Record<string, unknown> = {}) => json({ ok: false, code, message: claimOpsMessage(code), ...extra }, { status });

export const GET: RequestHandler = async ({ request, url }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return fail(503, 'NO_SERVICE_KEY');
	try {
		return json({ ok: true, claims: await adminClaims(url.searchParams.get('all') !== '1') });
	} catch (e) {
		console.error('[ops/claims] list failed:', e instanceof Error ? e.message : e);
		return fail(500, 'DB_ERROR');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return fail(503, 'NO_SERVICE_KEY');
	const parsed = parseClaimOpsInput(await request.json().catch(() => null));
	if (!parsed.ok) return json({ ok: false, code: 'BAD_REQUEST', field: parsed.field, message: parsed.message }, { status: 400 });
	const p = parsed.input;
	const r = p.action === 'reship' ? await reshipClaim(p.code, p.courier, p.trackingNo) : p.action === 'collected' ? await collectClaim(p.code) : await retryClaimRefund(p.code);
	if (!r.ok) return fail(r.code === 'NOT_FOUND' ? 404 : r.code === 'DB_ERROR' ? 500 : 400, r.code);
	return json({ ok: true, already: r.already, claim: r.claim, refund: r.refund ?? null, mailed: r.mailed ?? null });
};
