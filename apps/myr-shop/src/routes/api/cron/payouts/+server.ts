import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runPayoutSendCron } from '$lib/server/payout-run';

/**
 * GET|POST /api/cron/payouts — MYR 토스 지급대행 자동 이체(0127 · CRON_SECRET). 평일 13:05(KST · vercel.json `5 4 * * 1-5` UTC — 정산 크론 13:00 바로 뒤).
 *   보낼 지급 건(DB myr_payout_send_list — 영업일 · 08~15시 · 지급 가능 · 토스 인증 완료)마다 시작(잔액 · 하루 한도 가드) → 토스 바로지급 → 결과.
 *   공휴일은 DB 가 빈 목록을 돌려준다(myr_payout_send_window). 지급대행 키가 없으면 NOT_CONFIGURED(로컬 · Preview).
 *   거절 · 실패는 지급 건에 남는다(재시도 · 계좌 · 운영 · 결과 확인 필요) — 다음 영업일 · 매시간 확인(/api/cron/payouts-check)이 이어 간다.
 */
export const config: Config = { maxDuration: 300 };

const handle: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const r = await runPayoutSendCron();
	if (!r.ok) console.error('[cron/payouts]', r.code);
	return json(r, { status: r.ok || r.code === 'NOT_CONFIGURED' ? 200 : 500 });
};
export const GET = handle;
export const POST = handle;
