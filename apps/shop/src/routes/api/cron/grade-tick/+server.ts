import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { createAdminClient, runGradeTick } from '$lib/server/db';
import { rejectCron } from '$lib/server/cron';

/**
 * GET|POST /api/cron/grade-tick — 등급 월간 재계산 (0032 `app_grade_recalc_all`).
 *
 * 인증: `Authorization: Bearer ${CRON_SECRET}`(Vercel Cron 규약 — env 에 CRON_SECRET 이 있으면 Vercel 이 자동으로 붙인다)
 *   또는 `x-cron-secret`. 미설정이면 503. `campaign-tick` 과 같은 `rejectCron`.
 * 스케줄: `apps/shop/vercel.json` crons — 매월 1일 00:05 UTC = KST 09:05(같은 날짜). KST 자정 기준으로 돌리려면
 *   전월 말일 15:05 UTC 여야 하는데 말일이 28~31 로 바뀌고 Vercel cron 에 `L` 이 없어 UTC 1일로 둔다.
 *   등급은 달 단위 기준이라 그날 안에 돌면 된다.
 * 동작: 인플루언서·브랜드 전원의 `m3_sales`/GMV 를 다시 계산하고 트리거가 등급을 맞춘다. 멱등.
 *   운영 결정(2026-10-02): 매월 1일 전원 재계산 · 판매가 끊기면 강등. 지급은 정산 실행 시점 등급
 *   (등급 보너스는 플랫폼 부담이라 브랜드 계약을 깨지 않는다 — settlement-policy §1).
 * 응답 { ok:true, today, baseBackfilled, sellers, brands, sellersChanged, brandsChanged, changedSellers[], changedBrands[] }.
 *   `baseBackfilled > 0` 이면 `m3_sales_base` 가 0 인 행을 보정했다는 뜻 — 이관 경로를 점검해야 한다(0032 주석).
 *   등급이 바뀐 건은 "s1 다이아→플래티넘" 형태로 로그에 남긴다.
 */
export const config: Config = { maxDuration: 60 };

async function run(request: Request): Promise<Response> {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	try {
		const r = await runGradeTick(createAdminClient());
		if (!r) return json({ ok: false, code: 'DB_ERROR', message: 'app_grade_recalc_all failed' }, { status: 500 });
		if (r.baseBackfilled > 0) console.warn(`[grade-tick] ${r.today} m3_sales_base 보정 ${r.baseBackfilled}건 — 이관 경로 점검 필요`);
		if (r.sellersChanged || r.brandsChanged) {
			console.log(
				`[grade-tick] ${r.today} 인플루언서 ${r.sellersChanged}/${r.sellers} [${r.changedSellers.join(', ') || '-'}] · 브랜드 ${r.brandsChanged}/${r.brands} [${r.changedBrands.join(', ') || '-'}]`
			);
		}
		return json(r);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error('[grade-tick]', message);
		return json({ ok: false, code: 'DB_ERROR', message }, { status: 500 });
	}
}

export const GET: RequestHandler = ({ request }) => run(request);
export const POST: RequestHandler = ({ request }) => run(request);
