import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { prepareManually } from '$lib/server/fulfillment';

/**
 * 운영 API — 배송준비중 수동 전환(0077). 이벗 연동 전 운영팀이 물류센터에 주문을 넘길 때 `packages/db/scripts/myr-ops.mjs prepare` 가 부른다.
 *   GET  ?before=<ISO>          대상(결제완료 줄 · before 전 결제 · 기본 지금) — 바꾸지 않는다(CSV 확인용)
 *   POST { before?: ISO }       대상 줄 → 배송준비중 → { ok, count, orders, lines }
 * 인증은 /api/ops/ship 과 같은 `CRON_SECRET`. 운영 콘솔(myr-admin)이 생기면 관리자 세션으로 바꾸고 이 라우트는 지운다.
 */
export const config: Config = { maxDuration: 60 };

function cutoffOf(v: unknown): Date | null {
	if (v == null || v === '') return new Date();
	const d = new Date(String(v));
	return Number.isFinite(d.getTime()) ? d : null;
}

export const GET: RequestHandler = async ({ request, url }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const cutoff = cutoffOf(url.searchParams.get('before'));
	if (!cutoff) return json({ ok: false, code: 'BAD_REQUEST', message: 'before 는 ISO 시각' }, { status: 400 });
	try {
		const r = await prepareManually(cutoff, true);
		return json({ ok: true, dryRun: true, count: r.lines.length, orders: r.orders, lines: r.lines });
	} catch (e) {
		console.error('[ops/prepare] list failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const body = (await request.json().catch(() => ({}))) as { before?: unknown };
	const cutoff = cutoffOf(body?.before);
	if (!cutoff) return json({ ok: false, code: 'BAD_REQUEST', message: 'before 는 ISO 시각' }, { status: 400 });
	try {
		const r = await prepareManually(cutoff, false);
		return json({ ok: true, dryRun: false, count: r.count, orders: r.orders, lines: r.lines });
	} catch (e) {
		console.error('[ops/prepare] failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
	}
};
