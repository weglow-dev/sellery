import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { createAdminClient, runCampaignTick } from '$lib/server/db';
import { rejectCron } from '$lib/server/cron';

/**
 * GET|POST /api/cron/campaign-tick — 캠페인 스케줄러 (docs/app-plan.md §12 · docs/brand-console-plan.md §4 "0018" · 프로토타입 helpers.ts autoTick).
 *
 * 인증: `Authorization: Bearer ${CRON_SECRET}`(Vercel Cron 규약 — env 에 CRON_SECRET 이 있으면 Vercel 이 자동으로 붙인다) 또는 `x-cron-secret`. 미설정이면 503.
 * 스케줄: `apps/shop/vercel.json` crons — 매시 5분(UTC). 오늘 판정은 DB 가 Asia/Seoul 달력일로 하므로 KST 자정(UTC 15:00) 직후 첫 실행에서 전이된다.
 * 동작: 0018 `app_campaign_tick()` — SCHEDULE_CONFIRMED · start_date ≤ 오늘 → LIVE(went_live) · LIVE · end_date < 오늘 → CLEARING(ended{due_on}). 멱등.
 * 정산(CLEARING → SETTLED)은 관리자 단계 — 여기서 하지 않는다.
 * 응답 { ok:true, today, wentLive, ended, wentLiveCodes, endedCodes }.
 */
export const config: Config = { maxDuration: 30 };

async function run(request: Request): Promise<Response> {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	try {
		const r = await runCampaignTick(createAdminClient());
		if (r.wentLive || r.ended) console.log(`[campaign-tick] ${r.today} live=${r.wentLiveCodes.join(',') || '-'} ended=${r.endedCodes.join(',') || '-'}`);
		return json(r);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error('[campaign-tick]', message);
		return json({ ok: false, code: 'DB_ERROR', message }, { status: 500 });
	}
}

export const GET: RequestHandler = ({ request }) => run(request);
export const POST: RequestHandler = ({ request }) => run(request);
