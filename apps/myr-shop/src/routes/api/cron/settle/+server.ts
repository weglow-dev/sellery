import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { parseSettlementMonth, previousSettlementMonth } from '@sellery/myr-core/settlement-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runSettlement } from '$lib/server/settlement';

/**
 * GET|POST /api/cron/settle — 매월 1일 13:00(KST) MYR 정산 회차(0087 · vercel.json `0 4 1 * *` UTC · CRON_SECRET).
 *   지난달(KST) 회차를 계산하고 바로 확정한다 — 제조 원장이 없는 상품만 보류. 이미 돌았으면 { already: true }(멱등).
 *   ?month=YYYY-MM 으로 특정 달(수동 · 크론이 실패했을 때) — 끝난 달만 · 더 늦은 회차가 있으면 OUT_OF_ORDER.
 */
export const config: Config = { maxDuration: 300 };

const handle: RequestHandler = async ({ request, url }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const q = url.searchParams.get('month');
	const month = q ? parseSettlementMonth(q) : previousSettlementMonth();
	if (!month) return json({ ok: false, code: 'BAD_MONTH' }, { status: 400 });
	const r = await runSettlement(month, 'cron');
	if (!r.ok) console.error('[cron/settle]', month, r.code);
	return json(r, { status: r.ok ? 200 : r.code === 'DB_ERROR' ? 500 : 400 });
};
export const GET = handle;
export const POST = handle;
