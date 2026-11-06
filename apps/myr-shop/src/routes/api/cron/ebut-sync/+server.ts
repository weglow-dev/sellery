import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runEbutShipSync } from '$lib/server/fulfillment';

/**
 * GET|POST /api/cron/ebut-sync — 매일 18시(KST) 이벗 송장 수집(E3 · 0077 · vercel.json `0 9 * * *` UTC · CRON_SECRET).
 *   이벗에 등록된 배송준비중 · 배송중 줄 → 송장 · 배송중/배송완료 · 새 송장이면 고객 배송 시작 메일(같은 송장은 한 통) → 남은 배송준비중은 지연 표시
 *   (바인허브 OrderStatusToDeliveringOrDelivered). 이벗 키가 없으면 { ok, skipped: 'disabled' }.
 */
export const config: Config = { maxDuration: 300 };

const handle: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	try {
		return json({ ok: true, ...(await runEbutShipSync()) });
	} catch (e) {
		console.error('[cron/ebut-sync] failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'FAILED' }, { status: 500 });
	}
};
export const GET = handle;
export const POST = handle;
