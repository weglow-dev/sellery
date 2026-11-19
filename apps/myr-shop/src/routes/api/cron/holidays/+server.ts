import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { rejectCron } from '$lib/server/cron';
import { runHolidaySync } from '$lib/server/holidays';

/**
 * GET|POST /api/cron/holidays — 공휴일 자동 동기화(0123 · CRON_SECRET). 매일 03:00(KST · vercel.json `0 18 * * *` UTC).
 *   공공데이터포털 "한국천문연구원 특일 정보"에서 올해 · 내년을 받아 myr_holidays(출처 api)를 맞춘다 — 운영이 넣은 날(manual)은 그대로.
 *   실패(키 만료 · API 오류) · 올해 공휴일이 비어 있으면 운영 할 일 목록(payment_events source 'holidays' · handled=false).
 *   키(DATA_GO_KR_SERVICE_KEY)가 없으면 NO_KEY 로 건너뛴다(200 — Preview · 로컬).
 */
export const config: Config = { maxDuration: 60 };

const handle: RequestHandler = async ({ request }) => {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const r = await runHolidaySync();
	if (!r.ok && r.code === 'DB_ERROR') return json(r, { status: 500 });
	return json(r, { status: 200 });
};
export const GET = handle;
export const POST = handle;
