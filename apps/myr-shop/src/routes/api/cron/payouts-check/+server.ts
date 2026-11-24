import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runPayoutCheckCron } from '$lib/server/payout-run';

/**
 * GET|POST /api/cron/payouts-check — MYR 토스 지급 결과 확인(0127 · CRON_SECRET). 매시간 20분(vercel.json `20 * * * *`).
 *   송금 중(토스 id 있음) → 토스에 조회해 완료 · 실패를 적는다 · 결과 확인 필요(응답 없음) → 같은 멱등 키로 다시 요청(요청할 수 있는 시간에만 — DB myr_payout_check_list).
 *   웹훅 payout.changed 가 먼저 오면 이미 적혀 있어 목록에서 빠진다. 지급대행 키가 없으면 NOT_CONFIGURED.
 */
export const config: Config = { maxDuration: 300 };

const handle: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const r = await runPayoutCheckCron();
	if (!r.ok) console.error('[cron/payouts-check]', r.code);
	return json(r, { status: r.ok || r.code === 'NOT_CONFIGURED' ? 200 : 500 });
};
export const GET = handle;
export const POST = handle;
