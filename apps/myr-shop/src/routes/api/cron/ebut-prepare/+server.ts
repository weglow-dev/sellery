import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runEbutPrepare } from '$lib/server/fulfillment';

/**
 * GET|POST /api/cron/ebut-prepare — 평일 11시(KST) 이벗 발주(E2 · 0077 · vercel.json `0 2 * * 1-5` UTC · CRON_SECRET).
 *   오늘 11시 전 결제 주문의 결제완료 줄 → 이벗 등록 → 성공한 줄만 배송준비중 · 주문 단위 3회 재시도(바인허브 OrderStatusToPreparing).
 *   이벗 키(EBUT_*)가 없으면 아무것도 하지 않고 { ok, skipped: 'disabled' }.
 */
export const config: Config = { maxDuration: 300 };

const handle: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	try {
		return json({ ok: true, ...(await runEbutPrepare()) });
	} catch (e) {
		console.error('[cron/ebut-prepare] failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'FAILED' }, { status: 500 });
	}
};
export const GET = handle;
export const POST = handle;
