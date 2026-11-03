import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { parseShipInput, shipMessage } from '$lib/ship-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { listShipOrders, shipOrder } from '$lib/server/ship';

/**
 * 운영 API — 발송 처리(S8 · 0069). 운영 콘솔(myr-admin · M6)이 생기기 전까지 `packages/db/scripts/myr-ops.mjs` 가 부른다.
 *   GET  ?limit=100&shipped=0|1   발송 대기(기본) / 발송된 주문 목록 → { ok, orders }
 *   POST { orderCode, courier, trackingNo }  → { ok, already, order } · 새 기록이면 고객 배송 시작 메일 · 실패 { ok:false, code, message }
 * 인증은 크론과 같은 `CRON_SECRET`(`Authorization: Bearer …`) — 운영자 1명이 터미널에서 쓰는 임시 경로. 콘솔이 생기면 관리자 세션으로 바꾸고 이 라우트는 지운다.
 */
export const config: Config = { maxDuration: 30 };

export const GET: RequestHandler = async ({ request, url }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: shipMessage('NO_SERVICE_KEY') }, { status: 503 });
	const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
	const shipped = url.searchParams.get('shipped') === '1';
	try {
		return json({ ok: true, shipped, orders: await listShipOrders(limit, shipped) });
	} catch (e) {
		console.error('[ops/ship] list failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR', message: shipMessage('DB_ERROR') }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: shipMessage('NO_SERVICE_KEY') }, { status: 503 });
	const parsed = parseShipInput(await request.json().catch(() => null));
	if (!parsed.ok) return json({ ok: false, code: 'BAD_REQUEST', field: parsed.field, message: parsed.message }, { status: 400 });
	const r = await shipOrder(parsed.input);
	if (!r.ok) return json({ ok: false, code: r.code, status: r.status, message: shipMessage(r.code) }, { status: r.code === 'NOT_FOUND' ? 404 : r.code === 'DB_ERROR' ? 500 : 400 });
	return json({ ok: true, already: r.already, order: { code: r.orderCode, status: r.status, courier: r.courier, trackingNo: r.trackingNo, shippedAt: r.shippedAt } });
};
