import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { parseSettlementMonth } from '@sellery/myr-core/settlement-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runSettlementCron } from '$lib/server/settlement';

/**
 * GET|POST /api/cron/settle — MYR 정산 회차(0087 · CRON_SECRET). 매일 13:00(KST · vercel.json `0 4 * * *` UTC · 0106).
 *   정산할 차례인 달(DB myr_settlement_due — 마지막 회차 다음 달 · 끝난 달만)을 계산하고 바로 확정한다 — 제조 원장이 없는 상품만 보류.
 *   차례인 달이 없으면 { nothing: true } 로 바로 끝난다(평소 2일~말일). 1일에 실패해도 다음 날 같은 달을 다시 돈다 · 한 번에 한 달.
 *   자동 실행 실패는 운영 할 일 목록(payment_events source 'settlement' · handled=false).
 *   ?month=YYYY-MM 으로 특정 달(수동) — 끝난 달만 · 더 늦은 회차가 있으면 OUT_OF_ORDER.
 */
export const config: Config = { maxDuration: 300 };

const handle: RequestHandler = async ({ request, url }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const q = url.searchParams.get('month');
	const month = q ? parseSettlementMonth(q) : null;
	if (q && !month) return json({ ok: false, code: 'BAD_MONTH' }, { status: 400 });
	const r = await runSettlementCron(month);
	if (!r.ok) console.error('[cron/settle]', month ?? 'due', r.code);
	return json(r, { status: r.ok ? 200 : r.code === 'DB_ERROR' ? 500 : 400 });
};
export const GET = handle;
export const POST = handle;
