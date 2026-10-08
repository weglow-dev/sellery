import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { inAlertSendWindow, kstHourOf } from '@sellery/db/campaign-alerts';
import { createAdminClient, runCampaignTick, sendDueCampaignAlerts } from '$lib/server/db';
import { rejectCron } from '$lib/server/cron';

/**
 * GET|POST /api/cron/campaign-tick — 캠페인 스케줄러 (docs/app-plan.md §12 · docs/brand-console-plan.md §4 "0018" · 프로토타입 helpers.ts autoTick).
 *
 * 인증: `Authorization: Bearer ${CRON_SECRET}`(Vercel Cron 규약 — env 에 CRON_SECRET 이 있으면 Vercel 이 자동으로 붙인다) 또는 `x-cron-secret`. 미설정이면 503.
 * 스케줄: `apps/shop/vercel.json` crons — 매시 5분(UTC). 오늘 판정은 DB 가 Asia/Seoul 달력일로 하므로 KST 자정(UTC 15:00) 직후 첫 실행에서 전이된다.
 * 동작: 0018 `app_campaign_tick()` — SCHEDULE_CONFIRMED · start_date ≤ 오늘 → LIVE(went_live) · LIVE · end_date < 오늘 → CLEARING(ended{due_on}). 멱등.
 * 정산(CLEARING → SETTLED)은 관리자 단계 — 여기서 하지 않는다.
 *
 * **오픈 알림 발송(0044)** 은 전이와 **분리**한다. 전이는 KST 00:05 에 일어나는데 그때 메일을 보내면
 * 새벽에 도착한다 — `inAlertSendWindow`(KST 8~22시) 안에서만 보낸다. 매시 도는 크론이라 창에 들어온
 * 첫 틱에서 그날 신청자 전원이 처리되고, `sent_at` 으로 멱등이라 이후 틱은 0건이다.
 * 발송 실패는 응답에 숫자로만 남기고 전이 결과를 막지 않는다(`sendDueCampaignAlerts` 는 throw 하지 않는다).
 *
 * 응답 { ok:true, today, wentLive, ended, wentLiveCodes, endedCodes, alerts? }.
 */
export const config: Config = { maxDuration: 60 };

async function run(request: Request): Promise<Response> {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	try {
		const admin = createAdminClient();
		const r = await runCampaignTick(admin);
		if (r.wentLive || r.ended) console.log(`[campaign-tick] ${r.today} live=${r.wentLiveCodes.join(',') || '-'} ended=${r.endedCodes.join(',') || '-'}`);

		// 오픈 알림 — 아침 창에서만. 창 밖이면 건너뛴다(다음 틱이 보낸다)
		const hour = kstHourOf();
		if (!inAlertSendWindow(hour)) return json({ ...r, alerts: { skipped: 'outside_window', kstHour: hour } });
		const alerts = await sendDueCampaignAlerts(admin);
		if (alerts.due) console.log(`[campaign-tick] alerts due=${alerts.due} sent=${alerts.sent} failed=${alerts.failed} skipped=${alerts.skipped}`);
		return json({ ...r, alerts });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error('[campaign-tick]', message);
		return json({ ok: false, code: 'DB_ERROR', message }, { status: 500 });
	}
}

export const GET: RequestHandler = ({ request }) => run(request);
export const POST: RequestHandler = ({ request }) => run(request);
